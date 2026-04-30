import { json } from '../index.js';
import { requireBody, requireAuth, putGame } from '../lib/auth.js';
import { createFile } from '../lib/github.js';

export async function handleInvite(request, env) {
  const { error, data } = await requireBody(request, ['gameId', 'passphrase', 'letterBody']);
  if (error) return error;

  const { gameId, passphrase, letterBody } = data;
  const { error: authError, game } = await requireAuth(env, gameId, passphrase);
  if (authError) return authError;

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
