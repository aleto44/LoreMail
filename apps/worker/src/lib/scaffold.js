import { engineFiles } from './engine-files.js';

/**
 * Build all game repo scaffold files.
 * Returns a flat object: { 'path/file': 'content' }
 */
export function buildGameScaffold({ gameJson, engineJson, founderId, founderCharacterName, founderCharacterBio, founderCharacterLocation }) {
  const files = {};

  files['config/game.json'] = JSON.stringify(gameJson, null, 2);
  files['config/engine.json'] = JSON.stringify(engineJson, null, 2);

  files['world/canon.md'] = `## DEEP HISTORY\n*[summarized — compressed from earlier records]*\n\n\n\n---\n\n## RECENT HISTORY\n*[verbatim — last recorded entries]*\n\n`;
  files['world/canon-facts.md'] = `# Canon Facts\n\n`;
  files['world/events.md'] = `# World Events\n\n`;
  files['world/gm-notes.md'] = `# GM Notes (Private)\n\n`;
  files['world/seed.md'] = `# World Seed\n\n*Generating...*`;
  files['world/chronicle.md'] = '';

  // World lore JSON — scaffold with empty defaults so these files always exist
  // and the PWA never gets 404s while waiting for the first GM run.
  files['world/map.json']      = JSON.stringify({ nodes: [], edges: [], player_locations: {} }, null, 2);
  files['world/people.json']   = JSON.stringify({ people: [] }, null, 2);
  files['world/factions.json'] = JSON.stringify({ factions: [] }, null, 2);
  files['world/timeline.json'] = JSON.stringify({ entries: [] }, null, 2);

  files[`players/${founderId}/character.md`] = `# ${founderCharacterName}\n\n${founderCharacterBio}`;
  files[`players/${founderId}/location.md`] = founderCharacterLocation || `Unknown`;
  files[`players/${founderId}/read-receipts.json`] = JSON.stringify({ v: 1, readIds: [] }, null, 2);

  files['letters/.gitkeep'] = '';
  files['letters/pending/.gitkeep'] = '';
  files['letters/delivered/.gitkeep'] = '';

  files['.gitignore'] = `node_modules/\n.env\n`;

  files['scripts/gm.js'] = buildGmScript();
  files['package.json'] = JSON.stringify(
    {
      name: 'game-scripts',
      version: '1.0.0',
      private: true,
      type: 'module',
      dependencies: { 'gray-matter': '^4.0.3' },
    },
    null,
    2,
  );

  files['.github/workflows/gm-loop.yml'] = buildWorkflow();

  // Embed gm-engine source so game repos don't need it on npm
  Object.assign(files, engineFiles);

  files['.gm-status.json'] = JSON.stringify({
    timestamp: null,
    trigger: null,
    lettersProcessed: 0,
    success: null,
  }, null, 2);

  return files;
}

