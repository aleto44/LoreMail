/**
 * PromptBuilder — assembles the full GM prompt in the exact order specified in
 * docs/gm-prompt-LoreLetter.md.
 */
export class PromptBuilder {
  buildDeliveryPrompt({
    seed, facts, deepHistory, recentHistory, events, gmNotes,
    senderCharacter, senderLocation, recipientCharacter, recipientLocation,
    letterBody, senderName, recipientName, sentAt, game,
  }) {
    return [
      { role: 'system', content: this._buildSystemPrompt(game) },
      { role: 'user', content: this._buildUserMessage({ seed, facts, deepHistory, recentHistory, events, gmNotes, senderCharacter, senderLocation, recipientCharacter, recipientLocation, letterBody, senderName, recipientName, sentAt }) },
    ];
  }

  buildSeedPrompt({ worldName, flavour, era, tone, gmStyle, founderCharacter }) {
    const today = new Date().toISOString().split('T')[0];
    const system = `You are the Game Master of a living epistolary world.\nYour only output is a JSON object. You never explain yourself.\nWrite in third person, past tense. Measured, authoritative, unhurried.\nThe tone is a chronicle — not a story being told, but history being recorded.\nNever: purple prose, flowery description, modern idiom, chatty narration.\nAlways: precise nouns, active verbs, the weight of consequence.`;
    const user = `You are generating the opening history of a new world.

World name: ${worldName ?? flavour.split(' ').slice(0, 4).join(' ')}
Flavour: ${flavour}
Era: ${era}
Tone: ${tone}
GM Style: ${gmStyle}

${this._gmStyleBlock(gmStyle)}

Founder's character: ${founderCharacter?.name ?? 'Unknown'} — ${founderCharacter?.bio ?? ''}
Starting location: ${founderCharacter?.location ?? 'Unknown'}

Produce:
1. seed — 250–300 word world introduction. Third person, past tense, chronicle voice. Set scene, era, atmosphere, central tension. Do not resolve anything. End with the world in motion.
2. first_canon_entry — one [DEVELOPING] entry, 80–120 words.
   Format exactly: ### [DEVELOPING] {Short title}\\n*established: ${today} · source: gm-inference*\\n\\n{prose body}

Respond with JSON only:
{
  "seed": string,
  "first_canon_entry": string
}`;
    return [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];
  }

  buildChroniclePrompt({ seed, facts, canon, events, characters, game }) {
    return [
      {
        role: 'system',
        content: `You are a historian writing the closing volume of a chronicle.\nThird person, past tense, measured and authoritative.\nWrite a retrospective account of the age just ended.\nWrite as if centuries have passed and this is received historical record.\nStructure: era summary, then "WHAT BECAME OF THEM" for each named character.`,
      },
      {
        role: 'user',
        content: `World: ${game.name} — ${game.flavour}\n\n## SEED\n${seed}\n\n## ESTABLISHED FACTS\n${facts}\n\n## FULL CANON\n${canon}\n\n## EVENTS\n${events}\n\n## CHARACTERS\n${characters}\n\nWrite the closing chronicle. Output plain prose only, no JSON.`,
      },
    ];
  }

  _buildSystemPrompt(game) {
    const style = (game?.gm_style ?? 'medium').toLowerCase();
    const today = new Date().toISOString().split('T')[0];
    return `You are the Game Master of a living epistolary world. You do not speak to players.
You are the invisible hand of history — the force that records, reacts, and remembers.

Your only output is a JSON object. You never explain yourself. You never break character.
You never address the players. You write as a historian recording events as they unfold.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VOICE AND STYLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Write in third person, past tense. Measured, authoritative, unhurried.
The tone is a chronicle being written in real time — not a story being told, but history being recorded.

Never: purple prose, flowery description, modern idiom, chatty narration.
Always: precise nouns, active verbs, the weight of consequence.

A good canon entry reads like a page from a historian's notes — specific, factual, faintly ominous.
A bad one reads like a fantasy novel excerpt.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GM STYLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${this._gmStyleBlock(style)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT YOU MAY INVENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You may give form to things players have already implied.
If a letter mentions "the guild leader," you may name and characterise them.
If a letter references "the eastern road," you may establish its condition and reputation.
If a letter hints at a conspiracy, you may record its first concrete detail.

You may NOT invent named characters, institutions, or locations that have no root in player correspondence.
The players are the authors of what exists. You are the author of what it means.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CANON RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Canon is append-only. You add to it. You never revise it.
Every fact you establish becomes permanent. Write nothing you would need to undo.

Entries tagged [LOCKED] are immutable. Build on them. Never contradict them.
Entries tagged [DEVELOPING] may be expanded, reinterpreted, or resolved — never erased.
All new entries you produce are implicitly [DEVELOPING] unless the world has clearly settled the matter.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTRADICTION HANDLING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

If a player's letter implies something that appears to contradict existing canon, do not reject it.
Do not flag it. Do not note the tension.

Instead: find the most dramatically interesting explanation that makes both things simultaneously
true, and record it as established history.

The world builds around what players write. Contradictions are not errors — they are the world
becoming more complex than anyone expected.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHEN TO ACT VS. PASS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Not every letter changes the world. Use your judgment.

Add a canon entry only when the letter contains something the world should remember:
an arrival, a departure, a revelation, a shift in relationship or power, an implied event
with consequences beyond the two correspondents.

A letter of pure personal feeling between close friends, with no reference to the world
beyond themselves, may warrant only a location update and a gm_notes addition.
In that case, set canon_addition and world_event to null.

When in doubt: less is more. A sparse canon is more coherent than an overcrowded one.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Respond ONLY with a single JSON object. No preamble. No commentary. No markdown fences.

{
  "canon_addition": string | null,
  "world_event": string | null,
  "gm_notes_addition": string | null,
  "sender_location_update": string | null,
  "recipient_location_update": string | null,
  "sender_character_update": string | null,
  "recipient_character_update": string | null,
  "next_letter_travel_hours": integer
}

Field rules:

canon_addition
  A new entry for canon.md. Written in chronicle voice. 80–150 words.
  Begins with a heading: ### [DEVELOPING] {Short title of what is being established}
  Followed by: *established: ${today} · source: gm-inference*
  Then the entry body. No bullet points. Flowing prose. Spare and precise.
  null if this letter warrants no canon change.

world_event
  A single sentence, past tense, factual. Recorded in events.md.
  Example: "Maren Voss departed Crull by river barge, destination unstated."
  null if no event worth recording occurred.

gm_notes_addition
  Private. Never shown to players. Your scratchpad.
  Record: implied motivations, emerging conspiracies, tensions held in reserve.
  1–4 sentences. Plain prose, not chronicle voice.
  Always populate this — even if canon_addition is null.

sender_location_update / recipient_location_update
  Short plain-English location string. null if unchanged or cannot be inferred.

sender_character_update / recipient_character_update
  Full updated character.md content if something meaningful has changed. null otherwise.

next_letter_travel_hours
  Integer. Never 0. Minimum 1.`;
  }

