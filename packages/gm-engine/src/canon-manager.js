/**
 * CanonManager — two-layer canon structure (DEEP HISTORY / RECENT HISTORY).
 * Handles compression, tag management, and append logic.
 */
export class CanonManager {
  constructor(worldState, engineConfig) {
    this.ws = worldState;
    this.config = engineConfig;
    this.recentWordLimit = engineConfig.canon_recent_word_limit ?? 4000;
    this.deepSummaryTarget = engineConfig.canon_deep_summary_target ?? 800;
    this.lockedTag = engineConfig.locked_tag ?? '[LOCKED]';
    this.developingTag = engineConfig.developing_tag ?? '[DEVELOPING]';
  }

  /** Count words in a string */
  _wordCount(text) {
    return text.trim().split(/\s+/).filter(Boolean).length;
  }

  /** Parse canon into { deep, recent } sections */
  _parseSections(canonText) {
    const deepMatch = canonText.match(/## DEEP HISTORY\n([\s\S]*?)(?=---\n## RECENT HISTORY|$)/);
    const recentMatch = canonText.match(/## RECENT HISTORY\n([\s\S]*?)$/);
    return {
      deep: deepMatch ? deepMatch[1].trim() : '',
      recent: recentMatch ? recentMatch[1].trim() : '',
    };
  }

  /** Rebuild canon.md from sections */
  _buildCanon(deep, recent) {
    return `## DEEP HISTORY\n*[summarized — compressed from earlier records]*\n\n${deep}\n\n---\n\n## RECENT HISTORY\n*[verbatim — last recorded entries]*\n\n${recent}\n`;
  }

  /** Check if RECENT HISTORY exceeds word limit */
  async isCompressionNeeded() {
    const canon = await this.ws.readCanon();
    const { recent } = this._parseSections(canon);
    return this._wordCount(recent) >= this.recentWordLimit;
  }

  /** Get word count of RECENT HISTORY */
  async recentWordCount() {
    const canon = await this.ws.readCanon();
    const { recent } = this._parseSections(canon);
    return this._wordCount(recent);
  }

  /**
   * Compress the oldest 50% of RECENT HISTORY entries into DEEP HISTORY.
   * modelClient is used for the summary call.
   */
  async runCompression(modelClient) {
    const canon = await this.ws.readCanon();
    const { deep, recent } = this._parseSections(canon);

    // Split recent into entries by ### headers
    const entries = recent.split(/(?=### )/).filter(Boolean);
    if (entries.length < 2) return; // nothing to compress

    const splitIdx = Math.ceil(entries.length / 2);
    const toCompress = entries.slice(0, splitIdx).join('\n\n');
    const toKeep = entries.slice(splitIdx).join('\n\n');

    const compressionPrompt = [
      {
        role: 'system',
        content:
          'You are a historian compressing detailed records into a concise summary. ' +
          `Target approximately ${this.deepSummaryTarget} words. ` +
          'Preserve proper nouns, named locations, key events, and established facts. ' +
          'Write in third person, past tense, measured and authoritative. ' +
          'Do not invent new information.',
      },
      {
        role: 'user',
        content: `Compress the following canon entries into a single cohesive historical summary:\n\n${toCompress}`,
      },
    ];

    const compressed = await modelClient.chat(compressionPrompt, { temperature: 0.2 });
    const newDeep = deep ? `${deep}\n\n${compressed}` : compressed;
    const newCanon = this._buildCanon(newDeep, toKeep);

    // Overwrite canon — compression is the only allowed full rewrite
    await this.ws.writeFile('world/canon.md', newCanon);
  }

  /**
   * Append a new entry to RECENT HISTORY.
   * Entry always starts as [DEVELOPING].
   */
  async appendEntry(entryText) {
    const timestamp = new Date().toISOString().split('T')[0];
    const tagged = `### ${this.developingTag} ${entryText.trimStart().replace(/^###\s*/, '')}\n*established: ${timestamp} · source: gm-inference*`;
    await this.ws.appendToCanon('\n' + tagged);
  }

  /** Promote an entry's tag from DEVELOPING → LOCKED in canon.md */
  async promoteToLocked(entryHeader) {
    const canon = await this.ws.readCanon();
    const updated = canon.replace(
      new RegExp(`### \\[DEVELOPING\\] ${escapeRegex(entryHeader)}`, 'g'),
      `### ${this.lockedTag} ${entryHeader}`,
    );
    await this.ws.writeFile('world/canon.md', updated);
  }

  /** Initialize blank canon structure */
  async initBlank() {
    const canon = this._buildCanon('', '');
    await this.ws.writeFile('world/canon.md', canon);
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
