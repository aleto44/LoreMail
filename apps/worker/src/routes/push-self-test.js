import { json } from '../index.js';
import { sendWebPush } from '../lib/web-push.js';

/**
 * POST /push/self-test
 * Lets a player send a test push notification to their own device.
 * Auth: verifies a valid session exists in KV for the given gameId+playerId.
 *
 * Body: { gameId, playerId }
 */
export async function handlePushSelfTest(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { gameId, playerId } = body;
  if (!gameId || !playerId) {
    return json({ error: 'Missing gameId or playerId' }, 400);
  }

  // Verify the session exists (lightweight auth — no token needed)
  const session = await env.KV.get(`session:${gameId}:${playerId}`);
  if (!session) {
    return json({ error: 'No session found for this player' }, 403);
  }

  // Look up their push subscription
  const subRaw = await env.KV.get(`push:sub:${gameId}:${playerId}`);
  if (!subRaw) {
    return json({ error: 'No push subscription registered for this player' }, 404);
  }

  const subscription = JSON.parse(subRaw);

  try {
    const payload = JSON.stringify({
      title: '🔔 Loremail test notification',
      body: 'Push notifications are working for your account!',
      url: `${env.PWA_URL ?? 'https://aleto44.github.io/LoreMail'}/`,
    });

    const res = await sendWebPush(subscription, payload, env);

    if (res.status === 410 || res.status === 404) {
      await env.KV.delete(`push:sub:${gameId}:${playerId}`);
      return json({ ok: false, error: 'Subscription expired — please re-enable notifications in the app.' }, 410);
    }

    const ok = res.status < 300 || res.status === 201;
    return json({ ok, status: res.status });
  } catch (e) {
    console.error('Push self-test error:', e.message);
    return json({ ok: false, error: e.message }, 500);
  }
}
