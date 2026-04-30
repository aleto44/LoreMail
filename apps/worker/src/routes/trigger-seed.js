import { json } from '../index.js';
import { requireBody, getGame } from '../lib/auth.js';
import { dispatchWorkflow } from '../lib/github.js';

/**
 * POST /game/trigger-seed
 * Re-dispatches the seed_generation workflow for a game.
 * Only the founder can call this.
 * Useful when the initial dispatch on game creation failed because
 * GitHub Actions hadn't registered the workflow yet.
 */
export async function handleTriggerSeed(request, env) {
  const { error, data } = await requireBody(request, ['gameId', 'founderGithubToken']);
  if (error) return error;

  const { gameId, founderGithubToken } = data;

  const game = await getGame(env, gameId);
  if (!game) return json({ error: 'Game not found' }, 404);

  const { repoOwner, repoName, githubToken } = game;
  // Use the stored token as fallback if caller didn't supply one
  const token = founderGithubToken ?? githubToken;

  try {
    await dispatchWorkflow(token, repoOwner, repoName, 'gm-loop.yml', {
      trigger: 'seed_generation',
    });
    return json({ ok: true });
  } catch (e) {
    return json({ error: `Dispatch failed: ${e.message}` }, 502);
  }
}
