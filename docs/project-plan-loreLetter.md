# Loremail — Complete Project Plan
### An epistolary world-building game for 2–8 players

---

## Overview

Players write letters to each other inside a shared fantasy world. The world is fully AI-driven — players only influence it indirectly through what they write. Letters take in-world time to arrive. The world slowly grows in the background, reacting to correspondence.

**Core principle:** The GitHub repo *is* the game. The app is just a window into it. The Cloudflare Worker is the invisible doorman.

---

## Developer Environment

### Machine Setup
- **OS:** Windows with WSL2 (Ubuntu) for all development
- **IDE:** IntelliJ IDEA or WebStorm (Windows), connected to WSL2 filesystem
- **AI Assistant:** GitHub Copilot (subscription), JetBrains plugin installed
- **Terminal:** Ubuntu terminal (WSL2) for all commands — never PowerShell for this project

### Why WSL2
The GM engine runs in GitHub Actions on Ubuntu. Wrangler (Cloudflare), `act` (local Actions), and Node tooling all behave correctly on Unix. Developing inside WSL2 means local behavior matches production exactly.

### Installed Tools (all inside WSL2 Ubuntu)

| Tool | Purpose | Install Command |
|------|---------|-----------------|
| Homebrew | Package manager | `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"` |
| nvm | Node version manager | `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh \| bash` |
| Node.js 20 | Runtime | `nvm install 20 && nvm alias default 20` |
| npm | Package manager | Included with Node |
| gh CLI | GitHub API + auth | `brew install gh` then `gh auth login` |
| Wrangler CLI | Cloudflare Worker deploy | `npm install -g wrangler` then `wrangler login` |
| act | Run GitHub Actions locally | `brew install act` |
| Docker Desktop | Required by act | Install from docker.com (Windows, integrates with WSL2) |

### IntelliJ / WebStorm Configuration
- **Open project:** File → Open → WSL → Ubuntu → `/home/aleto44/LoreMail`
- **Node interpreter:** File → Project Settings → Node.js → Add → WSL → Ubuntu → Node 20
- **Terminal:** Leave global terminal as PowerShell (for other projects). Use a separate Ubuntu terminal window for all Loremail commands.
- **Do not** change the global terminal setting — it will affect other projects.

### Repository
- **GitHub username:** aleto44
- **Repo name:** LoreMail
- **Repo URL:** https://github.com/aleto44/LoreMail
- **Local path (WSL2):** `~/LoreMail` (`/home/aleto44/LoreMail`)
- **Visibility:** Public repo, game instances are private (auto-created per game)

---

## Repository Structure (Monorepo)

```
LoreMail/
  package.json              ← npm workspace root
  .gitignore
  packages/
    gm-engine/              ← reusable GM engine npm package
      package.json
      index.js
      src/
        engine.js
        world-state.js
        canon-manager.js
        fact-extractor.js
        consistency.js
        prompt-builder.js
        model-client.js
        status-writer.js
      README.md
  apps/
    worker/                 ← Cloudflare Worker
      package.json
      wrangler.toml
      src/
        index.js
    launcher/               ← Vite + vanilla JS static site
      package.json
      index.html
      src/
        main.js
        style.css
    pwa/                    ← Vite + React PWA
      package.json
      index.html
      src/
        main.jsx
        App.jsx
        style.css
        components/
```

### npm Workspaces
The root `package.json` ties all packages together. The PWA and Worker can import `loremail-gm-engine` locally during development without publishing to npm. When the engine is production-ready it gets published to npm and game repos install it normally.

---

## Game Repo Structure (Auto-Generated Per Game)

Each game gets its own private GitHub repo, scaffolded automatically by the Worker when a founder creates a game.

```
[worldname]-loremail/
  world/
    seed.md              ← AI-expanded world intro (~300 words)
    canon.md             ← public append-only lore, two-layer structure
    canon-facts.md       ← flat fact list, extracted by engine each run
    events.md            ← public world event log
    gm-notes.md          ← private GM scratchpad, founder-visible only
    chronicle.md         ← finalization momento, generated on demand
  players/
    {playerId}/
      character.md       ← name, one-sentence bio, evolves over time
      location.md        ← GM-inferred position, updated each delivery
  letters/
    pending/             ← in-transit letters
    delivered/           ← processed letters
  config/
    game.json            ← all game settings and player roster
    engine.json          ← engine configuration
  .gm-status.json        ← last run result, written by engine
  scripts/
    gm.js                ← Loremail-specific GM entry point
    package.json
  .github/
    workflows/
      gm-loop.yml        ← GitHub Action workflow
```

### Letter Filename Convention
`{deliver_at_unix}_{from}_{to}_{uuid}.md`
Sortable, parseable, no database needed.

### Letter Frontmatter
```yaml
---
from: alice
to: bob
sent_at: 1714000000
deliver_at: 1714086400
delivered: false
---
Letter body here...
```

