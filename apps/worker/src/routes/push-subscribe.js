import { json } from '../index.js';
import { getGame } from '../lib/auth.js';

/**
 * GET /push/vapid-key
 * Returns the VAPID public key so the PWA can subscribe to push notifications.
 * No auth required — the public key is not secret.
 */
export async function handleGetVapidKey(request, env) {
  if (!env.VAPID_PUBLIC_KEY) {
    return json({ error: 'Push notifications not configured on this server.' }, 503);
  }
  return json({ publicKey: env.VAPID_PUBLIC_KEY });
}

/**
 * POST /push/subscribe
 * Body: { gameId, playerId, subscription: { endpoint, expirationTime, keys: { p256dh, auth } } }
 *
 * Stores the player's push subscription in KV so the Worker can
 * send notifications when a new letter is delivered.
 *
 * Auth: verifies playerId is a joined player in the named game.
 */
export async function handlePushSubscribe(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { gameId, playerId, subscription } = body;
  if (!gameId || !playerId || !subscription?.endpoint) {
    return json({ error: 'Missing gameId, playerId, or subscription.endpoint' }, 400);
  }

  // Verify the player belongs to this game
  const game = await getGame(env, gameId);
  if (!game) return json({ error: 'Game not found' }, 404);
  const isPlayer = game.players?.some(p => p.id === playerId && p.joined);
  if (!isPlayer) return json({ error: 'Player not found in game' }, 403);

  // Store subscription (one per player — latest device wins)
  await env.KV.put(
    `push:sub:${gameId}:${playerId}`,
    JSON.stringify({
      endpoint: subscription.endpoint,
      expirationTime: subscription.expirationTime ?? null,
      keys: {
        p256dh: subscription.keys.p256dh,
        auth:   subscription.keys.auth,
      },
    }),
  );

  return json({ ok: true });
}
