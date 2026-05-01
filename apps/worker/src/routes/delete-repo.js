import { json } from '../index.js';
import { requireBody, requireAuth } from '../lib/auth.js';
import { deleteRepository } from '../lib/github.js';

export async function handleDeleteRepo(request, env) {
  const { error, data } = await requireBody(request, ['gameId', 'passphrase']);
  if (error) return error;

  const { gameId, passphrase } = data;
  const { error: authError, game } = await requireAuth(env, gameId, passphrase);
  if (authError) return authError;

  // Only the founder can delete the repository
  // (requireAuth already confirms the passphrase matches the game)
  try {
    await deleteRepository(game.githubToken, game.repoOwner, game.repoName);
  } catch (e) {
    const msg = e.message ?? 'Unknown error';
    const status = msg.includes('403') ? 403 : 500;
    return json({ error: msg }, status);
  }

  // Remove the game record from KV so the game is fully gone
  try {
    await env.KV.delete(`game:${gameId}`);
  } catch (e) {
    console.warn('Failed to delete game KV record after repo deletion:', e.message);
  }

  return json({ success: true });
}
