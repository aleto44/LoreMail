import { json } from '../index.js';
import { requireBody, requireAuth, putGame } from '../lib/auth.js';
import { createFile } from '../lib/github.js';

const ALLOWED_GAME_FIELDS = ['gm_style', 'gm_paused', 'model', 'default_travel_hours'];
const ALLOWED_ENGINE_FIELDS = [
  'canon_recent_word_limit',
  'canon_deep_summary_target',
  'temperature',
  'consistency_check',
  'fact_extraction',
];

export async function handlePatchConfig(request, env) {
  const { error, data } = await requireBody(request, ['gameId', 'passphrase', 'changes']);
  if (error) return error;

  const { gameId, passphrase, changes } = data;
  const { error: authError, game } = await requireAuth(env, gameId, passphrase);
  if (authError) return authError;

  // Only founder can patch config
  // We trust the passphrase here; the founder passphrase is the shared one
  // In a more robust system, per-player passphrases would allow stricter checks

  const { gameChanges = {}, engineChanges = {} } = changes;

  // Fetch current config from repo
  const ghBase = `https://api.github.com/repos/${game.repoOwner}/${game.repoName}/contents`;
  const headers = {
    Authorization: `Bearer ${game.githubToken}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'loremail-worker/1.0',
  };

  // Patch game.json
  if (Object.keys(gameChanges).length > 0) {
    const res = await fetch(`${ghBase}/config/game.json`, { headers });
    if (res.ok) {
      const file = await res.json();
      const current = JSON.parse(atob(file.content.replace(/\n/g, '')));
      for (const [k, v] of Object.entries(gameChanges)) {
        if (ALLOWED_GAME_FIELDS.includes(k)) current[k] = v;
      }
      await fetch(`${ghBase}/config/game.json`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'config: update game settings',
          content: btoa(JSON.stringify(current, null, 2)),
          sha: file.sha,
        }),
      });
    }
  }

  // Patch engine.json
  if (Object.keys(engineChanges).length > 0) {
    const res = await fetch(`${ghBase}/config/engine.json`, { headers });
    if (res.ok) {
      const file = await res.json();
      const current = JSON.parse(atob(file.content.replace(/\n/g, '')));
      for (const [k, v] of Object.entries(engineChanges)) {
        if (ALLOWED_ENGINE_FIELDS.includes(k)) current[k] = v;
      }
      await fetch(`${ghBase}/config/engine.json`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'config: update engine settings',
          content: btoa(JSON.stringify(current, null, 2)),
          sha: file.sha,
        }),
      });
    }
  }

  return json({ success: true });
}
