# Loremail — GM Engine Project Plan
### `loremail-gm-engine` npm package

---

## Part 1 — Architecture

---

### What the engine is

A standalone, stateless npm package. It has no memory between runs. Every run reads
the game repo from disk, does its work, and writes back to disk. The GitHub Actions VM
is destroyed afterward. Statefulness lives entirely in the repo files.

The engine is deliberately game-agnostic. It knows about world state, canon, prompts,
and AI calls. It does not know about letters, players, or travel time — those are
Loremail concerns handled by `scripts/gm.js`.

---

### Module map

```
loremail-gm-engine/
  index.js                ← public API, exports GMEngine class
  src/
    engine.js             ← orchestrator, GMEngine class lives here
    world-state.js        ← all file I/O, append-only enforcement
    canon-manager.js      ← two-layer canon, compression logic
    fact-extractor.js     ← post-canon fact extraction pass
    consistency.js        ← pre-commit consistency check
    prompt-builder.js     ← assembles full prompt in correct order
    model-client.js       ← Copilot API wrapper, retry logic
    status-writer.js      ← writes .gm-status.json after every run
    compression-prompt.js ← compression-specific prompt assembly
  README.md
  package.json
```

---

### Data flow — single delivery

```
gm.js (Loremail)
  │
  ├─ reads game.json, engine.json
  ├─ instantiates GMEngine
  ├─ for each due letter:
  │    │
  │    └─ engine.processDelivery(letterContext)
  │         │
  │         ├─ world-state.js      → read all world files into memory
  │         ├─ prompt-builder.js   → assemble full prompt
  │         ├─ model-client.js     → call Copilot API
  │         ├─ consistency.js      → check response against canon-facts
  │         ├─ world-state.js      → append canon_addition to canon.md
  │         ├─ world-state.js      → append world_event to events.md
  │         ├─ world-state.js      → append gm_notes_addition to gm-notes.md
  │         ├─ world-state.js      → update sender/recipient character.md
  │         ├─ fact-extractor.js   → extract facts → append to canon-facts.md
  │         ├─ canon-manager.js    → check if compression needed → run if so
  │         └─ returns GMDeliveryResult
  │
  ├─ gm.js handles letter move (pending → delivered), location.md, game.json
  └─ engine.writeStatus(result)    → writes .gm-status.json
```

---

### Data flow — world seed generation

```
gm.js
  └─ engine.generateWorldSeed(seedContext)
       │
       ├─ prompt-builder.js   → assemble seed prompt (different shape)
       ├─ model-client.js     → call API
       ├─ world-state.js      → write seed.md, initial canon.md, events.md,
       │                         gm-notes.md, canon-facts.md (all blank scaffolds)
       └─ returns GMSeedResult
```

---

### Data flow — compression (triggered from within processDelivery)

```
canon-manager.js
  └─ runCompression()
       │
       ├─ identify oldest 50% of RECENT HISTORY entries
       ├─ extract anchor list (all proper nouns + canon-facts.md terms)
       ├─ split into chunks of ≤5 entries
       ├─ for each chunk:
       │    ├─ compression-prompt.js  → assemble chunk compression prompt
       │    └─ model-client.js        → call API at temperature 0.2
       ├─ stitch compressed paragraphs (retain heading + date skeleton)
       ├─ world-state.js              → append to DEEP HISTORY
       ├─ world-state.js              → remove compressed entries from RECENT HISTORY
       └─ returns CompressResult
```

---

### File ownership

Every file in the game repo has exactly one module that may write to it.
No other module touches it directly — all writes go through world-state.js.

| Game repo file | Written by | Notes |
|---|---|---|
| `world/seed.md` | world-state.js | Written once at seed generation |
| `world/canon.md` | world-state.js | Append-only after creation |
| `world/canon-facts.md` | world-state.js | Append-only after creation |
| `world/events.md` | world-state.js | Append-only after creation |
| `world/gm-notes.md` | world-state.js | Append-only after creation |
| `players/{id}/character.md` | world-state.js | Updated by GM per delivery |
| `players/{id}/location.md` | gm.js (Loremail) | Engine returns value, gm.js writes |
| `config/game.json` | gm.js (Loremail) | Engine never touches this |
| `config/engine.json` | Never at runtime | Read-only during GM runs |
| `.gm-status.json` | status-writer.js | Overwritten each run |

---

### Error handling philosophy

