/**
 * ConsistencyChecker — pre-commit check of proposed canon additions.
 * If conflicts are found, resolves them via a second model call rather than blocking.
 */
export class ConsistencyChecker {
  constructor(worldState, modelClient) {
    this.ws = worldState;
    this.modelClient = modelClient;
  }

  /**
   * Check proposed addition and return a (possibly rewritten) resolved addition.
   * Returns { consistent, conflicts, resolvedAddition }
   */
  async check(proposedAddition) {
    const facts = await this.ws.readFacts();
    if (!facts?.trim()) {
      return { consistent: true, conflicts: [], resolvedAddition: proposedAddition };
    }

    // Step 1 — identify conflicts
    const checkMessages = [
      {
        role: 'system',
        content: `You are a continuity editor for a world history record.

You will be given:
1. A list of established facts (immutable)
2. A proposed new history entry

Your job: identify any direct contradictions between the proposed entry and the established facts.

A contradiction is when the proposed entry states or implies something that cannot be
simultaneously true with an established fact.

Respond with JSON only:
{ "consistent": boolean, "conflicts": string[] }`,
      },
      {
        role: 'user',
        content: `ESTABLISHED FACTS:\n${facts}\n\nPROPOSED ENTRY:\n${proposedAddition}`,
      },
    ];

    let result;
    try {
      result = await this.modelClient.chatJson(checkMessages, { temperature: 0.1, maxTokens: 400 });
    } catch {
      return { consistent: true, conflicts: [], resolvedAddition: proposedAddition };
    }

    const { consistent, conflicts = [] } = result;

    if (consistent || conflicts.length === 0) {
      return { consistent: true, conflicts: [], resolvedAddition: proposedAddition };
    }

    // Step 2 — resolve the conflict via a rewrite
    const resolveMessages = [
      {
        role: 'system',
        content: `A proposed history entry conflicts with established facts.
Rewrite the entry so that both the existing facts and the new information are simultaneously true.
Find the most dramatically interesting reconciliation.
Do not reject or omit the new information — recontextualise it.
Output only the rewritten entry. Same format as the original (### heading etc).
No preamble.`,
      },
      {
        role: 'user',
        content: `ESTABLISHED FACTS:\n${facts}\n\nCONFLICTS IDENTIFIED:\n${conflicts.map(c => `- ${c}`).join('\n')}\n\nORIGINAL PROPOSED ENTRY:\n${proposedAddition}`,
      },
    ];

    try {
      const resolved = await this.modelClient.chat(resolveMessages, { temperature: 0.3, maxTokens: 400 });
      return { consistent: false, conflicts, resolvedAddition: resolved.trim() || proposedAddition };
    } catch {
      return { consistent: false, conflicts, resolvedAddition: proposedAddition };
    }
  }
}