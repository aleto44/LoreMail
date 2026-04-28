import { WorldState } from './world-state.js';
import { CanonManager } from './canon-manager.js';
import { FactExtractor } from './fact-extractor.js';
import { ConsistencyChecker } from './consistency.js';
import { PromptBuilder } from './prompt-builder.js';
import { ModelClient } from './model-client.js';
import { StatusWriter } from './status-writer.js';

/**
 * GMEngine — public API for the LoreMail GM engine.
 * Wires all modules together.
 */
export class GMEngine {
  constructor({ repoPath, model, apiToken, engineConfig = {}, baseUrl }) {
    this.repoPath = repoPath;
    this.engineConfig = engineConfig;

    this.ws = new WorldState(repoPath);
    this.modelClient = new ModelClient({
      model,
      apiToken,
      baseUrl,
      temperature: engineConfig.temperature ?? 0.4,
    });
    this.canonManager = new CanonManager(this.ws, engineConfig);
    this.factExtractor = new FactExtractor(this.ws, this.modelClient);
    this.consistencyChecker = new ConsistencyChecker(this.ws, this.modelClient);
    this.promptBuilder = new PromptBuilder();
    this.statusWriter = new StatusWriter(this.ws);
  }

  /**
   * Generate the world seed on first game creation.
   * @param {{ flavour, era, tone, gmStyle, game }} context
   */
  async generateWorldSeed({ flavour, era, tone, gmStyle, game }) {
    const messages = this.promptBuilder.buildSeedPrompt({ flavour, era, tone, gmStyle });
    const seed = await this.modelClient.chat(messages, { temperature: 0.6, maxTokens: 600 });
    await this.ws.writeSeed(seed);
    await this.canonManager.initBlank();
    return seed;
  }

  /**
   * Process a single delivered letter.
   * @param {{ letter, from, to, game }} context
   * @returns {object} GM response JSON
   */
  async processDelivery({ letter, from, to, game }) {
    const [
      seed,
      facts,
      canonRaw,
      events,
      gmNotes,
      senderCharacter,
      senderLocation,
      recipientCharacter,
      recipientLocation,
    ] = await Promise.all([
      this.ws.readSeed(),
      this.ws.readFacts(),
      this.ws.readCanon(),
      this.ws.readEvents(),
      this.ws.readGmNotes(),
      this.ws.readCharacter(from),
      this.ws.readLocation(from),
      this.ws.readCharacter(to),
      this.ws.readLocation(to),
    ]);

    // Parse canon sections
    const deepMatch = canonRaw.match(/## DEEP HISTORY\n[\s\S]*?\n\n([\s\S]*?)(?=---\n## RECENT HISTORY|$)/);
    const recentMatch = canonRaw.match(/## RECENT HISTORY\n[\s\S]*?\n\n([\s\S]*?)$/);
    const deepHistory = deepMatch ? deepMatch[1].trim() : '';
    const recentHistory = recentMatch ? recentMatch[1].trim() : '';

    // Find sender and recipient player entries in game.json
    const senderPlayer = game.players?.find(p => p.id === from);
    const recipientPlayer = game.players?.find(p => p.id === to);
    const senderName = senderPlayer?.character ?? from;
    const recipientName = recipientPlayer?.character ?? to;

    const messages = this.promptBuilder.buildDeliveryPrompt({
      seed,
      facts,
      deepHistory,
      recentHistory,
      events,
      gmNotes,
      senderCharacter,
      senderLocation,
      recipientCharacter,
      recipientLocation,
      letterBody: letter,
      senderName,
      recipientName,
      game,
    });

    const raw = await this.modelClient.chat(messages);
    let gmResponse;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      gmResponse = JSON.parse(jsonMatch?.[0] ?? raw);
    } catch {
      console.error('Failed to parse GM response:', raw);
      throw new Error('GM response was not valid JSON');
    }

    // Consistency check before writing
    if (this.engineConfig.consistency_check && gmResponse.canon_addition) {
      await this.runConsistencyCheck(gmResponse.canon_addition);
    }

    // Append canon entry
    if (gmResponse.canon_addition) {
      await this.canonManager.appendEntry(gmResponse.canon_addition);
    }

    // Fact extraction
    if (this.engineConfig.fact_extraction && gmResponse.canon_addition) {
      await this.extractFacts(gmResponse.canon_addition);
    }

    // Append world event
    if (gmResponse.world_event) {
      const timestamp = new Date().toISOString().split('T')[0];
      await this.ws.appendToFile('world/events.md', `\n### ${timestamp}\n${gmResponse.world_event}`);
    }

    // Append GM notes
    if (gmResponse.gm_notes_addition) {
      await this.ws.appendToFile('world/gm-notes.md', `\n${gmResponse.gm_notes_addition}`);
    }

    return gmResponse;
  }

  /**
   * Generate the closing chronicle.
   */
  async generateChronicle({ game }) {
    const [seed, facts, canon, events] = await Promise.all([
      this.ws.readSeed(),
      this.ws.readFacts(),
      this.ws.readCanon(),
      this.ws.readEvents(),
    ]);

    // Build character summaries
    const characterParts = await Promise.all(
      (game.players ?? [])
        .filter(p => p.joined && p.character)
        .map(async p => {
          const char = await this.ws.readCharacter(p.id);
          const loc = await this.ws.readLocation(p.id);
          return `### ${p.character}\n${char}\nLast known location: ${loc}`;
        }),
    );
    const characters = characterParts.join('\n\n');

    const messages = this.promptBuilder.buildChroniclePrompt({
      seed,
      facts,
      canon,
      events,
      characters,
      game,
    });

    const chronicle = await this.modelClient.chat(messages, { temperature: 0.5, maxTokens: 2000 });
    await this.ws.writeChronicle(chronicle);
    return chronicle;
  }

  async runConsistencyCheck(proposedAddition) {
    return await this.consistencyChecker.check(proposedAddition);
  }

  async extractFacts(newCanonText) {
    return await this.factExtractor.extractFacts(newCanonText);
  }

  async summarizeIfNeeded() {
    if (await this.canonManager.isCompressionNeeded()) {
      await this.canonManager.runCompression(this.modelClient);
      return true;
    }
    return false;
  }

  get worldState() {
    return this.ws;
  }
}
