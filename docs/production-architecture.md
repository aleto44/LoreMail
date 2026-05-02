# LoreMail Production Architecture

This document describes all the moving parts of the production LoreMail system and how they connect.

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                       USERS / PLAYERS                           │
└────────────────┬──────────────────────────────────────┬─────────┘
                 │                                      │
         ┌───────▼────────┐                  ┌─────────▼──────────┐
         │   LAUNCHER     │                  │    PWA (Game)      │
         │  (Create Game) │                  │  (Play Letters)    │
         │                │                  │                    │
         │ GitHub Pages:  │                  │ GitHub Pages:      │
         │/LoreMail/launch│                  │/LoreMail           │
         └────────┬───────┘                  └──────────┬─────────┘
                  │                                     │
                  │ POST /game/create                   │ POST /game/invite
                  │ POST /game/invite                   │ GET /game/info
                  │ etc.                                │ PATCH /game/config
                  │                                     │
                  └──────────────────┬──────────────────┘
                                     │
                         ┌───────────▼──────────────┐
                         │  CLOUDFLARE WORKER       │
                         │ loremail-worker.amix...  │
                         │  (API Router)            │
                         │                          │
                         │ Handles:                 │
                         │ - Game CRUD              │
                         │ - GitHub API calls       │
                         │ - Invite generation      │
                         │ - Player joins           │
                         └───────┬──────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
         ┌──────────▼─────────┐    ┌────────▼──────────┐
         │ CLOUDFLARE KV      │    │   GITHUB API       │
         │ (Game Database)    │    │ (Repo Management)  │
         │                    │    │                    │
         │ Stores:            │    │ Creates per game:  │
         │ - Game configs     │    │ - Git repos        │
         │ - Passphrases      │    │ - Store secrets    │
         │ - Player sessions  │    │ - Dispatch Actions │
         │ - Invite records   │    │ - List models      │
         └────────────────────┘    └────────┬───────────┘
                                            │
                                  ┌─────────▼──────────┐
                                  │  GITHUB REPOS      │
                                  │  (Per Game)        │
                                  │                    │
                                  │ Contains:          │
                                  │ - .github/workflows│
                                  │ - gm-engine files  │
                                  │ - First letter     │
                                  │ - Model token      │
                                  │  (as secret)       │
                                  └─────────┬──────────┘
                                            │
                             ┌──────────────┴───────────────┐
                             │                              │
                    ┌────────▼─────────┐        ┌──────────▼────────┐
                    │ GITHUB ACTIONS   │        │ GITHUB MODELS API  │
                    │ (GM Logic)       │        │ (AI Inference)     │
                    │                  │        │                    │
                    │ Runs on schedule:│        │ Uses model token   │
                    │ - Extract canon  │◄──────►│ from repo secrets  │
                    │ - Check facts    │        │                    │
                    │ - Generate world │        │ Returns prose,     │
                    │   events         │        │ facts for GM       │
                    │ - Commit letter  │        │                    │
                    └──────────────────┘        └────────────────────┘
```

## The 7 Moving Parts

### 1. GitHub Pages — PWA
- **URL**: `https://aleto44.github.io/LoreMail/`
- **What**: React + Vite SPA for playing the game
- **Does**: Players read letters, write replies, view world state, restore sessions
- **Deployment**: Automatic — triggered by `git push` via GitHub Actions
- **Built from**: `apps/pwa/`

### 2. GitHub Pages — Launcher
- **URL**: `https://aleto44.github.io/LoreMail/launch/`
- **What**: Vanilla JS + Vite SPA for creating new games
- **Does**: Collects world description, GitHub tokens, AI model choice, founder character
- **Deployment**: Automatic — triggered by `git push` via GitHub Actions
- **Built from**: `apps/launcher/`

### 3. Cloudflare Worker
- **URL**: `https://loremail-worker.amix.workers.dev`
- **What**: Your backend API — serverless functions on Cloudflare's edge
- **Does**: Routes all API requests (`/game/create`, `/game/invite`, `/game/join`, etc.)
- **Deployment**: Manual — run `wrangler deploy` in `apps/worker/`
- **Endpoints**: See `apps/worker/src/routes/` for all available operations

