import { json } from '../index.js';
import { requireBody, requireAuth, putGame } from '../lib/auth.js';
import { createFile } from '../lib/github.js';

const GH_API = 'https://api.github.com';

/** Decode a GitHub API base64 blob as UTF-8 (atob alone produces Latin-1 mojibake). */
function decodeBase64Utf8(b64) {
  const binary = atob(b64.replace(/\n/g, ''));
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Fetch the GM status file from the game repo to check if seed generation is complete. */
async function getGameStatus(game) {
  try {
    const headers = {
      Authorization: `Bearer ${game.githubToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'loremail-worker/1.0',
    };
    const res = await fetch(
      `${GH_API}/repos/${game.repoOwner}/${game.repoName}/contents/.gm-status.json`,
      { headers }
    );
    if (!res.ok) return null;
    const file = await res.json();
    const statusText = decodeBase64Utf8(file.content);
    return JSON.parse(statusText);
  } catch (e) {
    console.warn('Failed to fetch GM status:', e.message);
    return null;
  }
}

export async function handleInvite(request, env) {
  const { error, data } = await requireBody(request, ['gameId', 'passphrase', 'letterBody']);
  if (error) return error;

  const { gameId, passphrase, letterBody } = data;
  const { error: authError, game } = await requireAuth(env, gameId, passphrase);
  if (authError) return authError;

  // Check if seed generation is complete before allowing invites
  const status = await getGameStatus(game);
  if (!status || status.trigger !== 'seed_generation' || status.success !== true) {
    return json({ error: 'World seed generation is not yet complete. Please wait for the GM to finish generating the world before sending invites.' }, 429);
  }

  // Generate invite token and a unique placeholder ID for this slot
  const inviteToken = crypto.randomUUID().replace(/-/g, '');
  const toId = `inv-${inviteToken.slice(0, 8)}`;

  // Invite letters are delivered immediately — no travel delay
  const sentAt = Math.floor(Date.now() / 1000);
  const deliverAt = sentAt;

  // Build letter filename and content
  const letterUuid = crypto.randomUUID().replace(/-/g, '');
  const fromId = game.founderId;
  const filename = `${deliverAt}_${fromId}_${toId}_${letterUuid}.md`;

  const frontmatter = `---\nfrom: ${fromId}\nto: ${toId}\nsent_at: ${sentAt}\ndeliver_at: ${deliverAt}\ndelivered: false\n---\n`;
  const letterContent = frontmatter + letterBody;

  // Commit letter to pending
  await createFile(
    game.githubToken,
    game.repoOwner,
    game.repoName,
    `letters/pending/${filename}`,
    letterContent,
    `letter: ${fromId} → ${toId}`,
  );

  // Store invite token in KV (no inviteeName — the player will choose their own name)
  await env.KV.put(`invite:${inviteToken}`, JSON.stringify({ gameId, toId, used: false }));

  // Add player placeholder to KV game record
  const players = game.players ?? [];
  if (!players.find(p => p.id === toId)) {
    players.push({ id: toId, joined: false, inviteToken });
    await putGame(env, gameId, { ...game, players });
  }

  const pwaUrl = (env.PWA_URL ?? 'https://loremail.app').replace(/\/$/, '');
  const inviteLink = `${pwaUrl}/join?game=${gameId}&invite=${inviteToken}`;
  return json({ inviteLink });
}
