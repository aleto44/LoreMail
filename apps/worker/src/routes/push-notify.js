import { json } from '../index.js';
import { getGame } from '../lib/auth.js';
import { sendWebPush } from '../lib/web-push.js';

/**
 * POST /push/notify
 * Called by the GitHub Actions GM workflow after letters are delivered.
 *
 * Body: { gameId, notifyToken, recipients: string[] }
 *   gameId      — the game ID
 *   notifyToken — random secret stored in KV + game repo (LOREMAIL_NOTIFY_TOKEN secret)
 *   recipients  — array of player IDs who received new letters
 *
 * Looks up each recipient's push subscription and fires a Web Push notification.
 */
export async function handlePushNotify(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { gameId, notifyToken, recipients } = body;

  if (!gameId || !notifyToken || !Array.isArray(recipients) || recipients.length === 0) {
    return json({ error: 'Missing gameId, notifyToken, or recipients' }, 400);
  }

  // Validate the notifyToken against the one stored for this game
  const game = await getGame(env, gameId);
  if (!game) return json({ error: 'Game not found' }, 404);
  if (!game.notifyToken || game.notifyToken !== notifyToken) {
    return json({ error: 'Invalid notify token' }, 401);
  }

  const results = [];

  for (const playerId of recipients) {
    const subRaw = await env.KV.get(`push:sub:${gameId}:${playerId}`);
    if (!subRaw) {
      results.push({ playerId, status: 'no_subscription' });
      continue;
    }

    const subscription = JSON.parse(subRaw);

    try {
      const payload = JSON.stringify({
        title: 'New letter in Loremail',
        body: 'A new letter has arrived. Open Loremail to read it.',
        url: `${env.PWA_URL ?? 'https://aleto44.github.io/LoreMail'}/`,
      });

      const res = await sendWebPush(subscription, payload, env);

      // 410 Gone / 404 Not Found = subscription expired — clean it up
      if (res.status === 410 || res.status === 404) {
        await env.KV.delete(`push:sub:${gameId}:${playerId}`);
        results.push({ playerId, status: 'subscription_expired' });
      } else {
        results.push({ playerId, status: res.status < 300 || res.status === 201 ? 'sent' : `failed_${res.status}` });
      }
    } catch (e) {
      console.error(`Push notify error for ${playerId}:`, e.message);
      results.push({ playerId, status: 'error', error: e.message });
    }
  }

  return json({ ok: true, results });
}
