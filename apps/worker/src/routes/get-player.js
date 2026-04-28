import { json } from '../index.js';
import { verifyPassphrase, getGame } from '../lib/auth.js';

export async function handleGetPlayer(request, env) {
  const url = new URL(request.url);
  const gameId = url.searchParams.get('gameId');
  const passphrase = url.searchParams.get('passphrase');

  if (!gameId || !passphrase) return json({ error: 'Missing gameId or passphrase' }, 400);

  const game = await getGame(env, gameId);
  if (!game) return json({ error: 'Game not found' }, 404);

  const valid = await verifyPassphrase(passphrase, game.hashedPassphrase);
  if (!valid) return json({ error: 'Invalid passphrase' }, 401);

  // Find the passphrase owner — passphrases are per-player, but our model uses a shared game passphrase
  // Return founder session by default (players restore via their own passphrase from the invite flow)
  const sessionRaw = await env.KV.get(`session:${gameId}:${game.founderId}`);
  const session = sessionRaw ? JSON.parse(sessionRaw) : { characterName: null, isFounder: true };

  return json({
    githubToken: game.githubToken,
    playerId: game.founderId,
    characterName: session.characterName,
    isFounder: true,
    repoOwner: game.repoOwner,
    repoName: game.repoName,
  });
}