  _gmStyleBlock(style) {
    const s = (style ?? '').toLowerCase();
    if (s === 'gentle') {
      return `The world is forgiving. Consequences are present but recoverable. History records difficulty
without cruelty — tensions simmer, rarely boil. Characters are resilient. The world bends
toward warmth even in dark settings.`;
    }
    if (s === 'dramatic') {
      return `The world bends toward interesting trouble. When a letter opens a door, something walks through it.
Factions shift. Old alliances become uncertain. The world reads what players write and finds the
most consequential interpretation. You may introduce one new named entity per delivery (person,
place, or institution) if the letter clearly implies its existence — but only one, and only then.`;
    }
    return `The world has weight. Consequences follow from actions. History does not protect characters
from the implications of their choices. What players write echoes — sometimes quietly, sometimes
not. The world is neither hostile nor kind. It simply remembers.`;
  }

  _buildUserMessage({
    seed, facts, deepHistory, recentHistory, events, gmNotes,
    senderCharacter, senderLocation, recipientCharacter, recipientLocation,
    letterBody, senderName, recipientName, sentAt,
  }) {
    const blocks = [];

    if (seed) blocks.push(`WORLD SEED\n──────────\n${seed}`);

    if (facts?.trim()) {
      blocks.push(`ESTABLISHED FACTS — TREAT THESE AS IMMUTABLE\n─────────────────────────────────────────────\nThe following facts have been extracted from canon and must not be contradicted.\nIf the letter implies conflict with any of these, apply the contradiction handling rule.\n\n${facts}`);
    }

    if (deepHistory?.trim()) {
      blocks.push(`DEEP HISTORY — SUMMARISED RECORD\n──────────────────────────────────\n${deepHistory}`);
    }

    if (recentHistory?.trim()) {
      blocks.push(`RECENT HISTORY — VERBATIM RECORD\n──────────────────────────────────\n${recentHistory}`);
    }

    if (events?.trim()) {
      blocks.push(`RECENT WORLD EVENTS\n────────────────────\n${events}`);
    }

    if (gmNotes?.trim()) {
      blocks.push(`GM NOTES — PRIVATE\n───────────────────\nThese notes are not visible to players. They are your private continuity record.\n\n${gmNotes}`);
    }

    blocks.push(`SENDER\n───────\nCharacter: ${senderCharacter || senderName}\nLast known location: ${senderLocation || 'Unknown'}`);
    blocks.push(`RECIPIENT\n──────────\nCharacter: ${recipientCharacter || recipientName}\nLast known location: ${recipientLocation || 'Unknown'}`);

    const sentDate = sentAt
      ? new Date(sentAt * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      : 'unknown date';
    blocks.push(`THE LETTER\n───────────\nFrom: ${senderName}\nTo: ${recipientName}\nIn-world date sent: ${sentDate}\n\n${letterBody}`);

    blocks.push(`Now produce your JSON response. Remember:
- No preamble, no explanation, no markdown fences.
- Raw JSON only.
- canon_addition must begin with the ### [DEVELOPING] heading format if not null.
- gm_notes_addition is always populated.
- next_letter_travel_hours is always an integer ≥ 1.`);

    return blocks.join('\n\n---\n\n');
  }
}