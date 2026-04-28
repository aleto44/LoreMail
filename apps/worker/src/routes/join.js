import { json } from '../index.js';
import { requireBody, getGame, putGame } from '../lib/auth.js';
import { createFile } from '../lib/github.js';

export async function handleJoin(request, env) {
  const { error, data } = await requireBody(request, ['gameId', 'inviteToken', 'characterName', 'characterBio']);
  if (error) return error;

  const { gameId, inviteToken, characterName, characterBio } = data;

  // Validate invite token
  const inviteRaw = await env.KV.get(`invite:${inviteToken}`);
  if (!inviteRaw) return json({ error: 'Invalid or expired invite token' }, 401);
  const invite = JSON.parse(inviteRaw);

  if (invite.used) return json({ error: 'Invite already used' }, 401);
  if (invite.gameId !== gameId) return json({ error: 'Token game mismatch' }, 401);

  const game = await getGame(env, gameId);
  if (!game) return json({ error: 'Game not found' }, 404);

  const playerId = invite.toId;

  // Create character.md and location.md in game repo
  await createFile(
    game.githubToken,
    game.repoOwner,
    game.repoName,
    `players/${playerId}/character.md`,
    `# ${characterName}\n\n${characterBio}`,
    `join: ${playerId} character`,
  );

  await createFile(
    game.githubToken,
    game.repoOwner,
    game.repoName,
    `players/${playerId}/location.md`,
    `Unknown`,
    `join: ${playerId} location`,
  );

  // Mark invite used
  await env.KV.put(`invite:${inviteToken}`, JSON.stringify({ ...invite, used: true }));

  // Update game.json in repo and KV
  const players = game.players.map(p =>
    p.id === playerId ? { ...p, joined: true, character: characterName, inviteToken: null } : p,
  );
  await putGame(env, gameId, { ...game, players });

  // Store session
  await env.KV.put(
    `session:${gameId}:${playerId}`,
    JSON.stringify({ characterName, isFounder: false }),
  );

  // We generate a scoped token for this player via game's github token
  // For simplicity players share read access via the same token (game is private)
  return json({
    githubToken: game.githubToken,
    playerId,
    characterName,
    isFounder: false,
    repoOwner: game.repoOwner,
    repoName: game.repoName,
  });
}
