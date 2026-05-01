import { WorldState } from './world-state.js';
import { CanonManager } from './canon-manager.js';
import { FactExtractor } from './fact-extractor.js';
import { ConsistencyChecker } from './consistency.js';
import { PromptBuilder } from './prompt-builder.js';
import { ModelClient } from './model-client.js';
import { StatusWriter } from './status-writer.js';

/**
 * GMEngine — public API for the LoreMail GM engine.
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
      defaultTemperature: engineConfig.temperature ?? 0.4,
      defaultMaxTokens: 1500,
    });
    this.canonManager = new CanonManager(this.ws, engineConfig);
    this.factExtractor = new FactExtractor(this.ws, this.modelClient);
    this.consistencyChecker = new ConsistencyChecker(this.ws, this.modelClient);
    this.promptBuilder = new PromptBuilder();
    this._statusWriter = new StatusWriter(this.ws);
  }

  /**
   * Generate the world seed on first game creation.
   * Writes seed.md and the first canon entry.
   */
  async generateWorldSeed({ flavour, era, tone, gmStyle, game, founderCharacter }) {
    const messages = this.promptBuilder.buildSeedPrompt({
      worldName: game?.name,
      flavour,
      era,
      tone,
      gmStyle,
      founderCharacter,
    });

    const result = await this.modelClient.chatJson(messages, { temperature: 0.6, maxTokens: 800 });

    const seed = result.seed ?? result;
    const firstCanonEntry = result.first_canon_entry;

    await this.ws.writeSeed(typeof seed === 'string' ? seed : JSON.stringify(seed));
    await this.canonManager.initBlank();

    if (firstCanonEntry) {
      await this.canonManager.appendEntry(firstCanonEntry);
    }

    // Seed the founder's starting location as the first map node
    if (result.map_updates) {
      const now = Math.floor(Date.now() / 1000);
      await this.ws.updateMapJson(result.map_updates, now);
    }

    return { seed, firstCanonEntry };
  }

  /**
   * Process a single delivered letter.
   * Returns a GMDeliveryResult object.
   */
  async processDelivery({ letter, from, to, game, sentAt }) {
    const eventsWindow = this.engineConfig.events_window ?? 20;

    const [
      seed, facts, canonRaw, events, gmNotes,
      senderCharacter, senderLocation, recipientCharacter, recipientLocation,
    ] = await Promise.all([
      this.ws.readSeed(),
      this.ws.readFacts(),
      this.ws.readCanon(),
      this.ws.readEvents(eventsWindow),
      this.ws.readGmNotes(),
      this.ws.readCharacter(from),
      this.ws.readLocation(from),
      this.ws.readCharacter(to),
      this.ws.readLocation(to),
    ]);

    const { deep: deepHistory, recent: recentHistory } = this.ws.parseSections(canonRaw);

    const senderPlayer = game.players?.find(p => p.id === from);
    const recipientPlayer = game.players?.find(p => p.id === to);
    const senderName = senderPlayer?.character ?? from;
    const recipientName = recipientPlayer?.character ?? to;

    const messages = this.promptBuilder.buildDeliveryPrompt({
      seed, facts, deepHistory, recentHistory, events, gmNotes,
      senderCharacter, senderLocation, recipientCharacter, recipientLocation,
      letterBody: letter, senderName, recipientName, sentAt, game,
    });

    let gmResponse;
    try {
      gmResponse = await this.modelClient.chatJson(messages);
    } catch (err) {
      throw new Error(`GM model call failed: ${err.message}`);
    }

    // Fill defaults for missing fields
    gmResponse.next_letter_travel_hours = Math.max(1, parseInt(gmResponse.next_letter_travel_hours) || (game.default_travel_hours ?? 24));

    let canonAdditionToWrite = gmResponse.canon_addition ?? null;
    let consistencyConflict = false;

    // Consistency check before writing
    if (this.engineConfig.consistency_check !== false && canonAdditionToWrite) {
      const check = await this.consistencyChecker.check(canonAdditionToWrite);
      consistencyConflict = !check.consistent;
      canonAdditionToWrite = check.resolvedAddition;
    }

    // Append canon entry (model produces full ### [DEVELOPING] formatted entry)
    if (canonAdditionToWrite) {
      await this.canonManager.appendEntry(canonAdditionToWrite);
    }

    // Fact extraction
    if (this.engineConfig.fact_extraction !== false && canonAdditionToWrite) {
      await this.factExtractor.extractFacts(canonAdditionToWrite);
    }

    // Append world event
    if (gmResponse.world_event) {
      const timestamp = new Date().toISOString().split('T')[0];
      await this.ws.appendToFile('world/events.md', `\n### ${timestamp}\n${gmResponse.world_event}`);
    }

    // Append GM notes
    if (gmResponse.gm_notes_addition) {
      const timestamp = new Date().toISOString();
      await this.ws.appendToFile('world/gm-notes.md', `\n<!-- ${timestamp} -->\n${gmResponse.gm_notes_addition}`);
    }

    // Update character files if model provided updates
    if (gmResponse.sender_character_update) {
      await this.ws.updateCharacter(from, gmResponse.sender_character_update);
    }
    if (gmResponse.recipient_character_update) {
      await this.ws.updateCharacter(to, gmResponse.recipient_character_update);
    }

    // Write world lore JSON files
    const loreNow = Math.floor(Date.now() / 1000);
    if (gmResponse.map_updates?.new_nodes?.length || gmResponse.map_updates?.new_edges?.length) {
      await this.ws.updateMapJson(gmResponse.map_updates, loreNow);
    }
    if (gmResponse.new_people?.length || gmResponse.updated_people?.length) {
      await this.ws.updatePeopleJson({
        new_people: gmResponse.new_people,
        updated_people: gmResponse.updated_people,
      }, loreNow);
    }
    if (gmResponse.new_factions?.length || gmResponse.updated_factions?.length) {
      await this.ws.updateFactionsJson({
        new_factions: gmResponse.new_factions,
        updated_factions: gmResponse.updated_factions,
      }, loreNow);
    }
    if (gmResponse.timeline_entry?.id) {
      await this.ws.appendTimelineEntry(gmResponse.timeline_entry, loreNow);
    }

    // Update player character locations on the map
    if (gmResponse.sender_location_node_id) {
      await this.ws.updatePlayerLocationOnMap(from, gmResponse.sender_location_node_id);
    }
    if (gmResponse.recipient_location_node_id) {
      await this.ws.updatePlayerLocationOnMap(to, gmResponse.recipient_location_node_id);
    }

    return {
      success: true,
      canonAddition: canonAdditionToWrite,
      worldEvent: gmResponse.world_event ?? null,
      gmNotesAddition: gmResponse.gm_notes_addition ?? null,
      senderCharacterUpdate: gmResponse.sender_character_update ?? null,
      recipientCharacterUpdate: gmResponse.recipient_character_update ?? null,
      senderLocationUpdate: gmResponse.sender_location_update ?? null,
      recipientLocationUpdate: gmResponse.recipient_location_update ?? null,
      nextLetterTravelHours: gmResponse.next_letter_travel_hours,
      consistencyConflict,
      error: null,
    };
  }

  /**
   * Canonize a newly-joined player's starting location into the world map.
   * Called via the `player_joined` trigger — runs even when there are no pending letters.
   */
  async processPlayerJoin({ playerId, game }) {
    const [seed, facts, playerCharacter, playerLocation] = await Promise.all([
      this.ws.readSeed(),
      this.ws.readFacts(),
      this.ws.readCharacter(playerId),
      this.ws.readLocation(playerId),
    ]);

    const location = playerLocation?.trim();
    if (!location || location === 'Unknown') {
      return { success: true, skipped: true, reason: 'no location set' };
    }

    // Check if a node for this location already exists (by label, case-insensitive)
    const map = await this.ws.readWorldJson('world/map.json');
    const locationLower = location.toLowerCase();
    const alreadyOnMap = map.nodes.some(
      n => n.label.toLowerCase() === locationLower
        || n.id === locationLower.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    );
    if (alreadyOnMap) {
      return { success: true, skipped: true, reason: 'location already on map' };
    }

    const playerEntry = game.players?.find(p => p.id === playerId);
    const characterName = playerEntry?.character ?? playerId;

    const messages = this.promptBuilder.buildPlayerJoinPrompt({
      seed, facts, playerCharacter, playerLocation: location, characterName, game,
    });

    let gmResponse;
    try {
      gmResponse = await this.modelClient.chatJson(messages, { temperature: 0.5, maxTokens: 900 });
    } catch (err) {
      throw new Error(`GM model call failed (player_joined): ${err.message}`);
    }

    const now = Math.floor(Date.now() / 1000);

    if (gmResponse.map_updates?.new_nodes?.length) {
      await this.ws.updateMapJson(gmResponse.map_updates, now);
    }
    if (gmResponse.canon_addition) {
      await this.canonManager.appendEntry(gmResponse.canon_addition);
    }
    if (gmResponse.world_event) {
      const timestamp = new Date().toISOString().split('T')[0];
      await this.ws.appendToFile('world/events.md', `\n### ${timestamp}\n${gmResponse.world_event}`);
    }
    if (gmResponse.gm_notes_addition) {
      const timestamp = new Date().toISOString();
      await this.ws.appendToFile('world/gm-notes.md', `\n<!-- ${timestamp} -->\n${gmResponse.gm_notes_addition}`);
    }
    if (gmResponse.player_location_node_id) {
      await this.ws.updatePlayerLocationOnMap(playerId, gmResponse.player_location_node_id);
    }

    return { success: true, skipped: false };
  }

  /** Generate the closing chronicle */
  async generateChronicle({ game }) {
    const [seed, facts, canon, events] = await Promise.all([
      this.ws.readSeed(),
      this.ws.readFacts(),
      this.ws.readCanon(),
      this.ws.readEvents(100),
    ]);

    const characterParts = await Promise.all(
      (game.players ?? [])
        .filter(p => p.joined && !p.removed && p.character)
        .map(async p => {
          const [char, loc] = await Promise.all([
            this.ws.readCharacter(p.id),
            this.ws.readLocation(p.id),
          ]);
          return `### ${p.character}\n${char}\nLast known location: ${loc}`;
        }),
    );

    const messages = this.promptBuilder.buildChroniclePrompt({
      seed, facts, canon, events,
      characters: characterParts.join('\n\n'),
      game,
    });

    const chronicle = await this.modelClient.chat(messages, { temperature: 0.5, maxTokens: 2000 });
    await this.ws.writeChronicle(chronicle);
    return chronicle;
  }

  /** Write run status — always called by gm.js at the end of a run */
  async writeStatus(payload) {
    return await this._statusWriter.write(payload);
  }

  async summarizeIfNeeded() {
    if (await this.canonManager.isCompressionNeeded()) {
      await this.canonManager.runCompression(this.modelClient);
      return true;
    }
    return false;
  }

  /** Expose statusWriter for gm.js compatibility */
  get statusWriter() { return this._statusWriter; }

  get worldState() { return this.ws; }
}