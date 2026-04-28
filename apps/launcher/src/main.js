import './style.css';

const WORKER_URL = import.meta.env.VITE_WORKER_URL ?? 'https://loremail-worker.aleto44.workers.dev';
const GH_CLIENT_ID = import.meta.env.VITE_GH_CLIENT_ID ?? '';

// ── State ──────────────────────────────────────────────
const state = {
  step: 1,
  worldFlavour: '',
  era: '',
  tone: '',
  gmStyle: '',
  githubToken: '',
  githubUser: null,
  founderCharacterName: '',
  founderCharacterBio: '',
  copilotToken: '',
  model: 'gpt-4o',
  gameId: null,
  passphrase: null,
  repoUrl: null,
  inviteLinks: [],
};

// ── Render ─────────────────────────────────────────────
function render() {
  const app = document.getElementById('app');
  app.innerHTML = '';

  const header = document.createElement('div');
  header.innerHTML = `
    <div class="loremail-title">L O R E M A I L</div>
    <div class="loremail-sub">begin a world. write a letter.</div>
  `;
  app.appendChild(header);

  const steps = [step1, step2, step3, step4, step5, step6, step7];
  const stepEl = steps[state.step - 1]?.();
  if (stepEl) app.appendChild(stepEl);

  const dots = document.createElement('div');
  dots.className = 'step-indicator';
  for (let i = 1; i <= 7; i++) {
    const d = document.createElement('div');
    d.className = `step-dot${i === state.step ? ' active' : ''}`;
    dots.appendChild(d);
  }
  app.appendChild(dots);
}

// ── Step 1: World seed ─────────────────────────────────
function step1() {
  const card = createCard('Describe your world', `
    <div class="field">
      <label>What is this world?</label>
      <textarea id="flavour" placeholder="a crumbling empire where magic is contraband..." rows="3">${state.worldFlavour}</textarea>
    </div>
    <div class="field">
      <label>Era</label>
      <div class="chip-group" id="era-chips">
        ${['Ancient', 'Medieval', 'Age of Sail', 'Industrial', 'Other'].map(e =>
          `<div class="chip${state.era === e ? ' selected' : ''}" data-era="${e}">${e}</div>`
        ).join('')}
      </div>
    </div>
    <div class="field">
      <label>Tone</label>
      <div class="chip-group" id="tone-chips">
        ${['Hopeful', 'Melancholic', 'Mysterious', 'Dangerous'].map(t =>
          `<div class="chip${state.tone === t ? ' selected' : ''}" data-tone="${t}">${t}</div>`
        ).join('')}
      </div>
    </div>
    <div class="field">
      <label>The GM</label>
      <div class="chip-group" id="gm-chips">
        ${[['Gentle', 'soft hands'], ['Medium', 'weight and consequence'], ['Dramatic', 'the world bites back']].map(([s, d]) =>
          `<div class="chip${state.gmStyle === s ? ' selected' : ''}" data-gm="${s}">${s} · ${d}</div>`
        ).join('')}
      </div>
    </div>
    <button class="btn-primary" id="step1-next">Continue →</button>
  `);

  card.querySelector('#flavour').addEventListener('input', e => { state.worldFlavour = e.target.value; });

  card.querySelectorAll('[data-era]').forEach(c => c.addEventListener('click', () => {
    state.era = c.dataset.era; render();
  }));
  card.querySelectorAll('[data-tone]').forEach(c => c.addEventListener('click', () => {
    state.tone = c.dataset.tone; render();
  }));
  card.querySelectorAll('[data-gm]').forEach(c => c.addEventListener('click', () => {
    state.gmStyle = c.dataset.gm; render();
  }));

  card.querySelector('#step1-next').addEventListener('click', () => {
    if (!state.worldFlavour || !state.era || !state.tone || !state.gmStyle) {
      showError(card, 'Please complete all fields.'); return;
    }
    state.step = 2; render();
  });

  return card;
}

