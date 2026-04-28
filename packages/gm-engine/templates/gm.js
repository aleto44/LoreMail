#!/usr/bin/env node
/**
 * scripts/gm.js — Loremail-specific GM entry point.
 * Runs inside the game repo via GitHub Actions.
 *
 * Trigger types:
 *   letter_delivery  — default, checks pending letters
 *   seed_generation  — generates world seed on game creation
 *   finalization     — generates chronicle.md
 */
import { GMEngine } from 'loremail-gm-engine';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_PATH = path.resolve(__dirname, '..');
const TRIGGER = process.env.TRIGGER ?? 'letter_delivery';

async function main() {
  const apiToken = process.env.COPILOT_TOKEN;
  if (!apiToken) throw new Error('COPILOT_TOKEN environment variable is required');

  // Load config
  let gameJson, engineJson;
  try {
    const { readFile } = await import('fs/promises');
    gameJson = JSON.parse(await readFile(path.join(REPO_PATH, 'config/game.json'), 'utf8'));
    engineJson = JSON.parse(await readFile(path.join(REPO_PATH, 'config/engine.json'), 'utf8'));
  } catch (e) {
    throw new Error(`Failed to load config: ${e.message}`);
  }

  if (gameJson.gm_paused && TRIGGER === 'letter_delivery') {
    console.log('GM is paused. Exiting.');
    process.exit(0);
  }

  const engine = new GMEngine({
    repoPath: REPO_PATH,
    model: gameJson.model ?? 'gpt-4o',
    apiToken,
    engineConfig: engineJson,
  });

  const ws = engine.worldState;

  if (TRIGGER === 'seed_generation') {
    console.log('Generating world seed...');
    await engine.generateWorldSeed({
      flavour: gameJson.flavour,
      era: gameJson.era,
      tone: gameJson.tone,
      gmStyle: gameJson.gm_style,
      game: gameJson,
    });
    await engine.statusWriter.write({
      trigger: 'seed_generation',
      lettersProcessed: 0,
      success: true,
    });
    console.log('World seed generated.');
    return;
  }

  if (TRIGGER === 'finalization') {
    console.log('Generating chronicle...');
    await engine.generateChronicle({ game: gameJson });
    await engine.statusWriter.write({
      trigger: 'finalization',
      lettersProcessed: 0,
      success: true,
    });
    console.log('Chronicle generated.');
    return;
  }

  // Default: letter_delivery
  const now = Math.floor(Date.now() / 1000);
  const pendingLetters = await ws.listPendingLetters();
  const dueLetters = [];

  for (const letterPath of pendingLetters) {
    const parsed = await ws.parseLetter(letterPath);
    if (!parsed) continue;
    const { frontmatter } = parsed;
    if (frontmatter.deliver_at <= now && !frontmatter.delivered) {
      dueLetters.push({ path: letterPath, ...parsed });
    }
  }

  console.log(`Found ${dueLetters.length} due letter(s) of ${pendingLetters.length} pending.`);

  let processed = 0;
  let lastError = null;

  for (const letter of dueLetters) {
    try {
      console.log(`Processing letter: ${letter.path}`);
      const { frontmatter, body } = letter;

      const gmResponse = await engine.processDelivery({
        letter: body,
        from: frontmatter.from,
        to: frontmatter.to,
        game: gameJson,
      });

      // Update sender location
      if (gmResponse.sender_location_update) {
        await ws.writeLocation(frontmatter.from, gmResponse.sender_location_update);
      }

      // Update recipient location
      if (gmResponse.recipient_location_update) {
        await ws.writeLocation(frontmatter.to, gmResponse.recipient_location_update);
      }

      // Update travel time in game.json
      if (gmResponse.next_letter_travel_hours && gmResponse.next_letter_travel_hours > 0) {
        gameJson.default_travel_hours = gmResponse.next_letter_travel_hours;
        await ws.writeGameJson(gameJson);
      }

      // Deliver the letter (move to /delivered/, mark delivered: true)
      await ws.deliverLetter(letter.path);

      processed++;
    } catch (err) {
      console.error(`Error processing ${letter.path}:`, err);
      lastError = err;
    }
  }

  // Check if canon needs compression
  const compressed = await engine.summarizeIfNeeded();
  if (compressed) {
    console.log('Canon compression ran.');
  }

  await engine.statusWriter.write({
    trigger: 'letter_delivery',
    lettersProcessed: processed,
    success: lastError === null,
    error: lastError,
  });

  console.log(`GM run complete. Processed: ${processed}. Success: ${lastError === null}.`);
}

main().catch(err => {
  console.error('Fatal GM error:', err);
  process.exit(1);
});
