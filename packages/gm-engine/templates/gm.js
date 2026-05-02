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
  if (!apiToken) throw new Error('COPILOT_TOKEN environment variable is required');

  const gameJson = JSON.parse(await readFile(path.join(REPO_PATH, 'config/game.json'), 'utf8'));
  const engineJson = JSON.parse(await readFile(path.join(REPO_PATH, 'config/engine.json'), 'utf8'));

  if (gameJson.gm_paused && TRIGGER === 'letter_delivery') {
    console.log('GM is paused. Exiting.');
    process.exit(0);
  }

  const engine = new GMEngine({
    repoPath: REPO_PATH,
    model: gameJson.model ?? 'openai/gpt-4.1',
    apiToken,
    engineConfig: engineJson,
  });

  const ws = engine.worldState;

  if (TRIGGER === 'seed_generation') {
    console.log('Generating world seed...');
    const founderPlayer = gameJson.players?.find(p => p.is_founder);
    await engine.generateWorldSeed({
      flavour: gameJson.flavour,
      era: gameJson.era,
      tone: gameJson.tone,
      gmStyle: gameJson.gm_style,
      game: gameJson,
      founderCharacter: founderPlayer
        ? { name: founderPlayer.character, bio: founderPlayer.bio, location: founderPlayer.location }
        : null,
    });
    await engine.writeStatus({ trigger: 'seed_generation', lettersProcessed: 0, success: true });
    console.log('World seed generated.');
    return;
  }

  if (TRIGGER === 'finalization') {
    console.log('Generating chronicle...');
    await engine.generateChronicle({ game: gameJson });
    await engine.writeStatus({ trigger: 'finalization', lettersProcessed: 0, success: true });
    console.log('Chronicle generated.');
    return;
  }

  if (TRIGGER === 'player_joined') {
    if (!PLAYER_ID) throw new Error('PLAYER_ID environment variable is required for player_joined trigger');
    console.log(`Processing player join for: ${PLAYER_ID}`);
    const result = await engine.processPlayerJoin({ playerId: PLAYER_ID, game: gameJson });
    await engine.writeStatus({ trigger: 'player_joined', lettersProcessed: 0, success: true, skipped: result.skipped ?? false });
    console.log(`Player join processed. skipped=${result.skipped ?? false} reason=${result.reason ?? 'n/a'}`);
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
  const deliveries = [];

  for (const letter of dueLetters) {
    const { frontmatter, body } = letter;
    const letterId = path.basename(letter.path);
    try {
      console.log(`Processing: ${letterId}`);
      const result = await engine.processDelivery({
        letter: body,
        from: frontmatter.from,
        to: frontmatter.to,
        game: gameJson,
        sentAt: frontmatter.sent_at,
      });

      if (result.senderLocationUpdate) {
        await ws.writeLocation(frontmatter.from, result.senderLocationUpdate);
      }
      if (result.recipientLocationUpdate) {
        await ws.writeLocation(frontmatter.to, result.recipientLocationUpdate);
      }
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
      console.error(`Error processing ${letterId}:`, err.message);
      lastError = err;
      deliveries.push({
        letterId, to: frontmatter.to, success: false,
        canonAddition: false, worldEvent: false,
        consistencyConflict: false, error: err.message,
      });
    }
  }

  const compressionRan = await engine.summarizeIfNeeded();
  if (compressionRan) console.log('Canon compression ran.');

  await engine.writeStatus({
    trigger: 'letter_delivery',
    lettersProcessed: processed,
    success: lastError === null,
    error: lastError,
    compressionRan,
    deliveries,
  });

  console.log(`GM run complete. Processed: ${processed}. Success: ${lastError === null}.`);

  // ── Push notifications ────────────────────────────────────────────────────
  // Notify letter recipients via the Loremail Worker (best-effort, non-fatal).
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
          const res = await fetch(`${WORKER_URL}/push/notify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameId, notifyToken: NOTIFY_TOKEN, recipients }),
          });
          console.log(`Push notify response: ${res.status}`);
        } catch (e) {
          console.warn('Push notify failed (non-fatal):', e.message);
        }
      }
    }
  }
}

main().catch(err => {
  console.error('Fatal GM error:', err);
  process.exit(1);
});