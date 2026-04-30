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
}