import { json } from '../index.js';
import { verifyPassphrase, getGame } from '../lib/auth.js';
export async function handleGetPlayer(request, env) {
  const url = new URL(request.url);
  const gameId = url.searchParams.get('gameId');
  const passphrase = url.searchParams.get('passphrase');
  // Optional: non-founder players can restore by providing their playerId
  const requestedPlayerId = url.searchParams.get('playerId');
  if (!gameId || !passphrase) return json({ error: 'Missing gameId or passphrase' }, 400);
  const game = await getGame(env, gameId);
  if (!game) return json({ error: 'Game not found' }, 404);
  const valid = await verifyPassphrase(passphrase, game.hashedPassphrase);
  if (!valid) return json({ error: 'Invalid passphrase' }, 401);
  // Resolve which player to restore
  const playerId = requestedPlayerId ?? game.founderId;
  // Make sure the requested player actually belongs to this game
  const playerRecord = game.players?.find(p => p.id === playerId);
  if (!playerRecord) return json({ error: 'Player not found in this game' }, 404);
  const sessionRaw = await env.KV.get(`session:${gameId}:${playerId}`);
  const session = sessionRaw
    ? JSON.parse(sessionRaw)
    : { characterName: null, isFounder: playerId === game.founderId };
  return json({
    githubToken: game.githubToken,
    playerId,
    characterName: session.characterName,
    isFounder: playerId === game.founderId,
    repoOwner: game.repoOwner,
    repoName: game.repoName,
    gameId,
  });
}