- **Model call fails (transient):** retry up to 3 times with exponential backoff
- **Model returns malformed JSON:** retry once with an explicit format correction message appended
- **Model returns JSON missing required fields:** fill defaults (null for strings, default_travel_hours for integer), log to gm-status.json, continue
- **Consistency check finds conflict:** apply contradiction handling rule, do not block delivery
- **Compression fails:** log to gm-status.json, skip compression this run, continue delivery — canon will be slightly oversized until next successful run
- **Any unrecoverable error:** write failure to gm-status.json, exit non-zero so GitHub Actions marks the run failed (founder can inspect Actions log)

The game should never be left in a broken state by a failed run. Every operation either
completes cleanly or is skipped with a logged reason. Partial writes are not acceptable —
world-state.js must complete each append atomically before the next step begins.

---

---

## Part 2 — Module Implementation Specs

---

### `engine.js` — Orchestrator

The GMEngine class. Instantiated once per run by gm.js. Coordinates all modules.

**Constructor**
```javascript
new GMEngine({
  repoPath: string,        // absolute path to game repo root
  model: string,           // e.g. "gpt-4o"
  apiToken: string,        // Copilot API token from env
  engineConfig: object,    // parsed engine.json
})
```

**Public methods**

```javascript
await engine.generateWorldSeed(seedContext)
```
- `seedContext`: `{ worldName, flavour, era, tone, gmStyle, founderCharacter }`
- Builds seed prompt, calls model, writes initial world files
- Returns `GMSeedResult`

```javascript
await engine.processDelivery(letterContext)
```
- `letterContext`: `{ letter, sender, recipient, gameConfig }`
  - `letter`: `{ body, from, to, sentAt, deliverAt }`
  - `sender`: `{ id, character, location }` — character and location file contents
  - `recipient`: `{ id, character, location }`
  - `gameConfig`: `{ gmStyle, defaultTravelHours, ... }`
- Orchestrates full delivery pipeline
- Returns `GMDeliveryResult`

```javascript
await engine.writeStatus(result)
```
- Delegates to status-writer.js
- Always called by gm.js after all deliveries complete

**Return types**

```javascript
// GMDeliveryResult
{
  success: boolean,
  letterId: string,
  canonAddition: string | null,
  worldEvent: string | null,
  gmNotesAddition: string | null,
  senderCharacterUpdate: string | null,   // full new character.md content
  recipientCharacterUpdate: string | null,
  senderLocationUpdate: string | null,
  recipientLocationUpdate: string | null,
  nextLetterTravelHours: integer,
  compressionRan: boolean,
  error: string | null,
}

// GMSeedResult
{
  success: boolean,
  seedContent: string,
  error: string | null,
}
```

---

### `world-state.js` — File I/O

All reads and writes to the game repo. The only module that touches the filesystem
(except status-writer.js for `.gm-status.json`).

**Append-only enforcement**
All write methods for world files are append operations. There is no `overwrite` method
for canon.md, events.md, gm-notes.md, or canon-facts.md. The only files that can be
fully rewritten are character.md files (GM-driven updates) and .gm-status.json.

**Read methods**

```javascript
readWorldState(repoPath)
// Returns a single WorldState object containing all world files.
// Called once at the start of processDelivery.
// {
//   seed: string,
//   canonDeepHistory: string,    // DEEP HISTORY section content only
//   canonRecentHistory: string,  // RECENT HISTORY section content only
//   canonFacts: string,
//   events: string,              // last 20 entries
//   gmNotes: string,
// }

readPlayerFiles(repoPath, playerId)
// Returns { character: string, location: string }

readEngineConfig(repoPath)
// Returns parsed engine.json object

readGameConfig(repoPath)
// Returns parsed game.json object
```

**Write methods**

```javascript
appendToCanon(repoPath, entry)
// entry: string — the ### [DEVELOPING] block from model output
// Appends to RECENT HISTORY section of canon.md
// Never touches DEEP HISTORY section

appendToEvents(repoPath, eventLine)
// Appends single line to events.md with ISO timestamp prefix

appendToGmNotes(repoPath, note)
// Appends note block to gm-notes.md with timestamp

appendToCanonFacts(repoPath, facts)
// Appends bullet list to canon-facts.md

updateCharacter(repoPath, playerId, newContent)
// Full rewrite of players/{playerId}/character.md
// Only write method that is not append-only

replaceRecentHistory(repoPath, newRecentHistoryContent)
// Used by canon-manager.js after compression
// Replaces only the RECENT HISTORY section
// DEEP HISTORY section is never touched by this method

appendToDeepHistory(repoPath, compressedBlock)
// Appends compressed block to DEEP HISTORY section
```

**Canon.md section parsing**

canon.md has a fixed structure that world-state.js must parse and maintain:

