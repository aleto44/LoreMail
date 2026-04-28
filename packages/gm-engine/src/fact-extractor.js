/**
 * FactExtractor — after each canon addition, extracts concrete facts
 * as a flat bullet list into canon-facts.md.
 */
export class FactExtractor {
  constructor(worldState, modelClient) {
    this.ws = worldState;
    this.modelClient = modelClient;
  }

  async extractFacts(newCanonText) {
    if (!newCanonText || !newCanonText.trim()) return;

    const messages = [
      {
        role: 'system',
        content:
          'You are a precise fact extractor for a world-building game. ' +
          'Given a passage of canon text, extract all concrete, verifiable facts as a clean bullet list. ' +
          'Each fact should be a single sentence, specific, and stated as established truth. ' +
          'Do not include opinions, possibilities, or vague impressions. ' +
          'Format: one bullet per line starting with "- "',
      },
      {
        role: 'user',
        content: `Extract all concrete facts from this canon entry:\n\n${newCanonText}`,
      },
    ];

    const facts = await this.modelClient.chat(messages, { temperature: 0.1 });
    if (!facts || !facts.trim()) return;

    const timestamp = new Date().toISOString();
    const section = `\n<!-- extracted: ${timestamp} -->\n${facts.trim()}\n`;
    await this.ws.appendToFile('world/canon-facts.md', section);
  }
}
