import { json } from '../index.js';
import { requireBody, requireAuth } from '../lib/auth.js';
import { updateFile } from '../lib/github.js';
import { engineFiles } from '../lib/engine-files.js';
import { buildGmScript, buildWorkflow } from '../lib/scaffold.js';
/**
 * POST /game/update-engine
 * Pushes the latest engine source, gm.js, and workflow to an existing game repo.
 * Requires founder authentication.
 */
export async function handleUpdateEngine(request, env) {
  const { error, data } = await requireBody(request, ['gameId', 'passphrase']);
  if (error) return error;
  const { gameId, passphrase } = data;
  const { error: authError, game } = await requireAuth(env, gameId, passphrase);
  if (authError) return authError;
  const { repoOwner, repoName, githubToken, founderId } = game;
  // Require founder
  const callerFounderId = data.founderId;
  if (callerFounderId && callerFounderId !== founderId) {
    return json({ error: 'Only the founder can update the engine' }, 403);
  }
  const updated = [];
  const errors = [];
  // Push all engine source files
  for (const [filePath, content] of Object.entries(engineFiles)) {
    try {
      await updateFile(githubToken, repoOwner, repoName, filePath, content, 'engine: update to latest version');
      updated.push(filePath);
    } catch (err) {
      errors.push({ file: filePath, error: err.message });
    }
  }
  // Push gm.js
  try {
    await updateFile(githubToken, repoOwner, repoName, 'scripts/gm.js', buildGmScript(), 'engine: update gm.js');
    updated.push('scripts/gm.js');
  } catch (err) {
    errors.push({ file: 'scripts/gm.js', error: err.message });
  }
  // Push workflow
  try {
    await updateFile(githubToken, repoOwner, repoName, '.github/workflows/gm-loop.yml', buildWorkflow(), 'engine: update gm-loop workflow');
    updated.push('.github/workflows/gm-loop.yml');
  } catch (err) {
    errors.push({ file: '.github/workflows/gm-loop.yml', error: err.message });
  }
  return json({ success: errors.length === 0, updated, errors });
}
