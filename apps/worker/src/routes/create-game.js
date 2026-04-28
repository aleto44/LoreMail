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
    'era',
    'tone',
    'gmStyle',
    'model',
    'founderCharacterName',
    'founderCharacterBio',
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
  } = data;

  // Get founder's GitHub identity
  const ghUser = await getAuthenticatedUser(founderGithubToken);
  const founderId = ghUser.login;
  const owner = ghUser.login;

  // Generate game ID + passphrase
  const gameSlug = slugify(worldFlavour.split(' ').slice(0, 3).join('-') || 'world');
  const suffix = Math.random().toString(36).slice(2, 7);
  const gameId = `${gameSlug}-${suffix}`;
  const repoName = `${gameId}-loremail`;
  const passphrase = generatePassphrase();
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
    locked_tag: '[LOCKED]',
    developing_tag: '[DEVELOPING]',
  };

  const files = buildGameScaffold({
    gameJson,
    engineJson,
    founderId,
    founderCharacterName,
    founderCharacterBio,
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
    players: [{ id: founderId, joined: true, inviteToken: null }],
  });

  // Store founder session
  await env.KV.put(
    `session:${gameId}:${founderId}`,
    JSON.stringify({ characterName: founderCharacterName, isFounder: true }),
  );

  // Trigger world seed generation
  try {
    await dispatchWorkflow(founderGithubToken, owner, repoName, 'gm-loop.yml', {
      trigger: 'seed_generation',
    });
  } catch (e) {
    console.warn('Seed trigger failed (may need to wait for Actions to initialize):', e.message);
  }

  return json({ gameId, passphrase, repoUrl: repo.html_url });
}
