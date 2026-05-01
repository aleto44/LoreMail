import { json } from '../index.js';
import {
  hashPassphrase,
  generatePassphrase,
  slugify,
  putGame,
  requireBody,
} from '../lib/auth.js';
import {
  createRepo,
  createFile,
  setSecret,
  dispatchWorkflow,
  getAuthenticatedUser,
} from '../lib/github.js';
import { buildGameScaffold } from '../lib/scaffold.js';

export async function handleCreateGame(request, env) {
  const { error, data } = await requireBody(request, [
    'founderGithubToken',
    'copilotToken',
    'worldFlavour',
    'gmStyle',
    'model',
    'founderCharacterName',
    'founderCharacterBio',
    'gameId',
    'passphrase',
  ]);
  if (error) return error;

  const {
    founderGithubToken,
    copilotToken,
    worldFlavour,
    era,
    tone,
    gmStyle,
    model,
    founderCharacterName,
    founderCharacterBio,
    founderCharacterLocation,
    gameId: requestedGameId,
    passphrase: requestedPassphrase,
  } = data;

  // Get founder's GitHub identity
  const ghUser = await getAuthenticatedUser(founderGithubToken);
  const founderId = ghUser.login;
  const owner = ghUser.login;

  // Use provided game ID + passphrase (or fall back to auto-generated)
  const gameId = requestedGameId
    ? slugify(requestedGameId)
    : (() => {
        const gameSlug = slugify(worldFlavour.split(' ').slice(0, 3).join('-') || 'world');
        const suffix = Math.random().toString(36).slice(2, 7);
        return `${gameSlug}-${suffix}`;
      })();
  const repoName = `${gameId}-loremail`;
  const passphrase = requestedPassphrase || generatePassphrase();
  const hashedPassphrase = await hashPassphrase(passphrase);

  // Create private GitHub repo
  const repo = await createRepo(founderGithubToken, owner, repoName);

  // Build and commit all scaffold files
  const gameJson = {
    name: worldFlavour.split(' ').slice(0, 5).join(' '),
    flavour: worldFlavour,
    era,
    tone,
    gm_style: gmStyle,
    gm_paused: false,
    model,
    founder_id: founderId,
    players: [
      {
        id: founderId,
        character: founderCharacterName,
        bio: founderCharacterBio,
        location: founderCharacterLocation || 'Unknown',
        joined: true,
        is_founder: true,
      },
    ],
    default_travel_hours: 24,
  };

  const engineJson = {
    canon_recent_word_limit: 4000,
    canon_deep_summary_target: 800,
    temperature: 0.4,
    consistency_check: true,
    fact_extraction: true,
    events_window: 20,
    locked_tag: '[LOCKED]',
    developing_tag: '[DEVELOPING]',
  };

  const files = buildGameScaffold({
    gameJson,
    engineJson,
    founderId,
    founderCharacterName,
    founderCharacterBio,
    founderCharacterLocation: founderCharacterLocation || 'Unknown',
  });

  for (const [filePath, content] of Object.entries(files)) {
    await createFile(founderGithubToken, owner, repoName, filePath, content, `scaffold: ${filePath}`);
  }

  // Store copilot token as GitHub Actions secret
  await setSecret(founderGithubToken, owner, repoName, 'COPILOT_TOKEN', copilotToken);

  // Store game in KV
  await putGame(env, gameId, {
    repoOwner: owner,
    repoName,
    hashedPassphrase,
    githubToken: founderGithubToken,
    founderId,
    players: [{ id: founderId, character: founderCharacterName, joined: true, inviteToken: null, is_founder: true }],
  });

  // Store founder session
  await env.KV.put(
    `session:${gameId}:${founderId}`,
    JSON.stringify({ characterName: founderCharacterName, isFounder: true }),
  );

  // Trigger world seed generation.
  // The workflow may not be immediately dispatchable on a brand-new repo — if this
  // single attempt fails the founder can use the "Re-trigger seed generation" button
  // in the PWA, or POST /game/trigger-seed directly.
  let seedTriggered = false;
  try {
    await dispatchWorkflow(founderGithubToken, owner, repoName, 'gm-loop.yml', {
      trigger: 'seed_generation',
    });
    seedTriggered = true;
  } catch (e) {
    console.warn(`Seed dispatch failed: ${e.message}. Founder can re-trigger via /game/trigger-seed.`);
  }

  return json({ gameId, passphrase, repoUrl: repo.html_url, seedTriggered });
}
