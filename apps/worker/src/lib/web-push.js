/**
 * web-push.js — Web Push Message Encryption + VAPID JWT
 *
 * Implements RFC 8291 (message encryption) and RFC 8292 (VAPID)
 * using only the Web Crypto API — no npm packages, fully compatible
 * with the Cloudflare Workers runtime.
 */

const enc = new TextEncoder();

// ─── Base64url helpers ────────────────────────────────────────────────────────

function b64url(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function b64urlDecode(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(
    str.length + (4 - (str.length % 4)) % 4, '=',
  );
  const binary = atob(padded);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

function concat(...arrays) {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

// ─── HMAC / HKDF primitives ───────────────────────────────────────────────────

async function hmacSha256(key, data) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

/** HKDF-Extract: PRK = HMAC-SHA-256(salt, IKM) */
const hkdfExtract = (salt, ikm) => hmacSha256(salt, ikm);

/** HKDF-Expand, single block (L ≤ 32): T(1) = HMAC-SHA-256(PRK, info || 0x01) */
async function hkdfExpand(prk, info, length) {
  const t = await hmacSha256(prk, concat(info, Uint8Array.from([1])));
  return t.slice(0, length);
}

// ─── RFC 8291 — payload encryption ────────────────────────────────────────────

/**
 * Encrypt a plaintext string for delivery to a Web Push subscription.
 * Returns a Uint8Array with the full aes128gcm content-coding body.
 */
export async function encryptWebPush(plaintext, p256dhBase64, authBase64) {
  const uaPublicBytes = b64urlDecode(p256dhBase64);
  const authSecret = b64urlDecode(authBase64);
  const messageBytes = enc.encode(typeof plaintext === 'string' ? plaintext : JSON.stringify(plaintext));

  // Import UA (browser) public key for ECDH
  const uaPublicKey = await crypto.subtle.importKey(
    'raw', uaPublicBytes,
    { name: 'ECDH', namedCurve: 'P-256' }, false, [],
  );

  // Generate ephemeral sender (application-server) key pair
  const asKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'],
  );
  const asPublicBytes = new Uint8Array(await crypto.subtle.exportKey('raw', asKeyPair.publicKey));

  // ECDH(as_private, ua_public) → shared secret
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaPublicKey }, asKeyPair.privateKey, 256),
  );

  // RFC 8291 §3.4 Key Derivation
  // 1. PRK_key = HKDF-Extract(salt=auth_secret, IKM=ecdh_secret)
  const prkKey = await hkdfExtract(authSecret, ecdhSecret);

  // 2. IKM = HKDF-Expand(PRK_key, "WebPush: info\0" || ua_pub || as_pub, 32)
  const keyInfo = concat(enc.encode('WebPush: info\x00'), uaPublicBytes, asPublicBytes);
  const ikm = await hkdfExpand(prkKey, keyInfo, 32);

  // 3. Random 16-byte salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // 4. PRK = HKDF-Extract(salt=salt, IKM=ikm)
  const prk = await hkdfExtract(salt, ikm);

  // 5. CEK = HKDF-Expand(PRK, "Content-Encoding: aes128gcm\0", 16)
  const cek = await hkdfExpand(prk, enc.encode('Content-Encoding: aes128gcm\x00'), 16);

  // 6. nonce = HKDF-Expand(PRK, "Content-Encoding: nonce\0", 12)
  const nonce = await hkdfExpand(prk, enc.encode('Content-Encoding: nonce\x00'), 12);

  // 7. AES-128-GCM encrypt (plaintext + 0x02 padding delimiter)
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const padded = concat(messageBytes, Uint8Array.from([0x02]));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, padded),
  );

  // 8. Build RFC 8291 aes128gcm content-coding header:
  //    [salt 16B][record-size 4B big-endian][idlen 1B][as_public_key 65B]
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096, false);
  const header = concat(salt, rs, Uint8Array.from([65]), asPublicBytes);

  return concat(header, ciphertext);
}

// ─── RFC 8292 — VAPID JWT ─────────────────────────────────────────────────────

/**
 * Create a VAPID JWT and return the full Authorization header value.
 * @param {string} endpoint  — push endpoint URL (origin extracted from it)
 * @param {object} privateKeyJwk — EC P-256 private key as JWK object
 * @param {string} publicKeyB64  — base64url raw uncompressed public key (65 bytes)
 * @param {string} subject       — "mailto:..." or HTTPS URL
 */
export async function createVapidAuthHeader(endpoint, privateKeyJwk, publicKeyB64, subject) {
  const origin = new URL(endpoint).origin;
  const now = Math.floor(Date.now() / 1000);

  const headerB64 = b64url(enc.encode(JSON.stringify({ alg: 'ES256', typ: 'JWT' })));
  const payloadB64 = b64url(enc.encode(JSON.stringify({
    aud: origin,
    exp: now + 43200, // 12 hours
    sub: subject,
  })));
  const signingInput = `${headerB64}.${payloadB64}`;

  const privateKey = await crypto.subtle.importKey(
    'jwk', privateKeyJwk,
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, enc.encode(signingInput)),
  );

  return `vapid t=${signingInput}.${b64url(signature)},k=${publicKeyB64}`;
}

// ─── High-level send ──────────────────────────────────────────────────────────

/**
 * Send a Web Push notification to a single subscription.
 *
 * @param {object} subscription — { endpoint, keys: { p256dh, auth } }
 * @param {string|object} payload — notification payload (stringified if object)
 * @param {object} env — Cloudflare Worker env with VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
 * @returns {Response} the push service response
 */
export async function sendWebPush(subscription, payload, env) {
  const { endpoint, keys } = subscription;

  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    throw new Error('VAPID keys not configured. Run scripts/generate-vapid-keys.mjs and set Worker secrets.');
  }

  const privateKeyJwk = JSON.parse(env.VAPID_PRIVATE_KEY);
  const vapidAuth = await createVapidAuthHeader(
    endpoint, privateKeyJwk, env.VAPID_PUBLIC_KEY, env.VAPID_SUBJECT ?? 'mailto:admin@loremail.app',
  );

  let body;
  const headers = {
    Authorization: vapidAuth,
    TTL: '86400',
    Urgency: 'normal',
  };

  if (payload !== null && payload !== undefined && keys?.p256dh && keys?.auth) {
    const encrypted = await encryptWebPush(
      typeof payload === 'object' ? JSON.stringify(payload) : String(payload),
      keys.p256dh,
      keys.auth,
    );
    body = encrypted;
    headers['Content-Type'] = 'application/octet-stream';
    headers['Content-Encoding'] = 'aes128gcm';
  }

  const response = await fetch(endpoint, { method: 'POST', headers, body });

  // 201 = created (FCM), 200 = ok, 410/404 = subscription expired/invalid
  if (!response.ok && response.status !== 201) {
    const text = await response.text().catch(() => '');
    console.warn(`Web Push delivery failed [${response.status}]: ${text}`);
  }

  return response;
}
