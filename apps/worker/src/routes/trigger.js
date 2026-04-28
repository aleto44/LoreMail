import { json } from '../index.js';
import { requireBody, requireAuth } from '../lib/auth.js';
import { dispatchWorkflow } from '../lib/github.js';

export async function handleTrigger(request, env) {
  const { error, data } = await requireBody(request, ['gameId', 'passphrase']);
  if (error) return error;

  const { gameId, passphrase } = data;
  const { error: authError, game } = await requireAuth(env, gameId, passphrase);
  if (authError) return authError;

  await dispatchWorkflow(game.githubToken, game.repoOwner, game.repoName, 'gm-loop.yml', {
    trigger: 'letter_delivery',
  });

  return json({ success: true });
}
