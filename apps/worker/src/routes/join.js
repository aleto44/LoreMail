import { json } from '../index.js';
import { requireBody, getGame, putGame } from '../lib/auth.js';
import { createFile, updateFile, dispatchWorkflow } from '../lib/github.js';
import { buildWorkflow } from '../lib/scaffold.js';

export async function handleJoin(request, env) {
  const { error, data } = await requireBody(request, ['gameId', 'inviteToken', 'characterName', 'characterBio', 'characterLocation']);
  if (error) return error;

  const { gameId, inviteToken, characterName, characterBio, characterLocation, characterGender } = data;

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
    characterLocation || 'Unknown',
    `join: ${playerId} location`,
  );

  // Mark invite used
  await env.KV.put(`invite:${inviteToken}`, JSON.stringify({ ...invite, used: true }));

  // Move the invite letter from letters/pending/ → letters/delivered/ so the new
  // player can read it in their inbox and the founder sees it as "Sent" instead of
  // perpetually "In Transit".
  try {
    const ghBase = `https://api.github.com/repos/${game.repoOwner}/${game.repoName}/contents`;
    const ghHeaders = {
      Authorization: `Bearer ${game.githubToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'loremail-worker/1.0',
      'Content-Type': 'application/json',
    };

    const pendingListRes = await fetch(`${ghBase}/letters/pending`, { headers: ghHeaders });
    if (pendingListRes.ok) {
      const pendingFiles = await pendingListRes.json();
      // Filename format: {deliverAt}_{fromId}_{toId}_{uuid}.md
      // toId is the placeholder id stored in invite.toId (= playerId)
      const inviteFile = Array.isArray(pendingFiles)
        ? pendingFiles.find(f => {
            if (!f.name.endsWith('.md') || f.name === '.gitkeep') return false;
            const parts = f.name.replace('.md', '').split('_');
            return parts[2] === playerId;
          })
        : null;

      if (inviteFile) {
        const fileRes = await fetch(`${ghBase}/letters/pending/${inviteFile.name}`, { headers: ghHeaders });
        if (fileRes.ok) {
          const fileData = await fileRes.json();
          const rawContent = new TextDecoder().decode(
            Uint8Array.from(atob(fileData.content.replace(/\n/g, '')), c => c.charCodeAt(0)),
          );
          // Mark as delivered in the frontmatter
          const deliveredContent = rawContent.replace('delivered: false', 'delivered: true');
          const encoded = btoa(unescape(encodeURIComponent(deliveredContent)));

          // Create in delivered/
          await fetch(`${ghBase}/letters/delivered/${inviteFile.name}`, {
            method: 'PUT',
            headers: ghHeaders,
            body: JSON.stringify({
              message: `deliver: invite letter to ${playerId}`,
              content: encoded,
            }),
          });

          // Remove from pending/
          await fetch(`${ghBase}/letters/pending/${inviteFile.name}`, {
            method: 'DELETE',
            headers: ghHeaders,
            body: JSON.stringify({
              message: `deliver: remove pending invite letter for ${playerId}`,
              sha: fileData.sha,
            }),
          });
        }
      }
    }
  } catch (e) {
    console.warn('Failed to deliver invite letter on join:', e.message);
  }

  // Update game.json in repo and KV
  const players = game.players.map(p =>
    p.id === playerId ? { ...p, joined: true, character: characterName, gender: characterGender || '', inviteToken: null } : p,
  );
  await putGame(env, gameId, { ...game, players });

  // Update config/game.json in the repo so the GM sees the new player
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
      // Add or update the player in the roster
      const existing = currentGame.players ?? [];
      const idx = existing.findIndex(p => p.id === playerId);
      const playerEntry = { id: playerId, character: characterName, bio: characterBio, gender: characterGender || '', joined: true, is_founder: false };
      if (idx >= 0) existing[idx] = playerEntry;
      else existing.push(playerEntry);
      currentGame.players = existing;
      await fetch(`${ghBase}/config/game.json`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `join: ${playerId} added to roster`,
          content: btoa(JSON.stringify(currentGame, null, 2)),
          sha: fileData.sha,
        }),
      });
    }
  } catch (e) {
    console.warn('Failed to update game.json in repo:', e.message);
  }

  // Store session
  await env.KV.put(
    `session:${gameId}:${playerId}`,
    JSON.stringify({ characterName, isFounder: false }),
  );

  // Trigger the GM engine to canonize the new player's starting location
  try {
    // Ensure the workflow in the repo supports player_id input (patch existing repos)
    await updateFile(
      game.githubToken,
      game.repoOwner,
      game.repoName,
      '.github/workflows/gm-loop.yml',
      buildWorkflow(),
      'chore: update gm-loop workflow to support player_joined trigger',
    );
    await dispatchWorkflow(game.githubToken, game.repoOwner, game.repoName, 'gm-loop.yml', {
      trigger: 'player_joined',
      player_id: playerId,
    });
  } catch (e) {
    console.warn('GM trigger on join failed:', e.message);
  }

  return json({
    githubToken: game.githubToken,
    playerId,
    characterName,
    isFounder: false,
    repoOwner: game.repoOwner,
    repoName: game.repoName,
    gameId,
  });
}
