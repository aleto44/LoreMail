# LoreMail — Local Testing Guide
---
## Opening the Ubuntu Terminal (WSL)
In Windows, press **Win** and search **Ubuntu** — open it. That's your WSL terminal. Everything below runs there. Your project is at `~/LoreMail`.
---
## What You Can Test
| Component | How | URL |
|-----------|-----|-----|
| **Worker** (API) | `wrangler dev --local` | `http://localhost:8787` |
| **PWA** (player app) | `npm run dev:pwa:local` | `http://localhost:5173` |
| **Launcher** | `npm run dev:launcher:local` | `http://localhost:5174` |
| **GM Engine** | run `gm.js` directly with Node | terminal output |
---
## Test 1 — Run the Worker locally
Open an Ubuntu terminal:
```bash
cd ~/LoreMail/apps/worker
npx wrangler dev --local
```
You'll see:
```
Ready on http://localhost:8787
```
Now in a **second Ubuntu terminal tab** (or window), test an endpoint with curl:
```bash
# Should return a 400 error (missing body) — proves the route responds
curl -s -X POST http://localhost:8787/game/create \
  -H "Content-Type: application/json" \
  -d '{}' | python3 -m json.tool
```
Try any route — `POST /game/invite`, `GET /game/player`, etc. They will return proper JSON errors if inputs are missing.
> **Note:** KV is automatically simulated locally. Writes and reads during the session are real (stored in a local SQLite file under `.wrangler/`). They reset when you stop and restart.
---
## Test 2 — Run the PWA
```bash
cd ~/LoreMail
npm run dev:pwa:local
```
Then open **http://localhost:5173** in your browser (Edge or Chrome on Windows — it connects to WSL ports automatically).
The `:local` flag loads `apps/pwa/.env.localdev`, which points `VITE_WORKER_URL` at `http://localhost:8787` instead of the production Cloudflare worker.
---
## Test 3 — Run the Launcher
```bash
cd ~/LoreMail
npm run dev:launcher:local
```
Open **http://localhost:5174**.
The `:local` flag loads `apps/launcher/.env.localdev`, which points `VITE_WORKER_URL` at `http://localhost:8787`.
---
## Test 4 — Full end-to-end (needs real tokens)
For a real game to be created you need two things:
### 1. A GitHub Fine-Grained PAT
Go to: **GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**
Permissions needed:
- **Repository access:** All repositories (or just the ones you want to use)
- **Contents:** Read and write
- **Actions:** Write
- **Secrets:** Write (needed to store the Copilot token in the game repo)
### 2. A Copilot API Token
This is the same GitHub token — the Copilot API uses GitHub auth. Use the same PAT.
Once you have those, with the worker running locally, send a real `POST /game/create` from the Launcher pointing at `http://localhost:8787` — it will create an actual private GitHub repo for your game.
---
## Running Multiple Things at Once
Each of these needs its own terminal tab. Open multiple Ubuntu tabs with **Ctrl+Shift+T** (Windows Terminal) or open multiple Ubuntu windows:
| Tab | Command |
|-----|---------|
| Tab 1 — Worker | `cd ~/LoreMail/apps/worker && npx wrangler dev --local` |
| Tab 2 — PWA | `cd ~/LoreMail && npm run dev:pwa:local` |
| Tab 3 — Launcher | `cd ~/LoreMail && npm run dev:launcher:local` |
---
## Pointing the UI at the Local Worker
Each app has a `.env.localdev` file that is loaded when you use the `:local` script variants:

| File | Contents |
|------|----------|
| `apps/pwa/.env.localdev` | `VITE_WORKER_URL=http://localhost:8787` |
| `apps/launcher/.env.localdev` | `VITE_WORKER_URL=http://localhost:8787` |

These are loaded via Vite's `--mode localdev` flag (used internally by the `:local` scripts). In code, the URL is referenced as `import.meta.env.VITE_WORKER_URL`. Without the `:local` flag the apps fall back to the production Cloudflare worker URL.

