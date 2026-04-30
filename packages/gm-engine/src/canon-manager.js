import { CompressionPromptBuilder } from './compression-prompt.js';

/**
 * CanonManager — two-layer canon structure (DEEP HISTORY / RECENT HISTORY).
 * Tracks word count, triggers compression, manages tags.
 */
export class CanonManager {
  constructor(worldState, engineConfig) {
    this.ws = worldState;
    this.config = engineConfig;
    this.recentWordLimit = engineConfig.canon_recent_word_limit ?? 4000;
    this.deepSummaryTarget = engineConfig.canon_deep_summary_target ?? 800;
    this.lockedTag = engineConfig.locked_tag ?? '[LOCKED]';
    this.developingTag = engineConfig.developing_tag ?? '[DEVELOPING]';
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
   * The entry text should already include the ### [DEVELOPING] heading
   * as produced by the model. We just append it directly.
   */
  async appendEntry(entryText) {
    await this.ws.appendToCanon('\n' + entryText.trim());
  }

  /**
   * Run compression: oldest 50% of RECENT HISTORY entries → DEEP HISTORY.
   * Uses anchor-list strategy from the engine plan.
   */
  async runCompression(modelClient) {
    const canon = await this.ws.readCanon();
    const { recent } = this.ws.parseSections(canon);

    // Split recent entries on ### headings
    const entries = recent.split(/(?=### )/).filter(s => s.trim());
    if (entries.length < 2) return;

    const splitIdx = Math.ceil(entries.length / 2);
    const toCompress = entries.slice(0, splitIdx);
    const toKeep = entries.slice(splitIdx);

    // Build anchor list from proper nouns and canon-facts terms
    const facts = await this.ws.readFacts();
    const anchorList = this._buildAnchorList(toCompress.join('\n'), facts);

    // Compress in chunks of ≤5
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

    // Write: append compressed blocks to DEEP HISTORY, replace RECENT HISTORY
    await this.ws.appendToDeepHistory(compressedBlocks.join('\n\n'));
    await this.ws.replaceRecentHistory(toKeep.join('\n\n'));
  }

  /** Promote a [DEVELOPING] entry to [LOCKED] by its short title */
  async promoteToLocked(entryTitle) {
    const canon = await this.ws.readCanon();
    const pattern = new RegExp(`### \\[DEVELOPING\\] ${escapeRegex(entryTitle)}`, 'g');
    const updated = canon.replace(pattern, `### ${this.lockedTag} ${entryTitle}`);
    await this.ws.writeFile('world/canon.md', updated);
  }

  /** Initialize blank canon structure for a new game */
  async initBlank() {
    await this.ws.writeFile('world/canon.md', this.ws.rebuildCanon('', ''));
  }

  /** Build anchor list: proper nouns + fact-list terms from text */
  _buildAnchorList(text, facts) {
    const anchors = new Set();
    // Extract capitalised multi-word phrases (rough heuristic)
    const capPhrases = text.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/g) ?? [];
    capPhrases.forEach(p => anchors.add(p));
    // Extract single capitalised words that aren't sentence-starters (rough)
    const capWords = text.match(/(?<=[.!?]\s+|^)(?![A-Z][a-z]+[.,])([A-Z][a-z]{3,})/gm) ?? [];
    capWords.forEach(w => anchors.add(w));
    // From facts, grab the proper nouns too
    if (facts) {
      const factProper = facts.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) ?? [];
      factProper.forEach(p => anchors.add(p));
    }
    return [...anchors].slice(0, 30); // cap at 30 to avoid bloat
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}