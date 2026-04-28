import { json } from '../index.js';
import { requireBody, requireAuth, putGame } from '../lib/auth.js';

export async function handleDeletePlayer(request, env) {
  const { error, data } = await requireBody(request, ['gameId', 'passphrase', 'playerId']);
  if (error) return error;

  const { gameId, passphrase, playerId } = data;
  const { error: authError, game } = await requireAuth(env, gameId, passphrase);
  if (authError) return authError;

  // Cannot remove founder
  if (playerId === game.founderId) return json({ error: 'Cannot remove founder' }, 400);

  const updatedPlayers = game.players.map(p =>
    p.id === playerId ? { ...p, removed: true } : p,
  );
  await putGame(env, gameId, { ...game, players: updatedPlayers });

  return json({ success: true });
}