```markdown
## DEEP HISTORY
*[summarised — compressed from earlier records]*

{deep history content}

---

## RECENT HISTORY
*[verbatim — last recorded entries]*

{recent history entries}
```

The `---` divider between sections is the parse boundary.
world-state.js uses this divider to split and reconstruct the file.
The section headers and italicised subtitles are never modified.

---

### `canon-manager.js` — Two-Layer Canon

Manages the rolling window of RECENT HISTORY and triggers compression.

**Public methods**

```javascript
isCompressionNeeded(recentHistoryContent, wordLimit)
// Returns boolean
// Counts words in recentHistoryContent, compares to wordLimit from engine.json

async runCompression(worldState, engineConfig, modelClient)
// Full compression pipeline — see data flow above
// Returns CompressResult: { success, chunksProcessed, error }
```

**Compression implementation detail**

Step 1 — Identify entries to compress
- Parse RECENT HISTORY into individual entries (split on `### ` headings)
- Take the oldest 50% by entry order (not by word count)
- These are the "compress candidates"

Step 2 — Build anchor list
- Programmatically scan compress candidates for capitalised multi-word terms
  and any term already present in canon-facts.md
- Deduplicate
- This list is injected into every compression prompt chunk

Step 3 — Chunk and compress
- Split compress candidates into groups of ≤5 entries
- For each chunk, call compression-prompt.js to build the prompt
- Call model at temperature 0.2
- Collect compressed paragraph per chunk

Step 4 — Reconstruct
- Each compressed paragraph retains this skeleton:
  ```
  **{Original heading title} / {Original heading title} / ...**
  *{earliest established date} – {latest established date}*

  {compressed prose, 2-4 sentences}
  ```
  Multiple entries in a chunk are merged under a combined heading.
  Proper nouns from the anchor list must all appear in the prose.

Step 5 — Write
- world-state.js.appendToDeepHistory() for the stitched compressed block
- world-state.js.replaceRecentHistory() with remaining (non-compressed) entries

---

### `fact-extractor.js` — Canon Fact Extraction

After each new canon_addition, extracts concrete facts into canon-facts.md.
Runs at temperature 0.3.

**Public methods**

```javascript
async extractFacts(canonAddition, modelClient)
// canonAddition: string — the new entry just appended to canon.md
// Returns: string — bullet list of extracted facts, ready to append
```

**Extraction prompt (inline, not in prompt-builder.js)**

```
You are extracting hard facts from a world history entry.

Your output is a bullet list only. No preamble. No commentary.

Rules:
- One fact per bullet
- Each fact is a single declarative sentence
- Concrete and specific — names, places, relationships, states of affairs
- No inference, no interpretation — only what is explicitly stated
- No duplicates with existing facts (existing facts provided below)

EXISTING FACTS:
{canon-facts.md current content}

NEW ENTRY TO EXTRACT FROM:
{canonAddition}

Output only the new bullet points. If there are no new facts not already captured, output nothing.
```

**Output format**
```
- Maren Voss departed Crull by river barge.
- The cartographers' guild has not filed a report in eleven days.
- The eastern waystation at Crull was last staffed by a man named Oswin Felt.
```

Appended to canon-facts.md directly. No heading, no date. Flat list only.

---

### `consistency.js` — Pre-Commit Consistency Check

Checks the model's proposed canon_addition against canon-facts.md before writing.
If a conflict is found, it does NOT block — it resolves using the contradiction handling rule.

**Public methods**

```javascript
async checkConsistency(proposedAddition, canonFacts, modelClient)
// Returns ConsistencyResult:
// {
//   consistent: boolean,
//   conflicts: string[],        // plain-English descriptions of each conflict
//   resolvedAddition: string,   // either original or rewritten to reconcile
// }
```

**Consistency prompt (inline)**

```
You are a continuity editor for a world history record.

You will be given:
1. A list of established facts (immutable)
2. A proposed new history entry

Your job: identify any direct contradictions between the proposed entry and the established facts.

A contradiction is when the proposed entry states or implies something that cannot be
simultaneously true with an established fact.

Respond with JSON only:
{
  "consistent": boolean,
  "conflicts": string[]   // empty array if consistent
}

ESTABLISHED FACTS:
{canonFacts}

PROPOSED ENTRY:
{proposedAddition}
```

**Conflict resolution**

If `consistent: false`, engine.js calls model-client.js a second time with a resolution prompt:

```
A proposed history entry conflicts with established facts.
Rewrite the entry so that both the existing facts and the new information
are simultaneously true. Find the most dramatically interesting reconciliation.
Do not reject or omit the new information — recontextualise it.

ESTABLISHED FACTS:
{canonFacts}

CONFLICTS IDENTIFIED:
{conflicts joined as bullet list}

ORIGINAL PROPOSED ENTRY:
{proposedAddition}

Output only the rewritten entry. Same format as the original (### [DEVELOPING] heading etc).
No preamble.
```

