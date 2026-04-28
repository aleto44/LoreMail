/**
 * Build all game repo scaffold files.
 * Returns a flat object: { 'path/file': 'content' }
 */
export function buildGameScaffold({ gameJson, engineJson, founderId, founderCharacterName, founderCharacterBio }) {
  const files = {};

  files['config/game.json'] = JSON.stringify(gameJson, null, 2);
  files['config/engine.json'] = JSON.stringify(engineJson, null, 2);

  files['world/canon.md'] = `## DEEP HISTORY\n*[summarized — compressed from earlier records]*\n\n\n\n---\n\n## RECENT HISTORY\n*[verbatim — last recorded entries]*\n\n`;
  files['world/canon-facts.md'] = `# Canon Facts\n\n`;
  files['world/events.md'] = `# World Events\n\n`;
  files['world/gm-notes.md'] = `# GM Notes (Private)\n\n`;
  files['world/seed.md'] = `# World Seed\n\n*Generating...*`;
  files['world/chronicle.md'] = '';

  files[`players/${founderId}/character.md`] = `# ${founderCharacterName}\n\n${founderCharacterBio}`;
  files[`players/${founderId}/location.md`] = `Unknown`;

  files['letters/.gitkeep'] = '';
  files['letters/pending/.gitkeep'] = '';
  files['letters/delivered/.gitkeep'] = '';

  files['scripts/gm.js'] = buildGmScript();
  files['scripts/package.json'] = JSON.stringify(
    {
      name: 'game-scripts',
      version: '1.0.0',
      private: true,
      type: 'module',
      dependencies: { 'loremail-gm-engine': '^0.1.0', 'gray-matter': '^4.0.3' },
    },
    null,
    2,
  );

  files['.github/workflows/gm-loop.yml'] = buildWorkflow();

  files['.gm-status.json'] = JSON.stringify({
    timestamp: null,
    trigger: null,
    lettersProcessed: 0,
    success: null,
  }, null, 2);

  return files;
}

function buildGmScript() {
  return `#!/usr/bin/env node
import { GMEngine } from 'loremail-gm-engine';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFile, writeFile, readdir, unlink, copyFile } from 'fs/promises';
import { existsSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_PATH = path.resolve(__dirname, '..');
const TRIGGER = process.env.TRIGGER ?? 'letter_delivery';

async function main() {
  const apiToken = process.env.COPILOT_TOKEN;
  if (!apiToken) throw new Error('COPILOT_TOKEN required');

  const gameJson = JSON.parse(await readFile(path.join(REPO_PATH, 'config/game.json'), 'utf8'));
  const engineJson = JSON.parse(await readFile(path.join(REPO_PATH, 'config/engine.json'), 'utf8'));

  if (gameJson.gm_paused && TRIGGER === 'letter_delivery') {
    console.log('GM paused.'); process.exit(0);
  }

  const engine = new GMEngine({
    repoPath: REPO_PATH, model: gameJson.model ?? 'gpt-4o',
    apiToken, engineConfig: engineJson,
  });
  const ws = engine.worldState;

  if (TRIGGER === 'seed_generation') {
    await engine.generateWorldSeed({ flavour: gameJson.flavour, era: gameJson.era, tone: gameJson.tone, gmStyle: gameJson.gm_style, game: gameJson });
    await engine.statusWriter.write({ trigger: 'seed_generation', lettersProcessed: 0, success: true });
    console.log('Seed generated.'); return;
  }

  if (TRIGGER === 'finalization') {
    await engine.generateChronicle({ game: gameJson });
    await engine.statusWriter.write({ trigger: 'finalization', lettersProcessed: 0, success: true });
    console.log('Chronicle generated.'); return;
  }

  const now = Math.floor(Date.now() / 1000);
  const pending = await ws.listPendingLetters();
  const due = [];
  for (const p of pending) {
    const parsed = await ws.parseLetter(p);
    if (parsed && parsed.frontmatter.deliver_at <= now && !parsed.frontmatter.delivered) due.push({ path: p, ...parsed });
  }

  console.log(\`\${due.length} / \${pending.length} letters due\`);
  let processed = 0, lastError = null;

  for (const letter of due) {
    try {
      const { frontmatter, body } = letter;
      const gmResponse = await engine.processDelivery({ letter: body, from: frontmatter.from, to: frontmatter.to, game: gameJson });
      if (gmResponse.sender_location_update) await ws.writeLocation(frontmatter.from, gmResponse.sender_location_update);
      if (gmResponse.recipient_location_update) await ws.writeLocation(frontmatter.to, gmResponse.recipient_location_update);
      if (gmResponse.next_letter_travel_hours > 0) { gameJson.default_travel_hours = gmResponse.next_letter_travel_hours; await ws.writeGameJson(gameJson); }
      await ws.deliverLetter(letter.path);
      processed++;
    } catch (err) { console.error('Error:', err); lastError = err; }
  }

  await engine.summarizeIfNeeded();
  await engine.statusWriter.write({ trigger: 'letter_delivery', lettersProcessed: processed, success: !lastError, error: lastError });
  console.log('GM done. Processed:', processed);
}

main().catch(e => { console.error(e); process.exit(1); });
`;
}

function buildWorkflow() {
  return `name: GM Loop
on:
  schedule:
    - cron: '0 * * * *'
  workflow_dispatch:
    inputs:
      trigger:
        description: 'letter_delivery | seed_generation | finalization'
        default: 'letter_delivery'

permissions:
  contents: write

jobs:
  gm:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
        working-directory: scripts
      - run: node scripts/gm.js
        env:
          COPILOT_TOKEN: \${{ secrets.COPILOT_TOKEN }}
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          TRIGGER: \${{ inputs.trigger || 'letter_delivery' }}
`;
}
