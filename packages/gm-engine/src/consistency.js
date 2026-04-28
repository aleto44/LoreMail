/**
 * ConsistencyChecker — before committing a new canon addition,
 * checks it against existing canon-facts.md.
 */
export class ConsistencyChecker {
  constructor(worldState, modelClient) {
    this.ws = worldState;
    this.modelClient = modelClient;
  }

  /**
   * Check proposed addition against established facts.
   * Returns { consistent: boolean, conflicts: string[] }
   * Per the contradiction handling rule, conflicts are recontextualized
   * rather than rejected — the engine still notes them.
   */
  async check(proposedAddition) {
    const facts = await this.ws.readFacts();
    if (!facts || !facts.trim()) {
      return { consistent: true, conflicts: [] };
    }

    const messages = [
      {
        role: 'system',
        content:
          'You are a lore consistency checker for a world-building game. ' +
          'Compare a proposed canon addition against a list of established facts. ' +
          'Identify any direct contradictions. ' +
          'Important: surface contradictions for the GM to handle — do not reject the addition. ' +
          'Respond with valid JSON only: { "consistent": boolean, "conflicts": string[] }',
      },
      {
        role: 'user',
        content:
          `Established facts:\n${facts}\n\nProposed addition:\n${proposedAddition}\n\n` +
          'Are there contradictions? Respond with JSON only.',
      },
    ];

    try {
      const raw = await this.modelClient.chat(messages, { temperature: 0.1 });
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return { consistent: true, conflicts: [] };
      return JSON.parse(jsonMatch[0]);
    } catch {
      return { consistent: true, conflicts: [] };
    }
  }
}