export function buildGmScript() {
  return `#!/usr/bin/env node
import { GMEngine } from '../engine/index.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFile } from 'fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_PATH = path.resolve(__dirname, '..');
const TRIGGER = process.env.TRIGGER ?? 'letter_delivery';
const PLAYER_ID = process.env.PLAYER_ID ?? '';

async function main() {
  const apiToken = process.env.COPILOT_TOKEN;
  if (!apiToken) throw new Error('COPILOT_TOKEN required');

  const gameJson = JSON.parse(await readFile(path.join(REPO_PATH, 'config/game.json'), 'utf8'));
  const engineJson = JSON.parse(await readFile(path.join(REPO_PATH, 'config/engine.json'), 'utf8'));

  if (gameJson.gm_paused && TRIGGER === 'letter_delivery') {
    console.log('GM paused.'); process.exit(0);
  }

  const engine = new GMEngine({
    repoPath: REPO_PATH, model: gameJson.model ?? 'openai/gpt-4.1',
    apiToken, engineConfig: engineJson,
  });
  const ws = engine.worldState;

  if (TRIGGER === 'player_joined') {
    if (!PLAYER_ID) { console.warn('player_joined trigger missing PLAYER_ID — skipping.'); return; }
    const player = gameJson.players?.find(p => p.id === PLAYER_ID);
    if (!player) { console.warn(\`player_joined: player \${PLAYER_ID} not found in game.json — skipping.\`); return; }
    const result = await engine.processPlayerJoin({ playerId: PLAYER_ID, game: gameJson });
    await engine.writeStatus({ trigger: 'player_joined', lettersProcessed: 0, success: true, skipped: result.skipped ?? false, extraData: { playerId: PLAYER_ID, reason: result.reason } });
    console.log(\`Player join processed. skipped=\${result.skipped ?? false} reason=\${result.reason ?? 'n/a'}\`); return;
  }

  if (TRIGGER === 'seed_generation') {
    const founderPlayer = gameJson.players?.find(p => p.is_founder);
    await engine.generateWorldSeed({
      flavour: gameJson.flavour, era: gameJson.era, tone: gameJson.tone,
      gmStyle: gameJson.gm_style, game: gameJson,
      founderCharacter: founderPlayer ? { name: founderPlayer.character, bio: founderPlayer.bio, location: founderPlayer.location } : null,
    });
    await engine.writeStatus({ trigger: 'seed_generation', lettersProcessed: 0, success: true });
    console.log('Seed generated.'); return;
  }

  if (TRIGGER === 'finalization') {
    await engine.generateChronicle({ game: gameJson });
    await engine.writeStatus({ trigger: 'finalization', lettersProcessed: 0, success: true });
    console.log('Chronicle generated.'); return;
  }

  if (TRIGGER === 'chapterize') {
    console.log('Chapterizing current canon entries...');
    const result = await engine.processChapterize({ game: gameJson });
    if (result.success) {
      console.log(\`Chapter \${result.chapter.number} created: "\${result.chapter.title}"\`);
      await engine.writeStatus({ trigger: 'chapterize', lettersProcessed: 0, success: true });
    } else {
      console.log(\`Chapterize skipped: \${result.reason}\`);
      await engine.writeStatus({ trigger: 'chapterize', lettersProcessed: 0, success: false, error: result.reason });
    }
    return;
  }

  // letter_delivery
  const now = Math.floor(Date.now() / 1000);
  const pending = await ws.listPendingLetters();
  const due = [];
  for (const p of pending) {
    const parsed = await ws.parseLetter(p);
    if (parsed && parsed.frontmatter.deliver_at <= now && !parsed.frontmatter.delivered) {
      due.push({ path: p, ...parsed });
    }
  }

  console.log(\`\${due.length} / \${pending.length} letters due\`);
  let processed = 0, lastError = null;
  const deliveries = [];

  for (const letter of due) {
    const { frontmatter, body } = letter;
    const letterId = path.basename(letter.path);
    try {
      const result = await engine.processDelivery({
        letter: body, from: frontmatter.from, to: frontmatter.to,
        game: gameJson, sentAt: frontmatter.sent_at,
      });
      if (result.senderLocationUpdate) await ws.writeLocation(frontmatter.from, result.senderLocationUpdate);
      if (result.recipientLocationUpdate) await ws.writeLocation(frontmatter.to, result.recipientLocationUpdate);
      if (result.nextLetterTravelHours > 0) {
        gameJson.default_travel_hours = result.nextLetterTravelHours;
        await ws.writeGameJson(gameJson);
      }
      await ws.deliverLetter(letter.path);
      processed++;
      deliveries.push({
        letterId, to: frontmatter.to, success: true,
        canonAddition: !!result.canonAddition,
        worldEvent: !!result.worldEvent,
        consistencyConflict: result.consistencyConflict,
        error: null,
      });
    } catch (err) {
      console.error('Error processing', letterId, err.message);
      lastError = err;
      deliveries.push({ letterId, to: frontmatter.to, success: false, canonAddition: false, worldEvent: false, consistencyConflict: false, error: err.message });
    }
  }

  const compressionRan = await engine.summarizeIfNeeded();

  // Nothing to do — skip status update to avoid noisy zero-letter commits.
  if (processed === 0 && compressionRan === false && lastError === null) {
    console.log('No letters processed and no compression ran — skipping status update.');
    return;
  }
  await engine.writeStatus({
    trigger: 'letter_delivery', lettersProcessed: processed,
    success: !lastError, error: lastError,
    compressionRan, deliveries,
  });
  console.log('GM done. Processed:', processed);

  // ── Push notifications ───────────────────────────────────────────────────
  // After the GM run (and before the workflow commits), notify recipients.
  if (processed > 0) {
    const WORKER_URL = process.env.LOREMAIL_WORKER_URL;
    const NOTIFY_TOKEN = process.env.LOREMAIL_NOTIFY_TOKEN;
    const gameId = gameJson.id;
    if (WORKER_URL && NOTIFY_TOKEN && gameId) {
      const recipients = [...new Set(
        deliveries.filter(d => d.success && d.to).map(d => d.to),
      )];
      if (recipients.length > 0) {
        try {
          const res = await fetch(\`\${WORKER_URL}/push/notify\`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameId, notifyToken: NOTIFY_TOKEN, recipients }),
          });
          console.log(\`Push notify response: \${res.status}\`);
        } catch (e) {
          // Non-fatal — letters are delivered, notification is best-effort
          console.warn('Push notify failed (non-fatal):', e.message);
        }
      }
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
`;
}