### game.json
```json
{
  "name": "The Ashen Reach",
  "flavour": "a crumbling empire where magic is contraband",
  "era": "age-of-sail",
  "tone": "melancholic",
  "gm_style": "medium",
  "gm_paused": false,
  "model": "gpt-4o",
  "founder_id": "alice",
  "players": [
    { "id": "alice", "character": "Maren Voss", "joined": true, "is_founder": true },
    { "id": "bob", "character": null, "joined": false, "is_founder": false }
  ],
  "default_travel_hours": 24
}
```

### engine.json
```json
{
  "canon_recent_word_limit": 4000,
  "canon_deep_summary_target": 800,
  "temperature": 0.4,
  "consistency_check": true,
  "fact_extraction": true,
  "locked_tag": "[LOCKED]",
  "developing_tag": "[DEVELOPING]"
}
```

---

## Infrastructure Overview

| Component | Purpose | Where | Cost |
|-----------|---------|-------|------|
| Game repos | Source of truth for all game content | GitHub (private, per game) | Free |
| GM engine | Reusable world state + AI loop logic | npm package (used by Actions) | Free |
| GM loop | Runs the engine on a schedule | GitHub Actions (per game repo) | Free |
| Central Worker | Auth, invite links, triggers, identity | Cloudflare (aleto44's account) | Free |
| KV store | Game secrets + player identity | Cloudflare KV | Free |
| Launcher | Game creation UI | GitHub Pages | Free |
| PWA | Player app + founder panel | GitHub Pages or Vercel | Free |

No email service. No SMS. No database. Founder sends invite links however they want.

---

## How the GM Works — End to End

The GM is a Node.js script (`scripts/gm.js`) inside each game repo. It runs on GitHub's infrastructure via GitHub Actions. All AI processing happens here. The Cloudflare Worker never touches AI.

```
1. Player sends a letter
   → PWA commits file to /letters/pending/ via GitHub API

2. PWA calls POST /game/trigger on Cloudflare Worker

3. Worker dispatches GM Action workflow via GitHub API

4. GitHub spins up temporary Ubuntu VM, checks out game repo

5. VM installs dependencies (npm ci — includes loremail-gm-engine from npm)

6. VM runs scripts/gm.js (Loremail entry point):
     → checks gm_paused in game.json — exits if true
     → reads engine.json config
     → instantiates GMEngine
     → scans /letters/pending/ for deliver_at <= now
     → for each due letter:
         a. reads letter body + frontmatter
         b. engine reads sender + recipient character + location
         c. engine reads world state (canon, facts, events, gm-notes)
         d. engine assembles prompt (see Prompt Builder order below)
         e. engine calls Copilot API (model + temperature from config)
         f. engine runs consistency check on proposed addition
         g. engine appends canon_addition to canon.md (append-only enforced in code)
         h. engine runs fact extraction → appends to canon-facts.md
         i. engine appends world_event to events.md
         j. engine appends gm_notes_addition to gm-notes.md
         k. gm.js updates sender + recipient location.md
         l. gm.js updates default_travel_hours in game.json
         m. gm.js moves letter to /delivered/, marks delivered: true
         n. engine checks if canon summarization is needed → runs if so
     → single commit: "GM: delivery [timestamp]"
     → engine writes /.gm-status.json

7. VM destroyed. All changes now in repo.

8. Next time any player opens the app, they poll and see updates.
```

---

## The GM Engine Package (`loremail-gm-engine`)

A standalone npm package containing all world state management, context window strategy, and lore stability logic. Designed to be reusable in future world-building games with different mechanics.

### Engine Boundary

**Engine owns:**
- Reading and writing world state files (append-only enforced)
- Summarization layers (canon deep/recent split)
- Fact extraction pass
- Consistency check pass
- GM prompt architecture and assembly
- Copilot API calls (OpenAI-compatible)
- `.gm-status.json` writer
- World seed generation flow

**Game script owns (Loremail-specific):**
- Letter delivery mechanic (pending/delivered, frontmatter, travel time)
- Character and location update logic
- Finalization/chronicle prompt
- How triggers map to engine calls

### Engine Public API

```javascript
import { GMEngine } from 'loremail-gm-engine';

const engine = new GMEngine({
  repoPath: process.cwd(),
  model: game.model,
  apiToken: process.env.COPILOT_TOKEN,
  engineConfig: engineJson,
});

await engine.generateWorldSeed(seedPromptContext);
await engine.processDelivery(letterContext);
await engine.generateChronicle(chronicleContext);
await engine.runConsistencyCheck(proposedAddition);
await engine.extractFacts(newCanonText);
await engine.summarizeIfNeeded();
```

### Module Responsibilities

**`world-state.js`**
- All file reads and writes
- Append-only enforcement — the only module that writes to canon.md
- Never overwrites existing content, only appends
- Parses letter frontmatter

**`canon-manager.js`**
- Manages the two-layer canon structure (DEEP HISTORY / RECENT HISTORY)
- Tracks word count of RECENT HISTORY section
- Runs compression when threshold exceeded
- Manages LOCKED / DEVELOPING entry tags
- `isCompressionNeeded()`, `runCompression()`, `appendEntry()`, `promoteToLocked()`

**`fact-extractor.js`**
- After each new canon addition, calls model with extraction prompt
- Produces flat bullet list of concrete facts
- Appends to canon-facts.md

**`consistency.js`**
- Before committing a new canon addition, calls model with consistency prompt
- Checks proposed addition against existing canon-facts.md
- Returns `{ consistent: bool, conflicts: [] }`
- On conflict: applies contradiction handling rule (makes it work, doesn't reject)

**`prompt-builder.js`**
- Assembles the full GM prompt in consistent order:
  1. System prompt (historian voice, GM style, contradiction rule, tag rules)
  2. World seed
  3. canon-facts.md (hard constraints)
  4. DEEP HISTORY summary
  5. RECENT HISTORY verbatim
  6. Recent world events
  7. GM notes (private)
  8. Sender character + location
  9. Recipient character + location
  10. The letter itself
  11. Output format instructions (JSON)

**`model-client.js`**
- Wrapper around the Copilot API (OpenAI-compatible endpoint)
- Accepts model name, temperature, messages array
- Returns parsed response
- Handles retries on transient errors

**`status-writer.js`**
- Writes `.gm-status.json` after every run
- Records: timestamp, trigger type, letters processed, success/failure, error if any

---

## Context Window Strategy — Summarization Layers

Canon grows unboundedly. The engine manages this with a two-layer structure inside `canon.md`:

```markdown
## DEEP HISTORY
*[summarized — compressed from earlier records]*

The empire's retreat from the Interior began not with a decree
but with a silence. The cartographers' guild, once the empire's
most reliable instrument of administration, stopped filing
reports in the third year of the current reckoning...

[~800 words, stable, rarely changes]

---

## RECENT HISTORY
*[verbatim — last recorded entries]*

### [DEVELOPING] The eastern waystation at Crull
*established: 2024-03-15 · source: gm-inference*

No correspondence has been received from Crull in eleven days...

[~4000 words max, verbatim, rolling window]
```

### Compression Trigger
When RECENT HISTORY exceeds `canon_recent_word_limit` (default 4,000 words):
1. Engine takes oldest 50% of RECENT HISTORY entries
2. Calls model with compression prompt at temperature 0.2 (very stable)
3. Appends compressed result to DEEP HISTORY
4. Removes compressed entries from RECENT HISTORY
5. Commits as `"GM: canon compression [timestamp]"`

---

## Lore Stability Strategy

Four layers in order of priority:

### Layer 1: Append-Only Architecture
Enforced in `world-state.js` at the code level — not just prompt instructions. The model output can only add new entries. It cannot touch existing text. Physical guarantee regardless of what the model generates.

### Layer 2: Low Temperature
All GM runs use temperature 0.4 (configurable in engine.json). Compression runs use 0.2. High temperature is the enemy of lore coherence.

### Layer 3: Locked / Developing Tags
```
### [LOCKED] The market district is a protected guild sanctuary
*established: 2024-03-01 · source: gm-inference*

### [DEVELOPING] The conspiracy within the guild's inner circle
*established: 2024-03-15 · source: gm-inference*
```
- `[LOCKED]` — never contradict, only build on
- `[DEVELOPING]` — open to reinterpretation and expansion
- New entries always start as `[DEVELOPING]`
- Founder can promote to `[LOCKED]` via control panel

### Layer 4: Fact Extraction Pass
After each canon addition, a lightweight model call extracts concrete facts into `canon-facts.md`. Bulleted facts are harder to contradict than flowing prose. This file is fed to every future GM run as hard constraints.

### Contradiction Handling Rule (system prompt)
*"If a player's letter implies something that appears to contradict existing canon, do not reject it. Treat it as new information that recontextualizes what came before. Find the most dramatically interesting explanation that makes both things simultaneously true and record it as established history. The world builds around what players write."*

---

## GM Response Format

```json
{
  "canon_addition": "string or null",
  "world_event": "string or null",
  "gm_notes_addition": "string or null",
  "sender_location_update": "string or null",
  "recipient_location_update": "string or null",
  "next_letter_travel_hours": 24
}
```

---

## GM Behaviour Rules

### Writing Style
Third person, past tense, measured and authoritative. Like entries being added to a chronicle as events unfold. Never purple prose, never chatty. World events are reported as fact with the weight of recorded history.

### GM Style Settings
- *Gentle:* warm, forgiving, consequences are light and recoverable
- *Medium:* tension and weight, the world has consequence, history remembers
- *Dramatic:* factions shift, characters swept up in events, world bends toward interesting trouble

### Private GM Notes
`gm-notes.md` tracks implications from private letters, suspected character motivations, conspiracy threads, and contradictions held in tension. Read every run as private context. Never surfaced to players. Founder-visible only via control panel.

### Removed Players
If a player has been removed, the GM weaves their absence into the world narratively — they didn't vanish, they went somewhere the world can record.

---

## GitHub Action Workflow

`.github/workflows/gm-loop.yml` — committed to each game repo at creation:

```yaml
name: GM Loop
on:
  schedule:
    - cron: '0 * * * *'
  workflow_dispatch:
    inputs:
      trigger:
        description: 'letter_delivery | seed_generation | finalization'
        default: 'letter_delivery'

permissions:
  contents: write

jobs:
  gm:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: node scripts/gm.js
        env:
          COPILOT_TOKEN: ${{ secrets.COPILOT_TOKEN }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TRIGGER: ${{ inputs.trigger || 'letter_delivery' }}
```

### Actions Minutes Budget
- Each run: ~10–30 seconds
- Hourly cron: ~360 min/month per active game
- Free tier: 2,000 min/month
- Comfortable for several simultaneous active games

---

## Cloudflare Worker

### Endpoints

**`POST /game/create`**
- Receives: `{ founderGithubToken, copilotToken, worldFlavour, era, tone, gmStyle, model, founderCharacterName, founderCharacterBio, passphrase }`
- Creates private GitHub repo via GitHub API
- Scaffolds all folders and files including engine.json and gm.js
- Encrypts and stores copilotToken as GitHub Actions secret (libsodium)
- Commits GM workflow YAML
- Stores in KV: `{ repoOwner, repoName, hashedPassphrase, githubToken, founderId, players }`
- Triggers world seed generation via workflow dispatch
- Returns: `{ gameId }`

**`POST /game/invite`**
- Receives: `{ gameId, passphrase, inviteeName, letterBody }`
- Validates passphrase
- Generates unique invite token, stores in KV
- Commits pending letter file to repo
- Returns: `{ inviteLink }` e.g. `loremail.app/join?game={gameId}&invite={token}`

**`POST /game/join`**
- Receives: `{ gameId, inviteToken, characterName, characterBio }`
- Validates invite token (single-use)
- Writes character.md and location.md to repo
- Updates game.json, stores session in KV
- Returns: `{ githubToken, playerId, characterName, isFounder: false }`

**`POST /game/trigger`**
- Receives: `{ gameId, passphrase }`
- Dispatches GM Action workflow immediately after letter send
- Returns: `{ success }`

**`GET /game/player`**
- Receives: `{ gameId, passphrase }` as query params
- Restores session after localStorage cleared or new device
- Returns: `{ githubToken, playerId, characterName, isFounder }`

**`PATCH /game/config`** ← founder only
- Receives: `{ gameId, passphrase, changes }`
- Validates founder, writes to game.json and/or engine.json
- Returns: `{ success }`

**`POST /game/regenerate-invite`** ← founder only
- Generates new invite token, invalidates old one
- Returns: `{ inviteLink }`

**`DELETE /game/player`** ← founder only
- Marks player removed in game.json
- Returns: `{ success }`

### Cloudflare KV Schema

```
"game:{gameId}" → {
  repoOwner, repoName,
  hashedPassphrase,      ← bcrypt
  githubToken,           ← scoped fine-grained PAT
  founderId,
  players: [{ id, joined, inviteToken? }]
}

"invite:{token}" → { gameId, inviteeName, used: false }

"session:{gameId}:{playerId}" → { characterName, isFounder }
```

### Security
- Passphrase bcrypt-hashed, never stored plaintext
- Invite tokens single-use
- GitHub token scoped to single repo, minimum permissions
- Founder-only endpoints verify founderId matches caller
- All HTTPS (Cloudflare-enforced)

### wrangler.toml
```toml
name = "loremail-worker"
main = "src/index.js"
compatibility_date = "2024-01-01"

[[kv_namespaces]]
binding = "KV"
id = "YOUR_KV_NAMESPACE_ID"

[vars]
ENVIRONMENT = "production"
```

---

## Launcher

### Flow
```
Step 1: World seed form (4 fields)
Step 2: GitHub OAuth → founder token
Step 3: Founder character setup (name + one sentence bio)
Step 4: Copilot token entry + model selection dropdown
Step 5: POST /game/create → repo scaffolded, seed generated
Step 6: Passphrase revealed (auto-generated, three words)
Step 7: Write first letter → POST /game/invite → copy invite link
        Repeat step 7 for each player
Step 8: Link to open PWA
```

Founder must complete character setup before writing any letters — recipient sees sender's character name, so identity must exist first.

### Tech
- Vite + vanilla JS
- Single page, progressive disclosure through steps
- Hosted on GitHub Pages from `apps/launcher`

---

## PWA

### Tech Stack
- Vite + React
- Tailwind CSS
- vite-plugin-pwa (manifest, service worker, iOS Add to Home Screen)
- @octokit/rest (GitHub API client)
- react-markdown (renders canon.md and letters as prose)

### Auth Flow

**First open:**
```
loremail.app/join?game={gameId}&invite={token}
  → world atmospheric excerpt shown
  → waiting letter shown (sealed)
  → "Who are you in this world?" prompt
  → POST /game/join → { githubToken, playerId, isFounder }
  → stored in localStorage
```

**Subsequent opens:**
```
localStorage present → proceed directly
localStorage missing → prompt gameId + passphrase → GET /game/player → restore
```

### Data Fetching
Poll on app open and tab focus. Cache in memory, invalidate on focus.

All players fetch:
```
GET /letters/delivered/
GET /letters/pending/
GET /world/canon.md
GET /world/events.md
GET /players/{id}/character.md
GET /config/game.json
```

Founder additionally fetches:
```
GET /world/gm-notes.md
GET /world/canon-facts.md
GET /.gm-status.json
GET /world/chronicle.md  (if exists)
```

### Finalization / Chronicle
- Founder triggers via control panel
- Worker dispatches Action with `trigger: finalization`
- Engine reads all world state + character files
- Generates `/world/chronicle.md` — closing volume of the historical chronicle
- Stateless — no flags flip, game continues, can be triggered multiple times
- PWA renders as print-optimized styled HTML page

---

## UI Mockups

### Launcher — Step 1: World Seed Form

```
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║                    L O R E M A I L                       ║
║              begin a world. write a letter.              ║
║                                                          ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║  Describe your world                                     ║
║  ┌────────────────────────────────────────────────────┐  ║
║  │ a crumbling empire where magic is contraband...    │  ║
║  └────────────────────────────────────────────────────┘  ║
║                                                          ║
║  Era                                                     ║
║  [ Ancient ]  [ Medieval ]  [ Age of Sail ]              ║
║  [ Industrial ]  [ Other ]                               ║
║                                                          ║
║  Tone                                                    ║
║  [ Hopeful ]  [ Melancholic ]  [ Mysterious ]            ║
║  [ Dangerous ]                                           ║
║                                                          ║
║  The GM                                                  ║
║  [ Gentle · soft hands ]                                 ║
║  [ Medium · weight and consequence ]                     ║
║  [ Dramatic · the world bites back ]                     ║
║                                                          ║
║                          [ Continue → ]                  ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
```

---

### Launcher — Step 3: Founder Character Setup

```
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║                    L O R E M A I L                       ║
║                                                          ║
║  Before you can write, we need to know who you are.      ║
║                                                          ║
║  Your name in this world                                 ║
║  ┌────────────────────────────────────────────────────┐  ║
║  │ Maren Voss                                         │  ║
║  └────────────────────────────────────────────────────┘  ║
║                                                          ║
║  Who are you, in one sentence?                           ║
║  ┌────────────────────────────────────────────────────┐  ║
║  │ A disgraced cartographer mapping roads that no     │  ║
║  │ longer exist.                                      │  ║
║  └────────────────────────────────────────────────────┘  ║
║                                                          ║
║                          [ Continue → ]                  ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
```

---

### Launcher — Step 7: First Letter + Invite Link

```
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║  Write your first letter                                 ║
║                                                          ║
║  To (their name in the world)                            ║
║  ┌────────────────────────────────────────────────────┐  ║
║  │ Callum Reed                                        │  ║
║  └────────────────────────────────────────────────────┘  ║
║                                                          ║
║  ┌────────────────────────────────────────────────────┐  ║
║  │                                                    │  ║
║  │  The roads have grown strange since the edict.     │  ║
║  │  I found your name in the margin of an old map     │  ║
║  │  I was not meant to see. I do not know if this     │  ║
║  │  reaches you, but I had to try.                    │  ║
║  │                                                    │  ║
║  └────────────────────────────────────────────────────┘  ║
║                                                          ║
║                  [ Generate Invite Link ]                ║
║                                                          ║
║  ┌────────────────────────────────────────────────────┐  ║
║  │ loremail.app/join?game=ashen-reach&invite=x7k2p   │  ║
║  │                                      [ Copy Link ] │  ║
║  └────────────────────────────────────────────────────┘  ║
║                                                          ║
║  Share this link however you like. The passphrase is:   ║
║                                                          ║
║               wolf · runs · midnight                     ║
║                                                          ║
║         [ Invite Another Player ]   [ Open App → ]      ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
```

---

### PWA — First Open Experience (New Player)

```
┌──────────────────────────────────────┐
│                                      │
│                                      │
│         T H E  A S H E N            │
│              R E A C H              │
│                                      │
│   ─────────────────────────────      │
│                                      │
│   The empire does not fall at once.  │
│   It retreats, road by road, into    │
│   the memory of those who walked     │
│   them when the maps were true.      │
│                                      │
│   ─────────────────────────────      │
│                                      │
│         ┌─────────────────┐          │
│         │                 │          │
│         │   Callum Reed   │          │
│         │                 │          │
│         │        〄        │          │
│         │                 │          │
│         └─────────────────┘          │
│                                      │
│           tap to open                │
│                                      │
└──────────────────────────────────────┘
```

---

### PWA — Letter Reading View

```
┌──────────────────────────────────────┐
│  ←                                   │
│                                      │
│  ┌────────────────────────────────┐  │
│  │                                │  │
│  │   The roads have grown         │  │
│  │   strange since the edict.     │  │
│  │   I found your name in the     │  │
│  │   margin of an old map I       │  │
│  │   was not meant to see.        │  │
│  │                                │  │
│  │   I do not know if this        │  │
│  │   reaches you, but I had       │  │
│  │   to try.                      │  │
│  │                                │  │
│  │                  Maren Voss    │  │
│  │                                │  │
│  └────────────────────────────────┘  │
│                                      │
│           arrived just now           │
│                                      │
└──────────────────────────────────────┘
```

---

### PWA — Letters Screen (Inbox)

```
┌──────────────────────────────────────┐
│  THE WORLD      LETTERS              │
│  ─────────────────────────────────   │
│                                      │
│  ● Maren Voss                        │
│    The roads have grown strange...   │
│    arrived just now                  │
│                                      │
│  ─────────────────────────────────   │
│  IN TRANSIT                          │
│                                      │
│    → to Maren Voss                   │
│      arrives in ~18 hours            │
│                                      │
│                                      │
│                         ✦ compose    │
└──────────────────────────────────────┘
```

---

### PWA — Compose Screen

```
┌──────────────────────────────────────┐
│  ← cancel                  send →    │
│                                      │
│  To                                  │
│  ┌──────────────────────────────┐    │
│  │  Maren Voss               ▾  │    │
│  └──────────────────────────────┘    │
│                                      │
│  ┌──────────────────────────────┐    │
│  │                              │    │
│  │  Your letter...              │    │
│  │                              │    │
│  │                              │    │
│  │                              │    │
│  │                              │    │
│  └──────────────────────────────┘    │
│                                      │
│  will arrive in approximately        │
│  18 hours                            │
│                                      │
└──────────────────────────────────────┘
```

---

### PWA — World Screen (World Tab)

```
┌──────────────────────────────────────┐
│  THE WORLD      LETTERS              │
│                                      │
│  WORLD    CHARACTERS                 │
│  ───────                             │
│                                      │
│  The Ashen Reach was not always      │
│  called by that name. In the time    │
│  of the third cartographers' guild   │
│  it was known simply as the          │
│  Interior, a place of roads and      │
│  reasonable distances...             │
│                                      │
│  ─────────────────────────────────   │
│  RECENT EVENTS                       │
│                                      │
│  The eastern waystation at Crull     │
│  reported unusual smoke on the       │
│  horizon. No guild correspondence    │
│  has been received from that         │
│  region in eleven days.              │
│                                      │
└──────────────────────────────────────┘
```

---

### PWA — World Screen (Characters Tab)

```
┌──────────────────────────────────────┐
│  THE WORLD      LETTERS              │
│                                      │
│  WORLD    CHARACTERS                 │
│           ──────────                 │
│                                      │
│  ┌──────────────────────────────┐    │
│  │  Maren Voss          · you   │    │
│  │  A disgraced cartographer    │    │
│  │  mapping roads that no       │    │
│  │  longer exist.               │    │
│  │  last known: the Interior    │    │
│  └──────────────────────────────┘    │
│                                      │
│  ┌──────────────────────────────┐    │
│  │  Callum Reed                 │    │
│  │  A former guild enforcer     │    │
│  │  who stopped enforcing.      │    │
│  │  last known: Crull           │    │
│  └──────────────────────────────┘    │
│                                      │
└──────────────────────────────────────┘
```

---

### PWA — Founder Control Panel

```
┌──────────────────────────────────────┐
│  THE WORLD    LETTERS    ⚙ CONTROL   │
│                                      │
│  WORLD MANAGEMENT                    │
│  ─────────────────────────────────   │
│  Model      [ gpt-4o              ▾] │
│  GM Style   [ Gentle ][ Medium ]     │
│             [ Dramatic ]             │
│  GM Paused  [ off ]                  │
│  Temperature  0.4        [ edit ]    │
│                                      │
│  [ Trigger GM Now ]                  │
│  [ View GM Notes ]                   │
│  [ View Canon Facts ]                │
│  [ Generate Chronicle ]              │
│                                      │
│  PLAYERS                             │
│  ─────────────────────────────────   │
│  Maren Voss (you)         joined     │
│  Callum Reed              joined     │
│  ···                      awaiting   │
│  [ New Invite Link ]  [ Remove ]     │
│                                      │
│  GAME HEALTH                         │
│  ─────────────────────────────────   │
│  Last GM run    2 hours ago · ✓      │
│  Pending        1 letter in transit  │
│  Actions        312 min used         │
│  Canon size     1,842 words          │
│  Next compress  at 4,000 words       │
│                                      │
│  ─────────────────────────────────   │
│  [ Reset Travel Time ]               │
│  [ Archive Game ]                    │
│                                      │
└──────────────────────────────────────┘
```

---

### Chronicle / Finalization Momento (Print View)

```
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║                   THE ASHEN REACH                        ║
║            A Chronicle of the Interior Age               ║
║                                                          ║
║  ────────────────────────────────────────────────────    ║
║                                                          ║
║  The age now called the Interior Correspondence          ║
║  lasted some months by the reckoning of those who        ║
║  lived it, though historians have debated whether        ║
║  its end came with the burning of Crull or the           ║
║  silence that followed after...                          ║
║                                                          ║
║  ────────────────────────────────────────────────────    ║
║                                                          ║
║  WHAT BECAME OF THEM                                     ║
║                                                          ║
║  Maren Voss completed no maps that survived the          ║
║  guild's dissolution. She is recorded in two             ║
║  margin notes and one disputed deed of passage.          ║
║                                                          ║
║  Callum Reed returned to Crull three times. The          ║
║  third time he did not leave. What he found there        ║
║  is not recorded, which is itself a kind of record.      ║
║                                                          ║
║  ────────────────────────────────────────────────────    ║
║                                                          ║
║                         〄                               ║
║                    L O R E M A I L                       ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
```

---

## Scaffold Commands

Run all of the following from inside WSL2 Ubuntu terminal.

### Clone and Enter Repo
```bash
cd ~
git clone https://github.com/aleto44/LoreMail.git
cd LoreMail
```

### Create Full Folder Structure
```bash
# GM Engine package
mkdir -p packages/gm-engine/src
touch packages/gm-engine/package.json
touch packages/gm-engine/index.js
touch packages/gm-engine/src/engine.js
touch packages/gm-engine/src/world-state.js
touch packages/gm-engine/src/canon-manager.js
touch packages/gm-engine/src/fact-extractor.js
touch packages/gm-engine/src/consistency.js
touch packages/gm-engine/src/prompt-builder.js
touch packages/gm-engine/src/model-client.js
touch packages/gm-engine/src/status-writer.js
touch packages/gm-engine/README.md

# Cloudflare Worker
mkdir -p apps/worker/src
touch apps/worker/package.json
touch apps/worker/wrangler.toml
touch apps/worker/src/index.js

# Launcher
mkdir -p apps/launcher/src
touch apps/launcher/package.json
touch apps/launcher/index.html
touch apps/launcher/src/main.js
touch apps/launcher/src/style.css

# PWA
mkdir -p apps/pwa/src/components
touch apps/pwa/package.json
touch apps/pwa/index.html
touch apps/pwa/src/main.jsx
touch apps/pwa/src/App.jsx
touch apps/pwa/src/style.css
```

### Root package.json (npm Workspaces)
```bash
cat > package.json << 'EOF'
{
  "name": "loremail",
  "private": true,
  "workspaces": [
    "packages/*",
    "apps/*"
  ],
  "scripts": {
    "dev:worker": "npm run dev --workspace=apps/worker",
    "dev:launcher": "npm run dev --workspace=apps/launcher",
    "dev:pwa": "npm run dev --workspace=apps/pwa",
    "test:engine": "npm test --workspace=packages/gm-engine"
  }
}
EOF
```

### .gitignore
```bash
cat > .gitignore << 'EOF'
node_modules/
dist/
.wrangler/
.env
.env.local
*.local
.DS_Store
EOF
```

### GM Engine package.json
```bash
cat > packages/gm-engine/package.json << 'EOF'
{
  "name": "loremail-gm-engine",
  "version": "0.1.0",
  "description": "Reusable GM engine for world-building games",
  "main": "index.js",
  "private": true,
  "scripts": {
    "test": "node --test"
  }
}
EOF
```

### Worker package.json
```bash
cat > apps/worker/package.json << 'EOF'
{
  "name": "loremail-worker",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy"
  }
}
EOF
```

### Worker wrangler.toml
```bash
cat > apps/worker/wrangler.toml << 'EOF'
name = "loremail-worker"
main = "src/index.js"
compatibility_date = "2024-01-01"

[[kv_namespaces]]
binding = "KV"
id = "REPLACE_WITH_KV_NAMESPACE_ID"

[vars]
ENVIRONMENT = "production"
EOF
```

### Scaffold Launcher and PWA with Vite
```bash
cd apps/launcher
npm create vite@latest . -- --template vanilla
cd ../pwa
npm create vite@latest . -- --template react
cd ../..
```

When Vite asks about non-empty directory — say yes to overwrite.

### Install All Dependencies
```bash
npm install
```

### Initial Commit
```bash
git add .
git commit -m "scaffold: monorepo structure with engine, worker, launcher, pwa"
git push origin main
```

### Open in IntelliJ / WebStorm
- File → Open
- Left sidebar → WSL → Ubuntu → `/home/aleto44/LoreMail`
- File → Project Settings → Node.js → Add → WSL → Ubuntu → Node 20

---

## Build Order

| Step | What | Notes |
|------|------|-------|
| 1 | Dev environment + monorepo scaffold | Everything above |
| 2 | `world-state.js` — append-only file read/write | Core guarantee |
| 3 | `model-client.js` — Copilot API wrapper | Needed before any GM logic |
| 4 | `prompt-builder.js` — context assembly | Assembles all GM prompts |
| 5 | `canon-manager.js` — summarization + tags | Context window + stability |
| 6 | `fact-extractor.js` — fact extraction pass | Lore stability layer 3 |
| 7 | `consistency.js` — consistency check pass | Lore stability layer 4 |
| 8 | `status-writer.js` — gm-status.json | Operational visibility |
| 9 | `engine.js` — wires all modules together | Public API surface |
| 10 | `gm.js` — Loremail entry point, delivery flow | Game-specific script |
| 11 | Seed generation + finalization triggers in gm.js | Completes three trigger types |
| 12 | GitHub Action workflow YAML | Runs the script |
| 13 | GM prompt tuning — run test games, iterate | Most important creative work |
| 14 | Cloudflare Worker + KV setup | Auth and triggering |
| 15 | Launcher — world seed form + GitHub OAuth | Creates real test games |
| 16 | Launcher — founder character setup | Identity before letters |
| 17 | Launcher — first letter + invite link generation | Produces a real link |
| 18 | PWA shell + auth flow | Players can log in |
| 19 | PWA — first open experience | The gift moment |
| 20 | PWA — world screen (world + characters tabs) | Players can read lore |
| 21 | PWA — letters screen (inbox + read) | Players can read letters |
| 22 | PWA — compose screen | Players can write back |
| 23 | PWA — founder control panel | Founder visibility and control |
| 24 | Chronicle print view | Finalization momento |
| 25 | UI polish | Make it feel like a gift |
| 26 | iPhone PWA testing | Confirm Add to Home Screen works |

---

## Decisions Log

| Question | Decision |
|----------|----------|
| In-world calendar | Real timestamps only |
| Letter routing | Write to anyone; GM infers distance and adjusts delivery time |
| GM dramatic events | Configurable: Gentle / Medium / Dramatic, changeable anytime |
| Game privacy | Always private, letters always private between sender and recipient |
| Player GitHub accounts | Not required; invite token or passphrase auth only |
| Token in invite URL | Rejected; opaque invite token only, real token lives in KV |
| Invite delivery | Founder copies and sends the link themselves |
| Infrastructure | One central Worker (aleto44's Cloudflare); all games share it |
| Founder as player | Yes — founder has a character, set up in launcher before first letter |
| Model selection | Chosen at game creation, changeable anytime via founder control panel |
| AI compute | GitHub Actions only; Worker never touches AI |
| Multiple games | One active game per install for now |
| Public letters | No — always private between sender and recipient |
| GM writing style | Historian — third person, past tense, measured, authoritative |
| Contradiction handling | GM makes it work; builds lore around what players write |
| Private GM notes | Yes — gm-notes.md, read every run, visible to founder only |
| Finalization | Stateless — generates chronicle.md, game continues, repeatable |
| Context window strategy | Summarization layers — deep history compressed, recent history verbatim |
| Lore stability | Append-only + low temperature + fact extraction + locked/developing tags |
| GM architecture | Extracted into reusable `loremail-gm-engine` npm package |
| Dev environment | WSL2 Ubuntu inside Windows; IntelliJ on Windows opens WSL2 path |
| Monorepo | npm workspaces — packages/gm-engine, apps/worker, apps/launcher, apps/pwa |

---

## Estimated Scope

| Phase | Rough effort |
|-------|-------------|
| Dev environment + scaffold | Done |
| GM engine package | 2 weekends |
| GM prompt tuning | 1 weekend (ongoing) |
| Cloudflare Worker | 1 weekend |
| Launcher | 1 weekend |
| PWA core + founder panel | 2–3 weekends |
| Chronicle + print view | 0.5 weekend |
| Polish + iPhone testing | 1 weekend |
| **Total** | **~8–9 weekends** |
