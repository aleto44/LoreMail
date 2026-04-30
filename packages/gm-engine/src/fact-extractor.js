/**
 * FactExtractor — after each canon addition, extracts concrete facts
 * as a flat bullet list into canon-facts.md. Runs at temperature 0.3.
 */
export class FactExtractor {
  constructor(worldState, modelClient) {
    this.ws = worldState;
    this.modelClient = modelClient;
  }

  async extractFacts(newCanonText) {
    if (!newCanonText?.trim()) return;

    const existingFacts = await this.ws.readFacts();

    const messages = [
      {
        role: 'system',
        content: `You are extracting hard facts from a world history entry.

Your output is a bullet list only. No preamble. No commentary.

Rules:
- One fact per bullet
- Each fact is a single declarative sentence
- Concrete and specific — names, places, relationships, states of affairs
- No inference, no interpretation — only what is explicitly stated
- No duplicates with existing facts (existing facts provided below)`,
      },
      {
        role: 'user',
        content: `EXISTING FACTS:\n${existingFacts || '(none yet)'}\n\nNEW ENTRY TO EXTRACT FROM:\n${newCanonText}\n\nOutput only the new bullet points. If there are no new facts not already captured, output nothing.`,
      },
    ];

    const facts = await this.modelClient.chat(messages, { temperature: 0.3, maxTokens: 800 });
    if (!facts?.trim()) return;

    // Append as flat bullets with no heading or date wrapper
    await this.ws.appendToFile('world/canon-facts.md', facts.trim());
  }
}