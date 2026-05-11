# LoreMail

An AI-powered epistolary RPG. Players write letters to each other as characters in a shared fictional world. An AI Game Master runs quietly in the background — generating world events, maintaining a living chronicle, and keeping the lore consistent — while players drive the story through their correspondence.

```
Players write letters ──► GM reads them ──► GM generates world events ──► Players read the world
```

---

## How It Works

### For Players

1. **Receive an invite link** from the game founder (opens the PWA)
2. **Choose your character name** and join the game
3. **Read your letters** — delivered from other players and the world historian
4. **Write back** — your letters are committed to the game's private GitHub repo and trigger a GM run
5. **Watch the world evolve** — the GM reads all letters and generates the next world event on a schedule

### For Founders (Game Masters)

1. **Open the [Launcher](https://aleto44.github.io/LoreMail/launch/)** and describe your world
2. **Connect GitHub** — provide a repo token (shared with players for letter commits) and a model token (AI inference, stored securely as a GitHub Actions secret — never sent to players)
3. **Choose a character** for yourself in the world
4. **Name your game** and set a passphrase — share the passphrase with players so they can restore sessions on new devices
5. **Write your first letter** to each player to generate their invite link
6. **Play** — join the PWA with the same game ID; founders also get a Control Panel to adjust GM settings, change the AI model, and trigger manual GM runs

---

## Architecture

LoreMail is a monorepo with three apps and one shared package:

```
LoreMail/
├── apps/
│   ├── launcher/     # Vanilla JS + Vite — game creation wizard
│   ├── pwa/          # React + Vite — the player-facing game client (PWA)
│   └── worker/       # Cloudflare Worker — API backend
└── packages/
    └── gm-engine/    # Shared GM logic (world state, canon, AI calls)
```

### The 7 Moving Parts

| Part | What it does |
|------|-------------|
| **PWA** (GitHub Pages) | Players read letters, write replies, view world state |
| **Launcher** (GitHub Pages) | Founders create a new game world |
| **Cloudflare Worker** | API router — handles all game CRUD, invite generation, player joins |
| **Cloudflare KV** | Key-value database — game configs, passphrases, player sessions |
| **GitHub Repos** (one per game) | Stores letters, world state JSON, GM engine files, and the Actions workflow |
| **GitHub Actions** | Runs the GM engine on a schedule; reads all letters and generates the next world event |
| **GitHub Models API** | AI inference (gpt-4o, llama, etc.) used by the GM; token stored as a repo secret |

See [`docs/production-architecture.md`](docs/production-architecture.md) for a full system diagram and data-flow walkthrough.

---

## Getting Started (Self-Hosting)

### Prerequisites

- **Node.js** 20+
- **Wrangler CLI** (`npm install -g wrangler`) and a Cloudflare account
- A **GitHub account** — for Pages hosting and per-game repos
- A GitHub **Personal Access Token** with `repo` + `workflow` scopes (classic PAT is easiest)
- A separate GitHub **fine-grained PAT** with `Account permissions → Models: Read` for AI inference

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Cloudflare KV

```bash
# Create the production namespace
wrangler kv namespace create LOREMAIL

# Create the preview / dev namespace
wrangler kv namespace create LOREMAIL --preview
```

Paste the printed IDs into `apps/worker/wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "KV"
id = "YOUR_PRODUCTION_ID"
preview_id = "YOUR_PREVIEW_ID"
```

### 3. Deploy the Worker

```bash
cd apps/worker
wrangler deploy
```

After deploying, set these environment variables in the Cloudflare dashboard (Worker → Settings → Variables):

| Variable | Value |
|----------|-------|
| `ENVIRONMENT` | `production` |
| `PWA_URL` | Your PWA's public URL (e.g. `https://yourusername.github.io/LoreMail`) |

### 4. Configure and Deploy the PWA & Launcher

Set the worker URL before building. Create `.env.production` files:

**`apps/pwa/.env.production`**
```
VITE_WORKER_URL=https://your-worker.workers.dev
```

**`apps/launcher/.env.production`**
```
VITE_WORKER_URL=https://your-worker.workers.dev
VITE_PWA_URL=https://yourusername.github.io/LoreMail
```

Update the `base` paths in `apps/pwa/vite.config.js` and `apps/launcher/vite.config.js` to match your GitHub Pages URL structure, then push to `main` — the included GitHub Actions workflow builds and deploys both apps to the `gh-pages` branch automatically.

In your repo's Settings → Pages, set the source to the `gh-pages` branch.

> **Note:** The repo must be public for free GitHub Pages hosting (or requires a GitHub Pro subscription).

See [`docs/ProductionTodo.md`](docs/ProductionTodo.md) for a complete deployment checklist.

---

## Local Development

Each app has its own dev server. Run them in separate terminals:

```bash
# Cloudflare Worker (runs on localhost with Miniflare)
npm run dev:worker

# PWA (React + Vite)
npm run dev:pwa

# Launcher (Vanilla JS + Vite)
npm run dev:launcher
```

For the Launcher, copy the dev config stub and fill in your tokens:

```bash
cp apps/launcher/src/dev-config.stub.js apps/launcher/src/dev-config.js
# Edit dev-config.js with your real tokens — this file is gitignored
```

Use the `:local` variants to point the apps at your local worker instead of the production URL:

```bash
npm run dev:pwa:local
npm run dev:launcher:local
```

---

## GM Engine

The `packages/gm-engine` package contains all the AI Game Master logic. It is embedded into the Cloudflare Worker and also deployed to each game's GitHub repo so the Actions workflow can run it.

After editing anything in `packages/gm-engine/src/`, regenerate the embedded engine files before deploying the worker:

```bash
node scripts/generate-engine-files.mjs
```

Then commit the result and redeploy:

```bash
cd apps/worker && wrangler deploy
```

### Lore Stability

The GM engine is built around an append-only canon — world facts are never revised or deleted. It uses:

- **Two-layer canon** (DEEP HISTORY compressed summaries + verbatim RECENT HISTORY)
- **Low temperature** (0.4 for narrative runs, 0.2 for compression)
- **Fact extraction** — concrete facts fed as hard constraints into every prompt
- **Consistency checks** — new additions are checked against established canon before being committed

See [`packages/gm-engine/README.md`](packages/gm-engine/README.md) for the full API and module breakdown.

---

## Choosing an AI Model

The Launcher includes a built-in model guide. Short version:

| Model | Best for |
|-------|----------|
| `openai/gpt-4.1-mini` | Development and testing — cheap and fast |
| `openai/gpt-4.1` | Real games — best instruction following |
| `openai/gpt-5` | Best prose quality |
| `openai/gpt-4o` | Proven and reliable |
| `meta/llama-3.3-70b-instruct` | Open-weight alternative |

**Avoid:** reasoning models (o1, o3, o4-mini), coding models (Codestral), small models (phi-4-mini, llama-3.1-8b), and embedding models.

Model cost estimates per game per month (2–8 players, one letter per person every 3 days):

| Model | 2 players | 4 players | 8 players |
|-------|-----------|-----------|-----------|
| gpt-4.1-mini | ~$0.04 | ~$0.09 | ~$0.17 |
| gpt-4.1 | ~$0.22 | ~$0.43 | ~$0.86 |
| gpt-4o | ~$0.27 | ~$0.54 | ~$1.08 |
| gpt-5 | ~$1.00 | ~$2.00 | ~$4.00 |

---

## Monitoring

```bash
# Live Worker logs
wrangler tail

# Run GM engine tests
npm run test:engine
```

---

## Key Security Notes

- The **repo token** (GitHub PAT with `repo` + `workflow`) is shared with players and stored on their devices — keep its permissions narrow and **do not give it model access**.
- The **model token** (GitHub fine-grained PAT with `Models: Read`) is stored only as a GitHub Actions secret in the per-game repo — it never reaches a player's device.
- Never commit `apps/launcher/src/dev-config.js` or any `.env.local` files — they are gitignored for this reason.

---

## Project Scripts

```bash
npm run dev:worker           # Start the Cloudflare Worker locally
npm run dev:pwa              # Start the PWA dev server
npm run dev:launcher         # Start the Launcher dev server
npm run dev:pwa:local        # PWA pointed at local worker
npm run dev:launcher:local   # Launcher pointed at local worker
npm run test:engine          # Run GM engine tests
npm run generate:engine-files  # Rebuild the embedded engine after changes
```
