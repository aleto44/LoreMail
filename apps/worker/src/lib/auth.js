import { json } from '../index.js';

/**
 * Validate a passphrase against a bcrypt hash.
 * Workers don't have a native bcrypt — we use a lightweight PBKDF2-based approach
 * stored as "pbkdf2:<salt>:<hash>".
 */
export async function hashPassphrase(passphrase) {
  const salt = crypto.randomUUID().replace(/-/g, '');
  const key = await pbkdf2(passphrase, salt);
  return `pbkdf2:${salt}:${key}`;
}

export async function verifyPassphrase(passphrase, stored) {
  if (!stored || !stored.startsWith('pbkdf2:')) return false;
  const [, salt, expected] = stored.split(':');
  const actual = await pbkdf2(passphrase, salt);
  return timingSafeEqual(actual, expected);
}

async function pbkdf2(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  return bufToHex(bits);
}

function bufToHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Require body fields — returns error response or null */
export async function requireBody(request, fields) {
  let body;
  try {
    body = await request.json();
  } catch {
    return { error: json({ error: 'Invalid JSON body' }, 400), data: null };
  }
  for (const field of fields) {
    if (!body[field]) return { error: json({ error: `Missing required field: ${field}` }, 400), data: null };
  }
  return { error: null, data: body };
}

/** Generate a random word-based passphrase (3 words) */
export function generatePassphrase() {
  const words = [
    'wolf','runs','midnight','silver','thorn','ember','glass','hollow','iron','veil',
    'ashen','cold','forge','mist','ridge','salt','stone','tide','vale','worn',
    'arch','bell','crest','drift','fell','grant','holt','isle','knoll','lane',
  ];
  const pick = () => words[Math.floor(Math.random() * words.length)];
  return `${pick()} · ${pick()} · ${pick()}`;
}

/** Generate a slug from game name */
export function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40);
}

/** Read game data from KV */
export async function getGame(env, gameId) {
  const raw = await env.KV.get(`game:${gameId}`);
  return raw ? JSON.parse(raw) : null;
}

/** Write game data to KV */
export async function putGame(env, gameId, data) {
  await env.KV.put(`game:${gameId}`, JSON.stringify(data));
}

/** Require valid passphrase for a game — returns game or error response */
export async function requireAuth(env, gameId, passphrase) {
  const game = await getGame(env, gameId);
  if (!game) return { error: json({ error: 'Game not found' }, 404), game: null };
  const valid = await verifyPassphrase(passphrase, game.hashedPassphrase);
  if (!valid) return { error: json({ error: 'Invalid passphrase' }, 401), game: null };
  return { error: null, game };
}