> **Note:** `local` cannot be used as a Vite mode name — it conflicts with Vite's `.env.*.local` file convention. The mode is named `localdev` instead.

These files are gitignored automatically.
---
## Available npm Scripts
| Script | What it does |
|--------|--------------|
| `npm run dev:pwa` | PWA dev server → production worker |
| `npm run dev:pwa:local` | PWA dev server → `http://localhost:8787` |
| `npm run dev:launcher` | Launcher dev server → production worker |
| `npm run dev:launcher:local` | Launcher dev server → `http://localhost:8787` |
| `npm run dev:worker` | Cloudflare Worker via wrangler |
| `npm run test:engine` | Run GM engine tests |
---
## Quick Sanity Check (run this first)
Run this from your Ubuntu terminal to confirm the whole stack responds:
```bash
cd ~/LoreMail/apps/worker
npx wrangler dev --local &
sleep 4
curl -s http://localhost:8787/game/player?gameId=test | python3 -m json.tool
```
If you get a JSON response (even an error like `{ "error": "..." }`), the worker is running correctly.
To stop the background worker after the test:
```bash
kill %1
```
---
## Testing the GM Engine Directly (no GitHub Actions needed)
You can run the GM engine against a local fake game repo to test it without GitHub:
```bash
# 1. Create a temporary test game directory
mkdir -p /tmp/test-game/{world,players/alice,letters/pending,letters/delivered,config}
# 2. Create minimal game files
echo '{"name":"Test World","flavour":"a test setting","era":"medieval","tone":"mysterious","gm_style":"medium","gm_paused":false,"model":"gpt-4o","founder_id":"alice","players":[{"id":"alice","character":"Test Alice","joined":true,"is_founder":true}],"default_travel_hours":1}' \
  > /tmp/test-game/config/game.json
echo '{"canon_recent_word_limit":4000,"canon_deep_summary_target":800,"temperature":0.4,"consistency_check":false,"fact_extraction":false,"locked_tag":"[LOCKED]","developing_tag":"[DEVELOPING]"}' \
  > /tmp/test-game/config/engine.json
printf "## DEEP HISTORY\n\n## RECENT HISTORY\n" > /tmp/test-game/world/canon.md
echo "" > /tmp/test-game/world/events.md
echo "" > /tmp/test-game/world/gm-notes.md
echo "Test Alice is a wandering scholar." > /tmp/test-game/world/seed.md
echo "Test Alice" > /tmp/test-game/players/alice/character.md
echo "Unknown location" > /tmp/test-game/players/alice/location.md
# 3. Create a test letter (deliver_at is in the past so it triggers immediately)
cat > /tmp/test-game/letters/pending/1714000001_alice_alice_test.md << 'EOF'
---
from: alice
to: alice
sent_at: 1714000000
deliver_at: 1714000001
delivered: false
---
This is a test letter to myself.
EOF
# 4. Run gm.js against the test directory
cd /tmp/test-game
COPILOT_TOKEN=your_token_here GITHUB_TOKEN=fake TRIGGER=letter_delivery \
  node ~/LoreMail/packages/gm-engine/templates/gm.js
```
> Replace `your_token_here` with your real GitHub PAT to make actual AI calls.
---
## Troubleshooting
| Problem | Fix |
|---------|-----|
| `wrangler: command not found` | Run `npx wrangler dev --local` instead, or `npm install -g wrangler` |
| Port 5173 or 5174 already in use | The ports are fixed with `strictPort: true` — kill the process using that port or stop the other app first |
| Worker returns HTML instead of JSON | Make sure you are sending `Content-Type: application/json` in your curl request |
| `node_modules` missing | Run `npm install` from `~/LoreMail` |
| Changes not showing in browser | Hard refresh with **Ctrl+Shift+R** — the PWA service worker can cache aggressively |
| WSL port not reachable from Windows browser | WSL2 ports are forwarded automatically on Windows 11. On Windows 10 you may need to use the WSL IP: run `hostname -I` in Ubuntu to find it |