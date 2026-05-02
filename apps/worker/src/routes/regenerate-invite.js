import { json } from '../index.js';
import { requireBody, requireAuth, putGame } from '../lib/auth.js';

export async function handleRegenerateInvite(request, env) {
  const { error, data } = await requireBody(request, ['gameId', 'passphrase', 'playerId']);
  if (error) return error;

  const { gameId, passphrase, playerId } = data;
  const { error: authError, game } = await requireAuth(env, gameId, passphrase);
  if (authError) return authError;

  // Invalidate old token in KV
  const player = game.players.find(p => p.id === playerId);
  if (player?.inviteToken) {
    await env.KV.delete(`invite:${player.inviteToken}`);
  }

  // Generate new token
  const newToken = crypto.randomUUID().replace(/-/g, '');
  const inviteeName = playerId; // best we have without extra data

  await env.KV.put(
    `invite:${newToken}`,
    JSON.stringify({ gameId, inviteeName, toId: playerId, used: false }),
  );

  // Update KV game record
  const updatedPlayers = game.players.map(p =>
    p.id === playerId ? { ...p, inviteToken: newToken } : p,
  );
  await putGame(env, gameId, { ...game, players: updatedPlayers });

  const pwaUrl = (env.PWA_URL ?? 'https://loremail.app').replace(/\/$/, '');
  const inviteLink = `${pwaUrl}/?game=${gameId}&invite=${newToken}`;
  return json({ inviteLink });
}
