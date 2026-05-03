import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';

/**
 * WorldState — all file reads and writes for the game repo.
 * Enforces append-only access to canon.md (except compression rewrites and character updates).
 */
export class WorldState {
  constructor(repoPath) {
    this.repoPath = repoPath;
  }

  _resolve(...parts) {
    return path.join(this.repoPath, ...parts);
  }

  async readFile(relPath) {
    try {
      return await fs.readFile(this._resolve(relPath), 'utf8');
    } catch (e) {
      if (e.code === 'ENOENT') return null;
      throw e;
    }
  }

  async writeFile(relPath, content) {
    const full = this._resolve(relPath);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content, 'utf8');
  }

  /** APPEND-ONLY — the only way to add to canon.md (outside of compression) */
  async appendToCanon(text) {
    const filePath = this._resolve('world/canon.md');
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.appendFile(filePath, '\n' + text, 'utf8');
  }

  async appendToFile(relPath, text) {
    const full = this._resolve(relPath);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.appendFile(full, '\n' + text, 'utf8');
  }

  /** Parse canon into { deep, recent } section text only, no headers */
  parseSections(canonText) {
    const deepMatch = canonText.match(/## DEEP HISTORY\n\*\[.*?\]\*\n\n([\s\S]*?)(?=\n---\n## RECENT HISTORY|$)/);
    const recentMatch = canonText.match(/## RECENT HISTORY\n\*\[.*?\]\*\n\n([\s\S]*)$/);
    return {
      deep: deepMatch ? deepMatch[1].trim() : '',
      recent: recentMatch ? recentMatch[1].trim() : '',
    };
  }

  /** Rebuild canon.md from deep and recent section content */
  rebuildCanon(deep, recent) {
    return `## DEEP HISTORY\n*[summarized — compressed from earlier records]*\n\n${deep}\n\n---\n\n## RECENT HISTORY\n*[verbatim — last recorded entries]*\n\n${recent}\n`;
  }

  /**
   * Replace only the RECENT HISTORY section. DEEP HISTORY is untouched.
   * Used by canon-manager after compression.
   */
  async replaceRecentHistory(newRecentContent) {
    const current = await this.readCanon();
    const { deep } = this.parseSections(current);
    const rebuilt = this.rebuildCanon(deep, newRecentContent);
    await this.writeFile('world/canon.md', rebuilt);
  }

  /**
   * Append a compressed block to DEEP HISTORY. RECENT HISTORY is untouched.
   * Used by canon-manager compression.
   */
  async appendToDeepHistory(compressedBlock) {
    const current = await this.readCanon();
    const { deep, recent } = this.parseSections(current);
    const newDeep = deep ? `${deep}\n\n${compressedBlock}` : compressedBlock;
    const rebuilt = this.rebuildCanon(newDeep, recent);
    await this.writeFile('world/canon.md', rebuilt);
  }

  async readCanon() {
    return await this.readFile('world/canon.md') ?? '';
  }

  async readFacts() {
    return await this.readFile('world/canon-facts.md') ?? '';
  }

  /** Returns only the last eventsWindow entries from events.md */
  async readEvents(eventsWindow = 20) {
    const raw = await this.readFile('world/events.md') ?? '';
    const lines = raw.split('\n');
    // Split on ### date headers
    const entries = raw.split(/(?=\n### )/).filter(s => s.trim());
    if (entries.length <= eventsWindow) return raw;
    return entries.slice(-eventsWindow).join('');
  }

  async readGmNotes() {
    return await this.readFile('world/gm-notes.md') ?? '';
  }

  async readSeed() {
    return await this.readFile('world/seed.md') ?? '';
  }

  async readGameJson() {
    const raw = await this.readFile('config/game.json');
    return raw ? JSON.parse(raw) : null;
  }

  async writeGameJson(data) {
    await this.writeFile('config/game.json', JSON.stringify(data, null, 2));
  }

  async readEngineJson() {
    const raw = await this.readFile('config/engine.json');
    return raw ? JSON.parse(raw) : {};
  }

  async readCharacter(playerId) {
    return await this.readFile(`players/${playerId}/character.md`) ?? '';
  }

  async readLocation(playerId) {
    return await this.readFile(`players/${playerId}/location.md`) ?? '';
  }

  async writeLocation(playerId, content) {
    await this.writeFile(`players/${playerId}/location.md`, content);
  }

  /** Full rewrite of character.md — only non-append write for player files */
  async updateCharacter(playerId, content) {
    await this.writeFile(`players/${playerId}/character.md`, content);
  }

  async writeSeed(content) {
    await this.writeFile('world/seed.md', content);
  }

  /** List all letters in /letters/pending/ */
  async listPendingLetters() {
    const dir = this._resolve('letters/pending');
    try {
      const files = await fs.readdir(dir);
      return files.filter(f => f.endsWith('.md') && f !== '.gitkeep').map(f => `letters/pending/${f}`);
    } catch {
      return [];
    }
  }

  /** Parse a letter file — returns { frontmatter, body } */
  async parseLetter(relPath) {
    const raw = await this.readFile(relPath);
    if (!raw) return null;
    const parsed = matter(raw);
    return { frontmatter: parsed.data, body: parsed.content.trim() };
  }

  /** Move letter from pending to delivered, mark delivered: true */
  async deliverLetter(relPath) {
    const raw = await this.readFile(relPath);
    if (!raw) return;
    const parsed = matter(raw);
    parsed.data.delivered = true;
    const updated = matter.stringify(parsed.content, parsed.data);
    const filename = path.basename(relPath);
    await this.writeFile(`letters/delivered/${filename}`, updated);
    await fs.unlink(this._resolve(relPath));
  }

  async writeChronicle(content) {
    await this.writeFile('world/chronicle.md', content);
  }

  async readChronicle() {
    return await this.readFile('world/chronicle.md') ?? '';
  }

  async writeGmStatus(data) {
    await this.writeFile('.gm-status.json', JSON.stringify(data, null, 2));
  }

  async readGmStatus() {
    const raw = await this.readFile('.gm-status.json');
    return raw ? JSON.parse(raw) : null;
  }

  // ─── World lore JSON files ────────────────────────────────────────────────

  static _worldJsonDefaults = {
    'world/map.json':      { nodes: [], edges: [], player_locations: {} },
    'world/people.json':   { people: [] },
    'world/factions.json': { factions: [] },
    'world/timeline.json': { entries: [] },
    'world/chapters.json':  { chapters: [] },
  };

  async readWorldJson(relPath) {
    const raw = await this.readFile(relPath);
    const def = JSON.parse(JSON.stringify(WorldState._worldJsonDefaults[relPath] ?? {}));
    if (!raw) return def;
    try { return JSON.parse(raw); } catch { return def; }
  }

  async writeWorldJson(relPath, data) {
    await this.writeFile(relPath, JSON.stringify(data, null, 2));
  }

  /** Upsert nodes and edges into world/map.json. Skips duplicates by id / from:to key. */
  async updateMapJson({ new_nodes, new_edges }, now) {
    const map = await this.readWorldJson('world/map.json');
    const existingNodeIds = new Set(map.nodes.map(n => n.id));
    const existingEdgeKeys = new Set([
      ...map.edges.map(e => `${e.from}:${e.to}`),
      ...map.edges.map(e => `${e.to}:${e.from}`),
    ]);
    for (const node of (new_nodes ?? [])) {
      if (!existingNodeIds.has(node.id)) {
        map.nodes.push({ ...node, first_mentioned: now });
        existingNodeIds.add(node.id);
      }
    }
    for (const edge of (new_edges ?? [])) {
      const key = `${edge.from}:${edge.to}`;
      if (!existingEdgeKeys.has(key)) {
        map.edges.push({ ...edge, first_mentioned: now });
        existingEdgeKeys.add(key);
        existingEdgeKeys.add(`${edge.to}:${edge.from}`);
      }
    }
    await this.writeWorldJson('world/map.json', map);
  }

  /** Add new NPCs / apply status+description updates into world/people.json. */
  async updatePeopleJson({ new_people, updated_people }, now) {
    const data = await this.readWorldJson('world/people.json');
    for (const person of (new_people ?? [])) {
      if (!data.people.find(p => p.id === person.id)) {
        data.people.push({ ...person, first_mentioned: now, last_updated: now });
      }
    }
    for (const update of (updated_people ?? [])) {
      const existing = data.people.find(p => p.id === update.id);
      if (existing) {
        if (update.description != null) existing.description = update.description;
        if (update.status != null) existing.status = update.status;
        existing.last_updated = now;
      }
    }
    await this.writeWorldJson('world/people.json', data);
  }

  /** Add new factions / apply updates into world/factions.json. */
  async updateFactionsJson({ new_factions, updated_factions }, now) {
    const data = await this.readWorldJson('world/factions.json');
    for (const faction of (new_factions ?? [])) {
      if (!data.factions.find(f => f.id === faction.id)) {
        data.factions.push({ ...faction, first_mentioned: now, last_updated: now });
      }
    }
    for (const update of (updated_factions ?? [])) {
      const existing = data.factions.find(f => f.id === update.id);
      if (existing) {
        if (update.description != null) existing.description = update.description;
        if (update.disposition != null) existing.disposition = update.disposition;
        existing.last_updated = now;
      }
    }
    await this.writeWorldJson('world/factions.json', data);
  }

  /** Append a single entry to world/timeline.json. Skips if id already exists. */
  async appendTimelineEntry(entry, now) {
    const data = await this.readWorldJson('world/timeline.json');
    if (!data.entries.find(e => e.id === entry.id)) {
      data.entries.push({ ...entry, timestamp: now });
    }
    await this.writeWorldJson('world/timeline.json', data);
  }

  // ─── Chapters JSON ───────────────────────────────────────────────────────
  async readChaptersJson() {
    return await this.readWorldJson('world/chapters.json');
  }
  async appendChapterJson(chapter) {
    const data = await this.readChaptersJson();
    data.chapters.push(chapter);
    await this.writeWorldJson('world/chapters.json', data);
  }
    /** Record which map node a player character is currently at. */
  async updatePlayerLocationOnMap(playerId, nodeId) {
    const map = await this.readWorldJson('world/map.json');
    if (!map.player_locations) map.player_locations = {};
    // Only update if the node actually exists in the map
    if (nodeId && map.nodes.find(n => n.id === nodeId)) {
      map.player_locations[playerId] = nodeId;
      await this.writeWorldJson('world/map.json', map);
    }
  }
}