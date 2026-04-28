/**
 * PromptBuilder — assembles the full GM prompt in consistent order.
 */
export class PromptBuilder {
  /**
   * Build the delivery prompt.
   * Order:
   *  1. System prompt (historian voice, GM style, contradiction rule, tag rules)
   *  2. World seed
   *  3. canon-facts.md (hard constraints)
   *  4. DEEP HISTORY summary
   *  5. RECENT HISTORY verbatim
   *  6. Recent world events
   *  7. GM notes (private)
   *  8. Sender character + location
   *  9. Recipient character + location
   * 10. The letter itself
   * 11. Output format instructions (JSON)
   */
  buildDeliveryPrompt({
    seed,
    facts,
    deepHistory,
    recentHistory,
    events,
    gmNotes,
    senderCharacter,
    senderLocation,
    recipientCharacter,
    recipientLocation,
    letterBody,
    senderName,
    recipientName,
    game,
  }) {
    const systemPrompt = this._buildSystemPrompt(game);

    const userParts = [];

    if (seed) userParts.push(`## WORLD SEED\n${seed}`);

    if (facts) userParts.push(`## ESTABLISHED FACTS (hard constraints)\n${facts}`);

    if (deepHistory)
      userParts.push(`## DEEP HISTORY (compressed — do not contradict)\n${deepHistory}`);

    if (recentHistory)
      userParts.push(`## RECENT HISTORY (verbatim — last recorded entries)\n${recentHistory}`);

    if (events) userParts.push(`## RECENT WORLD EVENTS\n${events}`);

    if (gmNotes) userParts.push(`## GM NOTES (private — never surface to players)\n${gmNotes}`);

    userParts.push(
      `## SENDER\nName: ${senderName}\n\n${senderCharacter}\n\nLast known location:\n${senderLocation || 'Unknown'}`,
    );

    userParts.push(
      `## RECIPIENT\nName: ${recipientName}\n\n${recipientCharacter}\n\nLast known location:\n${recipientLocation || 'Unknown'}`,
    );

    userParts.push(`## LETTER\n${letterBody}`);

    userParts.push(this._outputFormatInstructions());

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userParts.join('\n\n---\n\n') },
    ];
  }

  buildSeedPrompt({ flavour, era, tone, gmStyle }) {
    return [
      {
        role: 'system',
        content:
          'You are a world-building historian. ' +
          'Write an atmospheric world introduction in approximately 300 words. ' +
          'Third person, past tense, measured and authoritative. ' +
          'Establish the world\'s character, its tensions, its geography in broad strokes. ' +
          'Do not name specific characters. Do not resolve the world\'s tensions — only establish them.',
      },
      {
        role: 'user',
        content:
          `World description: ${flavour}\nEra: ${era}\nTone: ${tone}\nGM style: ${gmStyle}\n\n` +
          'Write the world seed — the opening passage of the historical chronicle.',
      },
    ];
  }

  buildChroniclePrompt({ seed, facts, canon, events, characters, game }) {
    return [
      {
        role: 'system',
        content:
          'You are a historian writing the closing volume of a chronicle. ' +
          'Third person, past tense, measured and authoritative. ' +
          'You are writing a retrospective account of the age just ended. ' +
          'Document what happened, what the characters\' fates were, and what became of the world. ' +
          'Write as if centuries have passed and this is received historical record. ' +
          'Format with sections: the era summary, then "WHAT BECAME OF THEM" for each named character.',
      },
      {
        role: 'user',
        content:
          `World: ${game.name} — ${game.flavour}\n\n` +
          `## SEED\n${seed}\n\n` +
          `## ESTABLISHED FACTS\n${facts}\n\n` +
          `## FULL CANON\n${canon}\n\n` +
          `## EVENTS\n${events}\n\n` +
          `## CHARACTERS\n${characters}\n\n` +
          'Write the closing chronicle.',
      },
    ];
  }

  _buildSystemPrompt(game) {
    const gmStyleDesc = {
      gentle: 'The world is warm and forgiving. Consequences are light and recoverable. Lean toward hope.',
      medium: 'The world has tension and weight. History remembers. Actions have consequence.',
      dramatic:
        'Factions shift. Characters are swept up in events. The world bends toward interesting trouble.',
    };

    const style = (game?.gm_style ?? 'medium').toLowerCase();
    const styleText = gmStyleDesc[style] ?? gmStyleDesc.medium;

    return (
      'You are the Game Master and historian of a living fantasy world. ' +
      'You write in the third person, past tense, measured and authoritative — like entries being added to a chronicle. ' +
      'Never purple prose. Never chatty. World events are reported as fact with the weight of recorded history.\n\n' +
      `GM STYLE: ${styleText}\n\n` +
      'CANON RULES:\n' +
      '- [LOCKED] entries: never contradict them, only build upon them.\n' +
      '- [DEVELOPING] entries: open to reinterpretation and expansion.\n' +
      '- All new entries begin as [DEVELOPING].\n\n' +
      'CONTRADICTION HANDLING RULE:\n' +
      'If a player\'s letter implies something that appears to contradict existing canon, ' +
      'do not reject it. Treat it as new information that recontextualizes what came before. ' +
      'Find the most dramatically interesting explanation that makes both things simultaneously true ' +
      'and record it as established history. The world builds around what players write.\n\n' +
      'RESPONSE FORMAT: Respond with valid JSON only, no markdown fences.'
    );
  }

  _outputFormatInstructions() {
    return (
      '## OUTPUT FORMAT\n' +
      'Respond with valid JSON exactly matching this structure:\n' +
      '{\n' +
      '  "canon_addition": "string or null — new lore entry to append to canon",\n' +
      '  "world_event": "string or null — brief world event for events.md",\n' +
      '  "gm_notes_addition": "string or null — private GM scratchpad notes",\n' +
      '  "sender_location_update": "string or null — sender\'s new location",\n' +
      '  "recipient_location_update": "string or null — recipient\'s new location",\n' +
      '  "next_letter_travel_hours": 24\n' +
      '}\n' +
      'All fields required. Use null for fields with no new content. ' +
      'next_letter_travel_hours must be a positive integer.'
    );
  }
}
