import { json } from '../index.js';
const GH_API = 'https://api.github.com';

/** Decode a GitHub API base64 blob as UTF-8 (atob alone produces Latin-1 mojibake). */
function decodeBase64Utf8(b64) {
  const binary = atob(b64.replace(/\n/g, ''));
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
/**
 * GET /game/info?gameId=X&inviteToken=Y
 * Returns world name and seed excerpt for the JoinFlow splash screen.
 * Validates the invite token is valid (not used) before revealing world info.
 */
export async function handleGameInfo(request, env) {
  const url = new URL(request.url);
  const gameId = url.searchParams.get('gameId');
  const inviteToken = url.searchParams.get('inviteToken');
  if (!gameId || !inviteToken) return json({ error: 'Missing gameId or inviteToken' }, 400);
  // Validate invite token
  const inviteRaw = await env.KV.get(`invite:${inviteToken}`);
  if (!inviteRaw) return json({ error: 'Invalid invite token' }, 401);
  const invite = JSON.parse(inviteRaw);
  if (invite.used) return json({ error: 'Invite already used' }, 401);
  if (invite.gameId !== gameId) return json({ error: 'Token game mismatch' }, 401);
  // Get game record
  const gameRaw = await env.KV.get(`game:${gameId}`);
  if (!gameRaw) return json({ error: 'Game not found' }, 404);
  const game = JSON.parse(gameRaw);
  // Fetch game.json for the world name
  let worldName = gameId;
  let seedExcerpt = null;
  let inviteLetter = null;
  let repoFounderName = null;
  try {
    const headers = {
      Authorization: `Bearer ${game.githubToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'loremail-worker/1.0',
    };
    const [gameJsonRes, seedRes] = await Promise.all([
      fetch(`${GH_API}/repos/${game.repoOwner}/${game.repoName}/contents/config/game.json`, { headers }),
      fetch(`${GH_API}/repos/${game.repoOwner}/${game.repoName}/contents/world/seed.md`, { headers }),
    ]);
    if (gameJsonRes.ok) {
      const file = await gameJsonRes.json();
      const gameJson = JSON.parse(decodeBase64Utf8(file.content));
      worldName = gameJson.name ?? gameJson.flavour ?? gameId;
      // Prefer repo game.json for founder character name — it always has the `character` field
      const repoFounder = gameJson.players?.find(p => p.is_founder || p.id === game.founderId);
      repoFounderName = repoFounder?.character ?? null;
    }
    if (seedRes.ok) {
      const file = await seedRes.json();
      const seedText = decodeBase64Utf8(file.content);
      // Extract first ~200 chars of actual prose (skip any markdown headings)
      const prose = seedText
        .split('\n')
        .filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('*Generating'))
        .join(' ')
        .trim();
      seedExcerpt = prose.length > 240 ? prose.slice(0, 240).trimEnd() + '…' : prose;
    }
    inviteLetter = await fetchInviteLetter(game, invite, headers, GH_API);
  } catch (e) {
    console.warn('Failed to fetch world info:', e.message);
  }
  // Fall back to KV record if repo fetch failed (older games may not have character in KV)
  const kvFounderPlayer = game.players?.find(p => p.is_founder || p.id === game.founderId);
  const founderName = repoFounderName ?? kvFounderPlayer?.character ?? null;
  return json({ worldName, seedExcerpt, inviteeName: invite.inviteeName ?? null, inviteLetter, founderName });
}

async function fetchInviteLetter(game, invite, headers, GH_API) {
  try {
    const pendingRes = await fetch(
      `${GH_API}/repos/${game.repoOwner}/${game.repoName}/contents/letters/pending`,
      { headers }
    );
    if (!pendingRes.ok) return null;
    const files = await pendingRes.json();
    if (!Array.isArray(files)) return null;
    const toId = invite.toId;
    const letterFile = files.find(f => {
      // filename: {deliverAt}_{fromId}_{toId}_{uuid}.md
      // toId is like 'inv-a1b2c3d4' (no underscores) so split('_')[2] works
      const parts = f.name.replace(/\.md$/, '').split('_');
      return parts.length >= 3 && parts[2] === toId;
    });
    if (!letterFile) return null;
    const fileRes = await fetch(letterFile.url, { headers });
    if (!fileRes.ok) return null;
    const fileData = await fileRes.json();
    const raw = decodeBase64Utf8(fileData.content);
    // Parse past second --- to get body
    const m = raw.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
    return m ? m[1].trim() : raw.trim();
  } catch (e) {
    console.warn('Failed to fetch invite letter:', e.message);
    return null;
  }
}
