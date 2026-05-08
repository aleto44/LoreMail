import { json } from '../index.js';
import { getGame } from '../lib/auth.js';

export async function handleReadReceipts(request, env) {
  const body = await request.json().catch(() => null);
  if (!body?.gameId || !body?.playerId || !Array.isArray(body?.readIds)) {
    return json({ error: 'Missing gameId, playerId, or readIds' }, 400);
  }

  const { gameId, playerId, readIds } = body;

  // Validate the github token against the stored game
  const authHeader = request.headers.get('Authorization') ?? '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return json({ error: 'Unauthorized' }, 401);

  const game = await getGame(env, gameId);
  if (!game) return json({ error: 'Game not found' }, 404);
  if (game.githubToken !== token) return json({ error: 'Forbidden' }, 403);

  // Confirm playerId exists in this game
  const playerInGame = game.players?.some(p => p.id === playerId);
  if (!playerInGame) return json({ error: 'Player not in game' }, 403);

  const filePath  = `players/${playerId}/read-receipts.json`;
  const ghBase    = `https://api.github.com/repos/${game.repoOwner}/${game.repoName}/contents`;
  const ghHeaders = {
    Authorization: `Bearer ${game.githubToken}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'loremail-worker/1.0',
    'Content-Type': 'application/json',
  };

  // Fetch existing file (404 is expected the first time on an ongoing game)
  let existingIds = [];
  let existingSha = null;
  const getRes = await fetch(`${ghBase}/${filePath}`, { headers: ghHeaders });
  if (getRes.ok) {
    const fileData = await getRes.json();
    existingSha = fileData.sha;
    try {
      const raw = new TextDecoder().decode(
        Uint8Array.from(atob(fileData.content.replace(/\n/g, '')), c => c.charCodeAt(0)),
      );
      existingIds = JSON.parse(raw)?.readIds ?? [];
    } catch { /* malformed — start fresh */ }
  }

  // Merge: union of existing + submitted
  const merged  = [...new Set([...existingIds, ...readIds])];
  const content = JSON.stringify({ v: 1, readIds: merged }, null, 2);
  const encoded = btoa(unescape(encodeURIComponent(content)));

  const putRes = await fetch(`${ghBase}/${filePath}`, {
    method: 'PUT',
    headers: ghHeaders,
    body: JSON.stringify({
      message: `read-receipts: ${playerId}`,
      content: encoded,
      ...(existingSha ? { sha: existingSha } : {}),
    }),
  });

  if (!putRes.ok) {
    const err = await putRes.text();
    return json({ error: `GitHub write failed: ${putRes.status} ${err}` }, 502);
  }

  return json({ ok: true, count: merged.length });
}