The rewritten entry is what gets appended to canon.md.

---

### `prompt-builder.js` — Full Prompt Assembly

Assembles the delivery prompt in the exact order specified in the GM Prompt document.
Returns a `messages` array ready to pass to model-client.js.

**Public methods**

```javascript
buildDeliveryPrompt(worldState, letterContext, engineConfig)
// worldState: WorldState object from world-state.readWorldState()
// letterContext: same shape as engine.processDelivery() param
// engineConfig: parsed engine.json
// Returns: [ { role: 'system', content: string }, { role: 'user', content: string } ]

buildSeedPrompt(seedContext)
// seedContext: { worldName, flavour, era, tone, gmStyle, founderCharacter }
// Returns: [ { role: 'system', content }, { role: 'user', content } ]
```

**Delivery prompt assembly — user message block order**

1. World seed (`worldState.seed`)
2. Canon facts (`worldState.canonFacts`) — with hard constraint header
3. Deep history (`worldState.canonDeepHistory`)
4. Recent history (`worldState.canonRecentHistory`)
5. Recent world events (`worldState.events`)
6. GM notes (`worldState.gmNotes`)
7. Sender character + location (`letterContext.sender.character`, `.location`)
8. Recipient character + location (`letterContext.recipient.character`, `.location`)
9. The letter (`letterContext.letter.body`, `.from`, `.to`, `.sentAt`)
10. Output reminder (static, always appended last)

**System prompt gm_style injection**

The system prompt template has three mutually exclusive style blocks.
prompt-builder.js selects the correct one based on `letterContext.gameConfig.gmStyle`
and splices it into the system prompt string before returning.

**Seed prompt shape**

