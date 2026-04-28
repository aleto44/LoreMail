# loremail-gm-engine

Reusable GM engine for world-building games. Powers the AI-driven world state in [Loremail](https://loremail.app).

## Overview

The engine manages all world state, context window strategy, and lore stability logic. It is designed to be reusable in future world-building games with different mechanics.

## Public API

```javascript
import { GMEngine } from 'loremail-gm-engine';

const engine = new GMEngine({
  repoPath: process.cwd(),
  model: 'gpt-4o',
  apiToken: process.env.COPILOT_TOKEN,
  engineConfig: engineJson,
});

await engine.generateWorldSeed(seedContext);
await engine.processDelivery(letterContext);
await engine.generateChronicle(chronicleContext);
await engine.runConsistencyCheck(proposedAddition);
await engine.extractFacts(newCanonText);
await engine.summarizeIfNeeded();
```

## Modules

| Module | Responsibility |
|--------|----------------|
| `engine.js` | Public API, wires all modules |
| `world-state.js` | File I/O, append-only canon enforcement |
| `canon-manager.js` | Two-layer canon (DEEP/RECENT), compression |
| `fact-extractor.js` | Extracts flat facts from new canon entries |
| `consistency.js` | Checks new additions against established facts |
| `prompt-builder.js` | Assembles GM prompts in consistent order |
| `model-client.js` | OpenAI-compatible API wrapper with retries |
| `status-writer.js` | Writes `.gm-status.json` after each run |

## Lore Stability Layers

1. **Append-only architecture** — enforced in code, not just prompts
2. **Low temperature** — 0.4 for GM runs, 0.2 for compression
3. **Locked / Developing tags** — LOCKED entries are never contradicted
4. **Fact extraction** — concrete facts fed as hard constraints to every run

## Context Window Strategy

Canon is split into two layers in `canon.md`:
- **DEEP HISTORY** (~800 words): compressed summaries of older events
- **RECENT HISTORY** (~4000 words max): verbatim recent entries

When RECENT HISTORY exceeds the word limit, the oldest 50% is compressed into DEEP HISTORY.
