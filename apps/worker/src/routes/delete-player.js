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
  // Also update config/game.json in the repo so the GM sees the removal
  try {
    const ghBase = `https://api.github.com/repos/${game.repoOwner}/${game.repoName}/contents`;
    const headers = {
      Authorization: `Bearer ${game.githubToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'loremail-worker/1.0',
    };
    const fileRes = await fetch(`${ghBase}/config/game.json`, { headers });
    if (fileRes.ok) {
      const fileData = await fileRes.json();
      const currentGame = JSON.parse(atob(fileData.content.replace(/\n/g, '')));
      currentGame.players = (currentGame.players ?? []).map(p =>
        p.id === playerId ? { ...p, removed: true } : p,
      );
      await fetch(`${ghBase}/config/game.json`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `remove player: ${playerId}`,
          content: btoa(JSON.stringify(currentGame, null, 2)),
          sha: fileData.sha,
        }),
      });
    }
  } catch (e) {
    console.warn('Failed to update game.json in repo for player removal:', e.message);
  }
  return json({ success: true });
}