System message: stripped-down version of the delivery system prompt.
Focus on: voice rules, output format, no contradiction rules (world doesn't exist yet).

User message:
```
You are generating the opening history of a new world.

World name: {worldName}
Flavour: {flavour}
Era: {era}
Tone: {tone}
Founder's character: {founderCharacter.name} — {founderCharacter.bio}

Produce:
1. seed.md — a 250–300 word world introduction. Third person, past tense, chronicle voice.
   Set the scene. Establish the era, the atmosphere, the central tension.
   Do not resolve anything. End with the world in motion, not at rest.
2. The first canon entry — one [DEVELOPING] entry, 80–120 words, establishing one
   concrete fact about the world that the founder's character would know.

Respond with JSON only:
{
  "seed": string,
  "first_canon_entry": string
}
```

---

### `model-client.js` — API Wrapper

Thin wrapper around the Copilot API (OpenAI-compatible endpoint).

**Public methods**

```javascript
async call({ messages, temperature, maxTokens })
// Returns: string — raw text content of model response
// Throws on unrecoverable failure after retries

async callJson({ messages, temperature, maxTokens })
// Same as call() but parses and returns JSON
// Retries once with format correction message if JSON parse fails
```

**Retry logic**

- Transient errors (5xx, timeout, rate limit): retry up to 3 times
- Backoff: 2s, 4s, 8s
- 4xx errors (bad request, auth): do not retry, throw immediately
- JSON parse failure: retry once with appended message:
  ```
  Your previous response could not be parsed as JSON.
  Respond with raw JSON only. No markdown fences. No preamble.
  ```

**Constructor**

```javascript
new ModelClient({
  apiToken: string,
  model: string,          // from game.json
  defaultTemperature: number,   // from engine.json
  defaultMaxTokens: number,     // hardcoded 1500 for delivery, 800 for extraction
})
```

---

### `status-writer.js` — Run Status

Writes `.gm-status.json` after every run. Always runs, even on failure.

**Public methods**

```javascript
writeStatus(repoPath, statusPayload)
// Overwrites .gm-status.json
```

**Schema**

```json
{
  "timestamp": "ISO 8601",
  "trigger": "letter_delivery | seed_generation | finalization",
  "success": true,
  "lettersProcessed": 2,
  "compressionRan": false,
  "deliveries": [
    {
      "letterId": "1714000000_alice_bob_uuid.md",
      "success": true,
      "canonAddition": true,
      "worldEvent": true,
      "consistencyConflict": false,
      "error": null
    }
  ],
  "error": null
}
```

On failure:
```json
{
  "timestamp": "ISO 8601",
  "trigger": "letter_delivery",
  "success": false,
  "lettersProcessed": 0,
  "compressionRan": false,
  "deliveries": [],
  "error": "ModelClient: API returned 401 Unauthorized"
}
```

---

### `compression-prompt.js` — Compression Prompt Assembly

Separate from prompt-builder.js because compression is a fundamentally different
task with different instructions, lower temperature, and different output expectations.

**Public methods**

```javascript
buildCompressionChunkPrompt(chunk, anchorList)
// chunk: string[] — array of raw canon entry strings (≤5 entries)
// anchorList: string[] — proper nouns and known facts that must survive
// Returns: [ { role: 'system', content }, { role: 'user', content } ]
```

**System message**

```
You are compressing historical records into a permanent archive.
Your output will never be revised. Write with the precision of a historian
who knows these words will outlast their author.

Rules:
- Third person, past tense, chronicle voice
- Every proper noun in the anchor list must appear in your output by name
- Do not invent anything not present in the source entries
- Do not resolve ambiguities the source entries left open
- Retain the earliest and latest established dates
- Output only the compressed block. No preamble.
```

**User message**

```
Compress the following {n} history entries into a single archived block.

ANCHOR LIST — every item here must appear in your output:
{anchorList as bullet list}

OUTPUT FORMAT:
**{Title 1} / {Title 2} / ...**
*{earliest date} – {latest date}*

{compressed prose, 2–4 sentences per original entry, combined}

SOURCE ENTRIES:
{chunk entries, joined with ---}
```

---

## Part 3 — package.json & Integration Notes

---

### `packages/gm-engine/package.json`

```json
{
  "name": "loremail-gm-engine",
  "version": "0.1.0",
  "type": "module",
  "main": "index.js",
  "exports": {
    ".": "./index.js"
  },
  "dependencies": {
    "gray-matter": "^4.0.3",
    "openai": "^4.0.0"
  }
}
```

- `gray-matter` for parsing letter frontmatter (YAML)
- `openai` SDK for Copilot API calls (OpenAI-compatible)
- No other runtime dependencies

### `index.js`

```javascript
export { GMEngine } from './src/engine.js';
```

Only GMEngine is exported. All other modules are internal.

---

### How `scripts/gm.js` (Loremail) uses the engine

```javascript
import { GMEngine } from 'loremail-gm-engine';
import { readFileSync } from 'fs';

const repoPath = process.cwd();
const gameConfig = JSON.parse(readFileSync(`${repoPath}/config/game.json`));
const engineConfig = JSON.parse(readFileSync(`${repoPath}/config/engine.json`));

if (gameConfig.gm_paused) process.exit(0);

const engine = new GMEngine({
  repoPath,
  model: gameConfig.model,
  apiToken: process.env.COPILOT_TOKEN,
  engineConfig,
});

// gm.js is responsible for:
// - scanning /letters/pending/ for due letters
// - passing letter + sender/recipient context to engine
// - receiving result and moving letter file (pending → delivered)
// - writing location.md files (engine returns values, gm.js writes)
// - updating default_travel_hours in game.json
// - calling engine.writeStatus() at the end

const results = [];

for (const letter of dueLetter) {
  const result = await engine.processDelivery({ letter, sender, recipient, gameConfig });
  // gm.js handles: move file, write location.md, update game.json
  results.push(result);
}

await engine.writeStatus({ trigger: 'letter_delivery', deliveries: results });
```

---

## Part 4 — Open Items Before Build

1. **Character update logic** — engine.processDelivery returns `senderCharacterUpdate`
   and `recipientCharacterUpdate` as full new character.md content. The GM prompt needs
   a character update instruction block added (currently missing from the prompt draft).
   Define: what triggers a character update? Any delivery, or only when something
   meaningful changes? What's the output format for character.md?

2. **Seed prompt output** — seed generation writes seed.md and the first canon entry.
   Does it also write the scaffold for events.md, gm-notes.md, canon-facts.md?
   Likely yes — gm.js or world-state.js should create blank scaffolds for all world
   files at seed time so later appends always have a valid file to write to.

3. **events.md read window** — prompt-builder.js injects "last 20 entries."
   Confirm 20 is the right number. At high frequency games this could be a lot of
   context. Consider making this configurable in engine.json as `events_window`.

4. **character.md format** — not yet defined. Needs a spec before world-state.js
   can implement updateCharacter(). Suggest: name, one-sentence bio (player-set,
   never changed by GM), then a GM-maintained section for accumulated traits,
   relationships, and notable history.

5. **Local development without GitHub Actions** — `act` is listed in the dev setup
   but how gm.js is invoked locally (with a test game repo, fake letter files) needs
   a short dev guide. Out of scope for this document but worth a follow-up.