// ── Step 2: GitHub Auth ────────────────────────────────
function step2() {
  const card = createCard('Connect GitHub', `
    <p style="margin-bottom:16px;color:var(--faded);font-size:14px;">
      Loremail creates a private GitHub repo for your game world. Your GitHub account hosts it.
    </p>
    ${state.githubToken ? `
      <div style="padding:12px;background:var(--paper);border:1px solid var(--border);border-radius:4px;margin-bottom:16px;">
        ✓ Connected as <strong>${state.githubUser?.login ?? 'GitHub user'}</strong>
      </div>
      <button class="btn-primary" id="step2-next">Continue →</button>
    ` : `
      <div class="field">
        <label>Personal Access Token (classic)</label>
        <input type="password" id="gh-token" placeholder="ghp_..." />
        <p class="info-note">Needs repo scope. <a href="https://github.com/settings/tokens/new?scopes=repo&description=Loremail" target="_blank" style="color:var(--accent)">Generate one here</a></p>
      </div>
      <button class="btn-primary" id="verify-token">Verify & Continue →</button>
    `}
  `);

  if (!state.githubToken) {
    card.querySelector('#verify-token').addEventListener('click', async () => {
      const token = card.querySelector('#gh-token').value.trim();
      if (!token) { showError(card, 'Enter a token.'); return; }
      try {
        const res = await fetch('https://api.github.com/user', {
          headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'loremail' },
        });
        if (!res.ok) throw new Error('Invalid token');
        state.githubUser = await res.json();
        state.githubToken = token;
        render();
      } catch {
        showError(card, 'Could not verify token. Check it has repo scope.');
      }
    });
  } else {
    card.querySelector('#step2-next').addEventListener('click', () => { state.step = 3; render(); });
  }

  return card;
}

// ── Step 3: Founder character ──────────────────────────
function step3() {
  const card = createCard('Who are you in this world?', `
    <p style="margin-bottom:16px;color:var(--faded);font-size:14px;">
      Before you can write, we need to know who you are.
    </p>
    <div class="field">
      <label>Your name in this world</label>
      <input type="text" id="char-name" value="${state.founderCharacterName}" placeholder="Maren Voss" />
    </div>
    <div class="field">
      <label>Who are you, in one sentence?</label>
      <textarea id="char-bio" rows="2" placeholder="A disgraced cartographer mapping roads that no longer exist.">${state.founderCharacterBio}</textarea>
    </div>
    <button class="btn-primary" id="step3-next">Continue →</button>
  `);

  card.querySelector('#char-name').addEventListener('input', e => { state.founderCharacterName = e.target.value; });
  card.querySelector('#char-bio').addEventListener('input', e => { state.founderCharacterBio = e.target.value; });
  card.querySelector('#step3-next').addEventListener('click', () => {
    if (!state.founderCharacterName || !state.founderCharacterBio) {
      showError(card, 'Please name your character and describe them.'); return;
    }
    state.step = 4; render();
  });

  return card;
}

// ── Step 4: Copilot token + model ─────────────────────
function step4() {
  const card = createCard('AI Configuration', `
    <div class="field">
      <label>GitHub Copilot API Token</label>
      <input type="password" id="copilot-token" value="${state.copilotToken}" placeholder="ghs_ or ghp_..." />
      <p class="info-note">Used by the GM engine in GitHub Actions. Stored as a repo secret.</p>
    </div>
    <div class="field">
      <label>Model</label>
      <select id="model-select" class="model-select">
        ${['gpt-4o', 'gpt-4o-mini', 'gpt-4.5-preview', 'o3-mini'].map(m =>
          `<option value="${m}"${state.model === m ? ' selected' : ''}>${m}</option>`
        ).join('')}
      </select>
    </div>
    <button class="btn-primary" id="step4-next">Create World →</button>
  `);

  card.querySelector('#copilot-token').addEventListener('input', e => { state.copilotToken = e.target.value; });
  card.querySelector('#model-select').addEventListener('change', e => { state.model = e.target.value; });
  card.querySelector('#step4-next').addEventListener('click', async () => {
    if (!state.copilotToken) { showError(card, 'Copilot token required.'); return; }
    state.step = 5; render();
    await createGame();
  });

  return card;
}

// ── Step 5: Creating… ──────────────────────────────────
function step5() {
  const card = createCard('Creating your world…', `
    <div class="loading">
      <div style="font-size:28px;margin-bottom:12px;">〄</div>
      The repo is being scaffolded. The GM is composing the world seed.<br/>
      <span style="font-size:12px;">This takes a moment.</span>
    </div>
  `);
  return card;
}

