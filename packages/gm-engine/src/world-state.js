import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';

/**
 * WorldState — all file reads and writes for the game repo.
 * Enforces append-only access to canon.md.
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

  /** APPEND-ONLY — the only way to add to canon.md */
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

  async readCanon() {
    return await this.readFile('world/canon.md') ?? '';
  }

  async readFacts() {
    return await this.readFile('world/canon-facts.md') ?? '';
  }

  async readEvents() {
    return await this.readFile('world/events.md') ?? '';
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

  async writeSeed(content) {
    await this.writeFile('world/seed.md', content);
  }

  /** List all letters in /letters/pending/ */
  async listPendingLetters() {
    const dir = this._resolve('letters/pending');
    try {
      const files = await fs.readdir(dir);
      return files.filter(f => f.endsWith('.md')).map(f => `letters/pending/${f}`);
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