### 4. Cloudflare KV Namespace
- **What**: Key-value database (like Redis) hosted by Cloudflare
- **Stores**: 
  - Game configurations (world flavour, GM style, model choice)
  - Passphrases and invite link records
  - Player session data
- **Access**: Worker reads/writes during every request
- **Dashboard**: View/edit in [dash.cloudflare.com → Workers & Pages → loremail-worker → Storage → KV Namespaces](https://dash.cloudflare.com)

### 5. GitHub Game Repos
- **Created**: Dynamically when you launch a new game (one per game)
- **Location**: Under your GitHub account as `<gameId>`
- **Contains**:
  - `.github/workflows/gm.yml` — the GM scheduling pipeline
  - `gm-engine/` source files
  - First letter from the founder
  - Model token (stored as a repo secret — never visible to players)
  - World state and chronicle data (committed as JSON)

### 6. GitHub Actions Workflows
- **Location**: Each game repo has its own workflow in `.github/workflows/gm.yml`
- **When**: Runs on a schedule (configurable, default every 3 days)
- **Does**:
  - Runs the GM engine from `packages/gm-engine/`
  - Extracts canon from all letters written
  - Checks consistency and coherence
  - Generates the next world event (using AI model)
  - Commits updated world state back to the repo
- **AI**: Uses the model token (from repo secret) to call GitHub Models API

### 7. GitHub Models API
- **What**: Managed inference endpoint for AI models (gpt-4o, llama, etc.)
- **Auth**: Via fine-grained PAT (stored as repo secret, never sent to players)
- **Called by**: GitHub Actions workflow during the GM run
- **Returns**: Generated prose for the world historian

---

## Data Flow — Creating a Game

1. **Player opens Launcher** → `https://aleto44.github.io/LoreMail/launch/`
2. **Player fills form**: world description, GitHub token, AI token, character info
3. **Launcher sends** `POST /game/create` to Cloudflare Worker
4. **Worker**:
   - Creates a new GitHub repo (named after the game ID)
   - Generates a random passphrase
   - Stores config + passphrase in **KV**
   - Commits the model token to the repo as a GitHub secret
   - Commits the first world seed to the repo
5. **Worker dispatches** the GitHub Actions workflow (first run right away)
6. **GitHub Actions**:
   - Runs the GM engine
   - Generates the world introduction
   - Commits world state to the repo
7. **Worker returns** to Launcher with game ID + passphrase
8. **Founder** shares passphrase with players
9. **Workers** opens PWA to send first letter via `POST /game/invite`
10. **Players** use PWA to join with passphrase and play

---

## Data Flow — Playing the Game

1. **Player opens PWA** → `https://aleto44.github.io/LoreMail/`
2. **Player joins** using passphrase → PWA calls `POST /game/join` to Worker
3. **Worker** stores player session in **KV**
4. **Player reads letters** → Worker fetches from game repo
5. **Player writes a letter** → PWA sends to Worker
6. **Worker**:
   - Commits letter to game repo
   - Updates player session in **KV**
   - Dispatches the GitHub Actions workflow if needed (cooldown check)
7. **GitHub Actions** runs on schedule:
   - Reads all player letters from repo
   - Runs GM engine
   - Generates next world event
   - Commits back to repo
8. **Player refreshes PWA** → Fetches latest world state from repo

---

## Key Secrets

These must never be committed to the `LoreMail` repo:

- **GitHub Personal Access Token** (founder's repo token) — shared with players only via KV
- **GitHub Models Token** (AI inference) — stored in game repo as secret, not the main repo
- Cloudflare API credentials — managed by `wrangler login`

The `.env.localdev` and `dev-config.js` files in `apps/launcher/` contain these during local dev but are gitignored.

---

## Deployment Checklist

- [x] **Cloudflare setup**: KV namespace created, subdomain registered (`amix`)
- [x] **Worker deployed**: `wrangler deploy` run successfully
- [x] **GitHub Actions workflow**: `.github/workflows/deploy-pages.yml` in place
- [x] **GitHub Pages enabled**: Repo settings → Pages → source set to `gh-pages` branch
- [ ] **Repo visibility**: Public (required for free GitHub Pages) or GitHub Pro subscription
- [ ] **Custom domain** (optional): Add CNAME file + DNS record if using custom domain

---

## Monitoring & Maintenance

### Check Worker Status
```bash
wrangler tail
```
Shows real-time logs from the deployed worker.

### View KV Data
Go to [Cloudflare Dashboard → Workers & Pages → loremail-worker → Storage → KV Namespaces](https://dash.cloudflare.com) to browse/edit game data.

### Redeploy After Code Changes

**For Launcher/PWA:**
```bash
git commit -m "your message"
git push origin main
# GitHub Actions runs automatically, deployed to gh-pages in ~2 min
```

**For Worker:**
```bash
cd apps/worker
wrangler deploy --env=""
```

---

## Common Tasks

### Generate a Fresh Test Game
1. Open Launcher at `https://aleto44.github.io/LoreMail/launch/`
2. Fill in a test world and character
3. Enter your GitHub token (can be your founder token or a test token)
4. Enter your model token (fine-grained PAT with Models: Read)
5. Click "Create World" and follow the flow
6. Game repo created automatically under your GitHub account

### Clear All KV Data (Reset Database)
Go to Cloudflare Dashboard → Workers → loremail-worker → Storage → KV Namespaces → [your namespace] → browse all keys and delete them individually. (Or contact Cloudflare to delete the entire namespace and create a new one.)

### Change GitHub Pages Base Path (e.g., Add Custom Domain)
1. Update `base: '/'` in `apps/pwa/vite.config.js` and `apps/launcher/vite.config.js` (instead of `/LoreMail/`, `/LoreMail/launch/`)
2. Create `CNAME` file at repo root with your domain name
3. Update `PWA_URL` in `apps/launcher/.env.production` and `wrangler.toml`
4. Update your domain registrar's DNS to point to `aleto44.github.io`
5. Push and redeploy

---

## Troubleshooting

**"Worker failed with 10000 error"**
- Cloudflare API auth expired → run `wrangler login` again

**"GitHub Pages not showing"**
- Repo must be public (unless you have GitHub Pro)
- Check repo Settings → Pages → Source is set to `gh-pages` branch

**"Build failed: Could not resolve './dev-config.js'"**
- Normal in CI — the stub is used in production builds
- Locally, make sure you have `apps/launcher/src/dev-config.js` for `vite` (not committed)

**"Launcher doesn't see my model token"**
- Make sure your PAT has `Account permissions → Models: Read`
- Try refreshing the page

---

## Architecture Decisions

**Why Cloudflare Worker + KV instead of a traditional server?**
- Serverless = no server to manage
- KV is cheap (~$0.50/GB/month) and fast (edge-cached)
- Global deployment = low latency
- Only pay for what you use

**Why GitHub for game repos instead of storing everything in KV?**
- Git history = audit trail of world changes
- Players can browse the history if they want to
- Actions workflows are native to GitHub
- Easier to version and backup

**Why GitHub Models API instead of rolling my own AI integration?**
- GitHub's managed endpoint = no key management overhead
- Supports multiple models (gpt-4o, llama, etc.)
- Token stored as repo secret = secure

**Why GitHub Pages instead of a CDN?**
- Free hosting for open-source (or public repos)
- Static sites = fast and simple
- No server-side logic needed (all API calls go to Worker)
- Works perfectly for SPAs with state-based navigation

---

## Next Steps

1. **Make repo public** (if not already) for GitHub Pages
2. **Test creating a game** via the Launcher
3. **Invite some players** and test the PWA
4. **(Optional) Add a custom domain** following the checklist above
5. **Monitor logs** with `wrangler tail` if you see issues