// ── Step 6: Passphrase ─────────────────────────────────
function step6() {
  const card = createCard('Your world is ready', `
    <p style="color:var(--faded);font-size:14px;margin-bottom:16px;">
      Share this passphrase with your players so they can restore their session on new devices.
    </p>
    <label>Game passphrase</label>
    <div class="passphrase-display">${state.passphrase}</div>
    <p class="info-note">Write it down. It cannot be recovered.</p>
    <p style="margin-top:16px;font-size:13px;color:var(--faded);">Game: <code>${state.gameId}</code></p>
    <button class="btn-primary" id="step6-next" style="margin-top:20px;">Write your first letter →</button>
  `);

  card.querySelector('#step6-next').addEventListener('click', () => { state.step = 7; render(); });
  return card;
}

// ── Step 7: First letter + invite links ───────────────
function step7() {
  const card = createCard('Invite players', `
    <div class="field">
      <label>Write your first letter to a player</label>
    </div>
    <div class="field">
      <label>Their name in the world</label>
      <input type="text" id="invite-name" placeholder="Callum Reed" />
    </div>
    <div class="field">
      <label>Your letter</label>
      <textarea id="letter-body" rows="6" placeholder="The roads have grown strange since the edict..."></textarea>
    </div>
    <button class="btn-primary" id="gen-invite">Generate Invite Link</button>
    <div id="invite-output"></div>
    <div class="row-btns" style="margin-top:24px;">
      <button class="btn-secondary" id="another-player">Invite Another Player</button>
      <button class="btn-primary" id="open-pwa">Open App →</button>
    </div>
  `);

  card.querySelector('#gen-invite').addEventListener('click', async () => {
    const name = card.querySelector('#invite-name').value.trim();
    const body = card.querySelector('#letter-body').value.trim();
    if (!name || !body) { showError(card, 'Fill in both fields.'); return; }

    try {
      const res = await fetch(`${WORKER_URL}/game/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: state.gameId, passphrase: state.passphrase, inviteeName: name, letterBody: body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const output = card.querySelector('#invite-output');
      const linkBox = document.createElement('div');
      linkBox.className = 'invite-link-box';
      linkBox.innerHTML = `
        <span>${data.inviteLink}</span>
        <button onclick="navigator.clipboard.writeText('${data.inviteLink}')">Copy</button>
      `;
      output.appendChild(linkBox);
      state.inviteLinks.push(data.inviteLink);
    } catch (e) {
      showError(card, e.message);
    }
  });

  card.querySelector('#another-player').addEventListener('click', () => {
    card.querySelector('#invite-name').value = '';
    card.querySelector('#letter-body').value = '';
    card.querySelector('#invite-output').innerHTML = '';
  });

  card.querySelector('#open-pwa').addEventListener('click', () => {
    window.open(`https://loremail.app?game=${state.gameId}`, '_blank');
  });

  return card;
}

// ── Game creation ──────────────────────────────────────
async function createGame() {
  try {
    const res = await fetch(`${WORKER_URL}/game/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        founderGithubToken: state.githubToken,
        copilotToken: state.copilotToken,
        worldFlavour: state.worldFlavour,
        era: state.era,
        tone: state.tone,
        gmStyle: state.gmStyle,
        model: state.model,
        founderCharacterName: state.founderCharacterName,
        founderCharacterBio: state.founderCharacterBio,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Creation failed');
    state.gameId = data.gameId;
    state.passphrase = data.passphrase;
    state.repoUrl = data.repoUrl;
    state.step = 6;
    render();
  } catch (e) {
    state.step = 4;
    render();
    const card = document.querySelector('.step-card');
    if (card) showError(card, `Error: ${e.message}`);
  }
}

// ── Helpers ────────────────────────────────────────────
function createCard(title, html) {
  const card = document.createElement('div');
  card.className = 'step-card';
  card.innerHTML = `
    <div class="step-header">
      <div class="loremail-title">L O R E M A I L</div>
    </div>
    <h2 style="font-family:'IM Fell English',serif;font-size:18px;font-weight:normal;margin-bottom:20px;">${title}</h2>
    ${html}
  `;
  return card;
}

function showError(container, msg) {
  let err = container.querySelector('.error-msg');
  if (!err) {
    err = document.createElement('div');
    err.className = 'error-msg';
    container.appendChild(err);
  }
  err.textContent = msg;
}

// ── Init ───────────────────────────────────────────────
// Handle OAuth callback
const params = new URLSearchParams(window.location.search);
if (params.get('code') && params.get('state') === sessionStorage.getItem('gh_oauth_state')) {
  // Exchange code for token via worker (not implemented in this vanilla flow)
  // Fall through to manual token entry
}

render();
