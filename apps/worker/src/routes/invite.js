import { json } from '../index.js';
import { requireBody, requireAuth, putGame } from '../lib/auth.js';
import { createFile } from '../lib/github.js';

export async function handleInvite(request, env) {
  const { error, data } = await requireBody(request, ['gameId', 'passphrase', 'inviteeName', 'letterBody']);
  if (error) return error;

  const { gameId, passphrase, inviteeName, letterBody } = data;
  const { error: authError, game } = await requireAuth(env, gameId, passphrase);
  if (authError) return authError;

  // Generate invite token
  const inviteToken = crypto.randomUUID().replace(/-/g, '');

  // Calculate delivery time
  const sentAt = Math.floor(Date.now() / 1000);
  const travelHours = game.config?.default_travel_hours ?? 24;
  const deliverAt = sentAt + travelHours * 3600;

  // Build letter filename and content
  const letterUuid = crypto.randomUUID().replace(/-/g, '');
  const fromId = game.founderId;
  const toId = inviteeName.toLowerCase().replace(/\s+/g, '-');
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

  // Store invite token in KV
  await env.KV.put(`invite:${inviteToken}`, JSON.stringify({ gameId, inviteeName, toId, used: false }));

  // Add player placeholder to KV game record
  const players = game.players ?? [];
  if (!players.find(p => p.id === toId)) {
    players.push({ id: toId, joined: false, inviteToken });
    await putGame(env, gameId, { ...game, players });
  }

  const inviteLink = `https://loremail.app/join?game=${gameId}&invite=${inviteToken}`;
  return json({ inviteLink });
}
