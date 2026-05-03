import { CompressionPromptBuilder } from './compression-prompt.js';
/**
 * CanonManager — two-layer canon structure (DEEP HISTORY / RECENT HISTORY).
 * Tracks word count, triggers compression. Append-only — no tags.
 */
export class CanonManager {
  constructor(worldState, engineConfig) {
    this.ws = worldState;
    this.config = engineConfig;
    this.recentWordLimit = engineConfig.canon_recent_word_limit ?? 4000;
    this.deepSummaryTarget = engineConfig.canon_deep_summary_target ?? 800;
    this.compressionPromptBuilder = new CompressionPromptBuilder();
  }
  _wordCount(text) {
    return text.trim().split(/\s+/).filter(Boolean).length;
  }
  async isCompressionNeeded() {
    const canon = await this.ws.readCanon();
    const { recent } = this.ws.parseSections(canon);
    return this._wordCount(recent) >= this.recentWordLimit;
  }
  async recentWordCount() {
    const canon = await this.ws.readCanon();
    const { recent } = this.ws.parseSections(canon);
    return this._wordCount(recent);
  }
  /**
   * Append a new entry to RECENT HISTORY.
   * The entry text should already include the ### heading.
   */
  async appendEntry(entryText) {
    await this.ws.appendToCanon('\n' + entryText.trim());
  }
  /**
   * Run compression: oldest 50% of RECENT HISTORY entries → DEEP HISTORY.
   */
  async runCompression(modelClient) {
    const canon = await this.ws.readCanon();
    const { recent } = this.ws.parseSections(canon);
    const entries = recent.split(/(?=### )/).filter(s => s.trim());
    if (entries.length < 2) return;
    const splitIdx = Math.ceil(entries.length / 2);
    const toCompress = entries.slice(0, splitIdx);
    const toKeep = entries.slice(splitIdx);
    const facts = await this.ws.readFacts();
    const anchorList = this._buildAnchorList(toCompress.join('\n'), facts);
    const CHUNK_SIZE = 5;
    const compressedBlocks = [];
    for (let i = 0; i < toCompress.length; i += CHUNK_SIZE) {
      const chunk = toCompress.slice(i, i + CHUNK_SIZE);
      const messages = this.compressionPromptBuilder.buildCompressionChunkPrompt(chunk, anchorList);
      try {
        const compressed = await modelClient.chat(messages, { temperature: 0.2, maxTokens: 600 });
        compressedBlocks.push(compressed.trim());
      } catch (err) {
        console.error('Compression chunk failed, skipping:', err.message);
      }
    }
    if (compressedBlocks.length === 0) return;
    await this.ws.appendToDeepHistory(compressedBlocks.join('\n\n'));
    await this.ws.replaceRecentHistory(toKeep.join('\n\n'));
  }
  /** Initialize blank canon structure for a new game */
  async initBlank() {
    await this.ws.writeFile('world/canon.md', this.ws.rebuildCanon('', ''));
  }
  _buildAnchorList(text, facts) {
    const anchors = new Set();
    const capPhrases = text.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/g) ?? [];
    capPhrases.forEach(p => anchors.add(p));
    const capWords = text.match(/(?<=[.!?]\s+|^)(?![A-Z][a-z]+[.,])([A-Z][a-z]{3,})/gm) ?? [];
    capWords.forEach(w => anchors.add(w));
    if (facts) {
      const factProper = facts.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) ?? [];
      factProper.forEach(p => anchors.add(p));
    }
    return [...anchors].slice(0, 30);
  }
}