export function buildWorkflow() {
  return `name: GM Loop
on:
  schedule:
    - cron: '0 * * * *'
  workflow_dispatch:
    inputs:
      trigger:
        description: 'Trigger type'
        required: true
        default: 'letter_delivery'
        type: choice
        options:
          - letter_delivery
          - chapterize
          - seed_generation
          - finalization
          - player_joined
      player_id:
        description: 'Player ID — required for the player_joined trigger'
        default: ''

permissions:
  contents: write

jobs:
  gm:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Check for due letters (skip if none)
        if: \${{ (inputs.trigger || 'letter_delivery') == 'letter_delivery' }}
        run: |
          NOW=\$(date +%s)
          SKIP=true
          shopt -s nullglob
          for f in letters/pending/*.md; do
            FNAME=\$(basename "\$f")
            DELIVER_AT="\${FNAME%%_*}"
            if [[ "\$DELIVER_AT" =~ ^[0-9]+\$ ]] && (( DELIVER_AT <= NOW )); then
              SKIP=false
              break
            fi
          done
          if [ "\$SKIP" = "true" ]; then
            echo "No letters due for delivery. Exiting early."
            echo "SKIP_GM=true" >> "\$GITHUB_ENV"
          fi

      - uses: actions/setup-node@v4
        if: \${{ env.SKIP_GM != 'true' }}
        with:
          node-version: '20'
      - name: Cache node_modules
        if: \${{ env.SKIP_GM != 'true' }}
        uses: actions/cache@v4
        with:
          path: node_modules
          key: \${{ runner.os }}-npm-\${{ hashFiles('package.json') }}
          restore-keys: \${{ runner.os }}-npm-
      - run: npm install
        if: \${{ env.SKIP_GM != 'true' }}
      - run: node scripts/gm.js
        if: \${{ env.SKIP_GM != 'true' }}
        env:
          COPILOT_TOKEN: \${{ secrets.COPILOT_TOKEN }}
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          TRIGGER: \${{ inputs.trigger || 'letter_delivery' }}
          PLAYER_ID: \${{ inputs.player_id || '' }}
          LOREMAIL_NOTIFY_TOKEN: \${{ secrets.LOREMAIL_NOTIFY_TOKEN }}
          LOREMAIL_WORKER_URL: \${{ secrets.LOREMAIL_WORKER_URL }}
      - name: Commit GM changes
        if: \${{ env.SKIP_GM != 'true' }}
        run: |
          git config user.name "GM Engine"
          git config user.email "gm@loremail.app"
          git add -A
          git diff --staged --quiet || git commit -m "GM: \${{ inputs.trigger || 'letter_delivery' }} \$(date -u +%s)"
          git pull --rebase origin main
          git push
`;
}
