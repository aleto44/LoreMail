#!/usr/bin/env node
/**
 * generate-vapid-keys.mjs
 *
 * One-time script to generate a VAPID key pair for Web Push notifications.
 * Run with: node scripts/generate-vapid-keys.mjs
 *
 * Then store the output as Cloudflare Worker secrets:
 *   cd apps/worker
 *   wrangler secret put VAPID_PUBLIC_KEY   # paste the public key
 *   wrangler secret put VAPID_PRIVATE_KEY  # paste the private key JWK JSON
 *   wrangler secret put VAPID_SUBJECT      # paste mailto:you@example.com
 */

function b64url(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

const keyPair = await crypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' },
  true,
  ['sign', 'verify'],
);

const publicKeyRaw = new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey));
const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);

const publicKeyB64 = b64url(publicKeyRaw);
const privateKeyJson = JSON.stringify(privateKeyJwk);

console.log('\n╔══════════════════════════════════════════════════╗');
console.log('║         LOREMAIL VAPID KEYS GENERATED            ║');
console.log('╚══════════════════════════════════════════════════╝\n');
console.log('Run these 3 commands from apps/worker/ to store them as secrets:\n');
console.log('  wrangler secret put VAPID_PUBLIC_KEY');
console.log(`  └─ value: ${publicKeyB64}\n`);
console.log('  wrangler secret put VAPID_PRIVATE_KEY');
console.log(`  └─ value: ${privateKeyJson}\n`);
console.log('  wrangler secret put VAPID_SUBJECT');
console.log('  └─ value: mailto:admin@loremail.app  (or your email)\n');
console.log('Also update apps/worker/wrangler.toml WORKER_URL var if needed.\n');
