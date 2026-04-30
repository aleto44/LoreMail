import './style.css';
const WORKER_URL = import.meta.env.VITE_WORKER_URL ?? 'https://loremail-worker.aleto44.workers.dev';
const PWA_URL = (import.meta.env.VITE_PWA_URL ?? 'https://loremail.app').replace(/\/$/, '');
// ── State ──────────────────────────────────────────────
const state = {
  step: 1,
  worldFlavour: '',
  era: '',
  tone: '',
  gmStyle: '',
  githubToken: '',    // repo token — shared with players, stored in KV
  modelToken: '',     // AI token — never leaves the server (stored as Actions secret only)
  githubUser: null,
  founderCharacterName: '',
  founderCharacterBio: '',
  founderCharacterLocation: '',
  model: 'gpt-4o',
  availableModels: [],
  modelsVerified: false,
  gameId: null,
  passphrase: null,
  repoUrl: null,
  inviteLinks: [],
};
// Steps that allow going back
const BACK_ALLOWED = [2, 3, 4];
// Steps that allow going forward manually (have their own next btn logic elsewhere)
const TOTAL_STEPS = 7;
// ── Render ─────────────────────────────────────────────
function render() {
  const app = document.getElementById('app');
  app.innerHTML = '';
  const steps = [step1, step2, step3, step4, step5, step6, step7];
  const stepEl = steps[state.step - 1]?.();
  if (stepEl) app.appendChild(stepEl);
  const dots = document.createElement('div');
  dots.className = 'step-indicator';
  for (let i = 1; i <= TOTAL_STEPS; i++) {
    const d = document.createElement('div');
    d.className = `step-dot${i === state.step ? ' active' : ''}`;
    dots.appendChild(d);
  }
  app.appendChild(dots);
}
// ── Navigation helpers ─────────────────────────────────
function addNavRow(card, { backStep, onBack, hideBack = false } = {}) {
  if (hideBack) return;
  const nav = document.createElement('div');
  nav.className = 'nav-back-row';
  const btn = document.createElement('button');
  btn.className = 'btn-ghost-back';
  btn.textContent = '← Back';
  btn.addEventListener('click', () => {
    if (onBack) { onBack(); return; }
    if (backStep != null) { state.step = backStep; render(); }
  });
  nav.appendChild(btn);
  card.insertBefore(nav, card.firstChild);
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
          `<div class="chip${state.gmStyle === s ? ' selected' : ''}" data-gm="${s}">${s} — ${d}</div>`
        ).join('')}
      </div>
    </div>
    <button class="btn-primary" id="step1-next">Continue →</button>
  `);
  card.querySelector('#flavour').addEventListener('input', e => { state.worldFlavour = e.target.value; });
  card.querySelectorAll('[data-era]').forEach(c => c.addEventListener('click', () => { state.era = c.dataset.era; render(); }));
  card.querySelectorAll('[data-tone]').forEach(c => c.addEventListener('click', () => { state.tone = c.dataset.tone; render(); }));
  card.querySelectorAll('[data-gm]').forEach(c => c.addEventListener('click', () => { state.gmStyle = c.dataset.gm; render(); }));
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
      Loremail creates a private GitHub repo for your game world. This token is shared with players
      so they can commit letters — keep its permissions narrow.
    </p>
    ${state.githubToken ? `
      <div class="verified-badge">
        ✓ Connected as <strong>${state.githubUser?.login ?? 'GitHub user'}</strong>
      </div>
      <div id="scope-results" style="margin-bottom:16px;"></div>
      <button class="btn-secondary" id="switch-token" style="margin-bottom:16px;">Use a different token</button>
      <button class="btn-primary" id="step2-next">Continue →</button>
    ` : `
      <div class="field">
        <label>Repo token (classic or fine-grained PAT)</label>
        <input type="password" id="gh-token" placeholder="github_pat_..." />
        <details class="info-note" style="margin-top:6px;">
          <summary style="cursor:pointer;font-weight:600;">Which token type do I need? ▾</summary>
          <div style="margin-top:8px;line-height:1.7;">
            <strong>Option A — Classic PAT (easiest)</strong><br/>
            Go to <a href="https://github.com/settings/tokens/new" target="_blank" style="color:var(--accent)">Settings → Developer settings → Personal access tokens → Tokens (classic)</a>
            and tick <code>repo</code> and <code>workflow</code>. Classic PATs can create new repos without any extra configuration.<br/><br/>
            <strong>Option B — Fine-grained PAT</strong><br/>
            Go to <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" style="color:var(--accent)">Settings → Developer settings → Fine-grained tokens</a>.<br/>
            ⚠ <strong>Repository access must be set to "All repositories"</strong> — you cannot pre-select a repo that doesn't exist yet.<br/>
            Required permissions:<br/>
            &nbsp;• <strong>Administration: Read &amp; Write</strong> — needed to <em>create</em> the game repo<br/>
            &nbsp;• <strong>Contents: Read &amp; Write</strong> — to commit letters<br/>
            &nbsp;• <strong>Actions: Read &amp; Write</strong> — to trigger the GM workflow
          </div>
        </details>
        <p class="info-note" style="margin-top:6px;color:#c07000;">
          ⚠ This token will be stored on every player's device. Do <strong>not</strong> give it model access.
        </p>
      </div>
      <div id="scope-results" style="margin-bottom:8px;"></div>
      <button class="btn-primary" id="verify-token">Verify & Continue →</button>
    `}
  `);
  addNavRow(card, { backStep: 1 });

  function renderScopeResults(checks) {
    const el = card.querySelector('#scope-results');
    if (!el) return;
    el.innerHTML = checks.map(({ label, status, detail }) => {
      const icon = status === 'pass' ? '✅' : status === 'warn' ? '⚠️' : '❌';
      const color = status === 'pass' ? 'green' : status === 'warn' ? '#c07000' : '#c0392b';
      return `<div style="font-size:12px;margin-bottom:4px;color:${color};">
        ${icon} <strong>${label}</strong>${detail ? ` — ${detail}` : ''}
      </div>`;
    }).join('');
  }

  if (!state.githubToken) {
    card.querySelector('#verify-token').addEventListener('click', async () => {
      const token = card.querySelector('#gh-token').value.trim();
      if (!token) { showError(card, 'Enter a token.'); return; }
      const btn = card.querySelector('#verify-token');
      btn.disabled = true; btn.textContent = 'Verifying…';
      const checks = [];
      try {
        // 1. Validate token identity
        const userRes = await fetch('https://api.github.com/user', {
          headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'loremail' },
        });
        if (!userRes.ok) throw new Error(`GitHub rejected the token (HTTP ${userRes.status})`);
        const user = await userRes.json();
        checks.push({ label: 'Token is valid', status: 'pass', detail: `authenticated as @${user.login}` });

        // 2. Scope checks
        const rawScopes = userRes.headers.get('x-oauth-scopes') ?? '';
        const isFinegrained = rawScopes === '';
        if (isFinegrained) {
          checks.push({ label: 'Token type', status: 'pass', detail: 'fine-grained PAT detected' });

          // Live probe: can it list repos at all?
          const reposRes = await fetch('https://api.github.com/user/repos?per_page=1', {
            headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'loremail' },
          });
          if (reposRes.ok) {
            checks.push({ label: 'Repository access', status: 'pass', detail: 'token can access the repos API' });
          } else {
            checks.push({ label: 'Repository access', status: 'fail', detail: `HTTP ${reposRes.status} — token cannot access repos. Add Contents: Read & Write + Actions: Write permissions.` });
          }
          checks.push({
            label: '"All repositories" access required',
            status: 'warn',
            detail: 'fine-grained PATs must be set to "All repositories" — the game repo does not exist yet so it cannot be pre-selected',
          });
          checks.push({
            label: 'Administration: Write required',
            status: 'warn',
            detail: 'needed to create the new game repo — make sure this is ticked alongside Contents & Actions',
          });
          checks.push({
            label: 'Contents & Actions write',
            status: 'warn',
            detail: 'cannot verify Contents: Write or Actions: Write until the game repo is created — make sure you granted them',
          });
        } else {
          const scopes = rawScopes.split(',').map(s => s.trim());
          checks.push({ label: 'Token type', status: 'pass', detail: `classic PAT — scopes: ${scopes.join(', ')}` });

          const hasRepo = scopes.includes('repo') || scopes.includes('public_repo');
          const hasWorkflow = scopes.includes('workflow');
          checks.push({
            label: 'repo scope (Contents + API access)',
            status: hasRepo ? 'pass' : 'fail',
            detail: hasRepo ? 'present' : 'MISSING — token cannot create or write to repos',
          });
          checks.push({
            label: 'workflow scope (Actions dispatch)',
            status: hasWorkflow ? 'pass' : 'fail',
            detail: hasWorkflow ? 'present' : 'MISSING — token cannot trigger the GM workflow',
          });

          if (!hasRepo || !hasWorkflow) {
            renderScopeResults(checks);
            showError(card, 'Token is missing required scopes. See the checks above.');
            btn.disabled = false; btn.textContent = 'Verify & Continue →';
            return;
          }
        }

        renderScopeResults(checks);
        state.githubUser = user;
        state.githubToken = token;
        state.modelToken = '';
        state.availableModels = [];
        state.modelsVerified = false;
        render();
      } catch (e) {
        checks.push({ label: 'Token is valid', status: 'fail', detail: e.message });
        renderScopeResults(checks);
        showError(card, e.message);
        btn.disabled = false; btn.textContent = 'Verify & Continue →';
      }
    });
  } else {
    // Already verified — re-render scope results summary from stored info
    renderScopeResults([{ label: 'Token verified', status: 'pass', detail: `@${state.githubUser?.login}` }]);
    card.querySelector('#switch-token')?.addEventListener('click', () => {
      state.githubToken = '';
      state.githubUser = null;
      state.modelToken = '';
      state.availableModels = [];
      state.modelsVerified = false;
      render();
    });
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
    <div class="field">
      <label>Where are you in the world right now?</label>
      <textarea id="char-location" rows="2" placeholder="Somewhere on the road between two cities I'd rather not name.">${state.founderCharacterLocation}</textarea>
    </div>
    <button class="btn-primary" id="step3-next">Continue →</button>
  `);
  addNavRow(card, { backStep: 2 });
  card.querySelector('#char-name').addEventListener('input', e => { state.founderCharacterName = e.target.value; });
  card.querySelector('#char-bio').addEventListener('input', e => { state.founderCharacterBio = e.target.value; });
  card.querySelector('#char-location').addEventListener('input', e => { state.founderCharacterLocation = e.target.value; });
  card.querySelector('#step3-next').addEventListener('click', () => {
    if (!state.founderCharacterName || !state.founderCharacterBio || !state.founderCharacterLocation) {
      showError(card, 'Please fill in all three fields.'); return;
    }
    state.step = 4; render();
  });
  return card;
}
// ── Step 4: AI model selection ─────────────────────────
function step4() {
  const verified = state.modelsVerified && state.availableModels.length > 0;
  const selectHtml = verified
    ? state.availableModels.map(m =>
        `<option value="${m}"${state.model === m ? ' selected' : ''}>${m}</option>`
      ).join('')
    : `<option value="" disabled selected>— verify your token first —</option>`;

  const card = createCard('AI Configuration', `
    <p style="color:var(--faded);font-size:13px;margin-bottom:16px;">
      This token is used <strong>only</strong> by your world's GM running inside GitHub Actions.
      It is <strong>never</strong> sent to player devices — only stored as a GitHub Actions secret.
    </p>
    <div class="field">
      <label>Model token (fine-grained PAT)</label>
      <input type="password" id="model-token-input" placeholder="github_pat_…" value="${state.modelToken}" autocomplete="off" />
      <p class="info-note">
        Needs <strong>Account permissions → Models: Read</strong> only.
        <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" style="color:var(--accent)">Generate one here</a>
      </p>
      <p class="info-note" style="margin-top:6px;color:green;">
        ✓ Safe to give full model access — this token never touches a player's device.
      </p>
    </div>
    <div class="field">
      <button class="btn-secondary" id="verify-models" style="width:100%;">
        ${verified ? '↻ Re-check available models' : '🔍 Verify & load available models'}
      </button>
      <div id="models-status" class="info-note" style="margin-top:8px;min-height:18px;">
        ${verified
          ? `✓ Found ${state.availableModels.length} model${state.availableModels.length !== 1 ? 's' : ''}`
          : 'Enter your model token above, then click to verify.'}
      </div>
    </div>
    <div class="field">
      <div class="model-label-row">
        <label style="margin-bottom:0;">Model</label>
        <button class="btn-model-hint" id="model-hint-btn" title="Model selection guide">Which model should I pick?</button>
      </div>
      <select id="model-select" class="model-select" style="margin-top:8px;" ${verified ? '' : 'disabled'}>
        ${selectHtml}
      </select>
    </div>
    <button class="btn-primary" id="step4-next" ${verified ? '' : 'disabled'} style="${verified ? '' : 'opacity:0.45;cursor:not-allowed;'}">Create World →</button>
  `);
  addNavRow(card, { backStep: 3 });

  // Keep modelToken in sync as user types, and reset verification on change
  card.querySelector('#model-token-input').addEventListener('input', e => {
    const newVal = e.target.value;
    if (newVal !== state.modelToken) {
      state.modelToken = newVal;
      state.modelsVerified = false;
      state.availableModels = [];
      const sel = card.querySelector('#model-select');
      const createBtn = card.querySelector('#step4-next');
      sel.disabled = true;
      sel.innerHTML = `<option value="" disabled selected>— verify your token first —</option>`;
      createBtn.disabled = true;
      createBtn.style.opacity = '0.45';
      createBtn.style.cursor = 'not-allowed';
      card.querySelector('#models-status').textContent = 'Enter your model token above, then click to verify.';
      card.querySelector('#models-status').style.color = '';
      card.querySelector('#verify-models').textContent = '🔍 Verify & load available models';
    }
  });

  async function runVerification() {
    const token = card.querySelector('#model-token-input').value.trim();
    if (!token) {
      card.querySelector('#models-status').textContent = '⚠ Enter a model token first.';
      card.querySelector('#models-status').style.color = '#c0392b';
      return;
    }
    state.modelToken = token;
    const btn = card.querySelector('#verify-models');
    const statusEl = card.querySelector('#models-status');
    const createBtn = card.querySelector('#step4-next');
    const sel = card.querySelector('#model-select');
    btn.disabled = true;
    btn.textContent = '⏳ Checking…';
    statusEl.textContent = 'Contacting GitHub Models API…';
    statusEl.style.color = 'var(--faded)';
    try {
      // Step 1: fetch the model catalog
      const res = await fetch(`${WORKER_URL}/models/list`, {
        headers: { Authorization: `Bearer ${state.modelToken}` },
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error ?? `API returned ${res.status}`);
      }
      const data = await res.json();
      const ids = data.models ?? [];
      if (ids.length === 0) throw new Error('No models returned — token may lack Models: Read permission');

      statusEl.textContent = `Found ${ids.length} model${ids.length !== 1 ? 's' : ''}. Probing inference access…`;

      // Step 2: make a real inference call to confirm the token can actually prompt.
      // Prefer a known-reliable model for the probe so that an unsupported first-
      // alphabetical catalog entry (e.g. ai21-labs/...) doesn't block verification.
      const PREFERRED_PROBE = ['openai/gpt-4o', 'openai/gpt-4o-mini', 'meta/llama-3.3-70b-instruct'];
      const probeModel = PREFERRED_PROBE.find(m => ids.includes(m)) ?? ids[0];
      const probeRes = await fetch(`${WORKER_URL}/models/probe`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${state.modelToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: probeModel }),
      });
      const probeData = await probeRes.json();
      if (!probeData.ok) {
        throw new Error(probeData.error ?? 'Inference probe failed');
      }

      state.availableModels = ids;
      state.modelsVerified = true;
      if (!ids.includes(state.model)) state.model = ids[0];
      sel.disabled = false;
      sel.innerHTML = ids.map(m =>
        `<option value="${m}"${state.model === m ? ' selected' : ''}>${m}</option>`
      ).join('');
      statusEl.textContent = `✓ ${ids.length} model${ids.length !== 1 ? 's' : ''} available — inference confirmed`;
      statusEl.style.color = 'green';
      btn.textContent = '↻ Re-check available models';
      createBtn.disabled = false;
      createBtn.style.opacity = '';
      createBtn.style.cursor = '';
    } catch (e) {
      state.modelsVerified = false;
      state.availableModels = [];
      sel.disabled = true;
      sel.innerHTML = `<option value="" disabled selected>— verify your token first —</option>`;
      createBtn.disabled = true;
      createBtn.style.opacity = '0.45';
      createBtn.style.cursor = 'not-allowed';
      statusEl.textContent = `⚠ Could not load models: ${e.message}`;
      statusEl.style.color = '#c0392b';
      btn.textContent = '🔍 Retry';
    } finally {
      btn.disabled = false;
    }
  }

  card.querySelector('#verify-models').addEventListener('click', runVerification);

  card.querySelector('#model-hint-btn').addEventListener('click', () => showModelGuide());
  card.querySelector('#model-select').addEventListener('change', e => { state.model = e.target.value; });
  card.querySelector('#step4-next').addEventListener('click', async () => {
    if (!state.modelsVerified) return;
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
      <p style="font-size:12px;color:var(--faded);margin:-8px 0 10px;">
        The letter will be addressed to <em>-unknown-</em> — the player will choose their own name when they open the link.
      </p>
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
    const body = card.querySelector('#letter-body').value.trim();
    if (!body) { showError(card, 'Write a letter first.'); return; }
    try {
      const res = await fetch(`${WORKER_URL}/game/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: state.gameId, passphrase: state.passphrase, letterBody: body }),
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
    card.querySelector('#letter-body').value = '';
    card.querySelector('#invite-output').innerHTML = '';
  });
  card.querySelector('#open-pwa').addEventListener('click', () => {
    window.open(`${PWA_URL}?game=${state.gameId}`, '_blank');
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
        founderGithubToken: state.githubToken,  // repo token — shared with players
        copilotToken: state.modelToken,          // AI token — stored only as Actions secret
        worldFlavour: state.worldFlavour,
        era: state.era,
        tone: state.tone,
        gmStyle: state.gmStyle,
        model: state.model,
        founderCharacterName: state.founderCharacterName,
        founderCharacterBio: state.founderCharacterBio,
        founderCharacterLocation: state.founderCharacterLocation,
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
// ── Model Guide Dialog ─────────────────────────────────
function showModelGuide() {
  // Remove any existing dialog
  document.getElementById('model-guide-overlay')?.remove();

  const MODELS = [
    {
      section: 'Recommended',
      entries: [
        {
          id: 'openai/gpt-4.1-mini',
          tag: 'Build & Test',
          summary: 'Best for development and prompt tuning. Reliable JSON output, fast runs, very low cost. If you\'re just getting started or want to try things out, start here and switch to a stronger model once your game is ready.',
          pros: ['Fraction of the cost of gpt-4o', 'Fast — GM runs finish quickly'],
          cons: ['Prose quality noticeably lower than larger models', 'Historian voice can drift at low temperature'],
          costs: [['2 players / mo', '~$0.04'], ['4 players / mo', '~$0.09'], ['8 players / mo', '~$0.17']],
        },
        {
          id: 'openai/gpt-4.1',
          tag: 'Gift Game',
          summary: 'The sweet spot for a real game. Better instruction following than gpt-4o, longer context window, more reliable at holding the GM\'s complex rules in mind over time.',
          pros: ['Strictly better than gpt-4o on most axes', 'Excellent at multi-rule system prompts'],
          cons: ['Slightly more expensive than gpt-4o', 'Newer — fewer known quirks documented'],
          costs: [['2 players / mo', '~$0.22'], ['4 players / mo', '~$0.43'], ['8 players / mo', '~$0.86']],
        },
      ],
    },
    {
      section: 'All Options',
      entries: [
        {
          id: 'openai/gpt-5',
          tag: 'Best Prose',
          summary: 'The finest historian voice on the list. Worth it for players who want exceptional creative writing and don\'t mind paying a small premium.',
          pros: ['Best creative writing quality by a wide margin', 'Holds complex rule systems better than any other model'],
          cons: ['Most expensive option', 'Overkill for short early-game sessions when canon is still small'],
          costs: [['2 players / mo', '~$1.00'], ['4 players / mo', '~$2.00'], ['8 players / mo', '~$4.00']],
        },
        {
          id: 'openai/gpt-4o',
          tag: 'Reliable',
          summary: 'Proven and dependable. The original design target for this engine. Solid creative prose, consistent JSON output, no surprises.',
          pros: ['Best all-round reliability for this exact task', 'Well-documented behavior — no surprises'],
          cons: ['Higher cost than gpt-4.1 for less capability', 'No longer the strongest creative writer on the list'],
          costs: [['2 players / mo', '~$0.27'], ['4 players / mo', '~$0.54'], ['8 players / mo', '~$1.08']],
        },
        {
          id: 'openai/gpt-4o-mini',
          tag: 'Budget',
          summary: 'Cheapest reliable option. Good for very active games where cost adds up, or for casual play. Prose will feel thinner and world events more generic.',
          pros: ['Cheapest in the OpenAI family', 'Reliable JSON output'],
          cons: ['Historian voice feels thin', 'World events tend to feel generic'],
          costs: [['2 players / mo', '~$0.02'], ['4 players / mo', '~$0.03'], ['8 players / mo', '~$0.06']],
        },
        {
          id: 'meta/llama-3.3-70b-instruct',
          tag: 'Open Weight',
          summary: 'Best open-weight option on the list. Genuinely good narrative writing and long context handling. Requires more robust JSON parsing on the engine side — retry logic is important.',
          pros: ['Likely cheapest capable option overall', 'Genuinely good at narrative tasks'],
          cons: ['Less reliable JSON output than OpenAI models — needs retry logic', 'Historian voice less consistent without careful prompt tuning'],
          costs: [['2 players / mo', '~$0.03'], ['4 players / mo', '~$0.06'], ['8 players / mo', '~$0.11']],
        },
        {
          id: 'mistral-ai/mistral-medium-2505',
          tag: 'Literary',
          summary: 'Underrated for creative writing. Mistral models handle literary prose well and follow instructions cleanly. Less tested for long-context world-building specifically.',
          pros: ['Strong creative writing quality relative to cost', 'Good JSON reliability'],
          cons: ['Less community testing for this specific use case', 'Less predictable than OpenAI models on edge cases'],
          costs: [['2 players / mo', '~$0.05'], ['4 players / mo', '~$0.10'], ['8 players / mo', '~$0.20']],
        },
      ],
    },
  ];

  const AVOID = [
    { label: 'Reasoning models', detail: 'o1, o3, o4-mini, DeepSeek R1, phi-4-reasoning — designed for logic and math, not narrative generation. Slow and expensive for this task.' },
    { label: 'Coding models', detail: 'Codestral — wrong fit entirely.' },
    { label: 'Small models', detail: 'phi-4-mini, ministral-3b, llama-3.1-8b, llama-4-scout — insufficient capacity for long-context world-building with complex rule following.' },
    { label: 'Vision models', detail: 'llama-3.2-11b/90b-vision, phi-4-multimodal — vision capability adds nothing here.' },
    { label: 'Embedding models', detail: 'text-embedding-3-large/small — not generative, cannot be used.' },
  ];

  function renderEntry(entry, isRecommended) {
    const costCols = entry.costs.map(([label]) => `<th>${label}</th>`).join('');
    const costVals = entry.costs.map(([, val]) => `<td>${val}</td>`).join('');
    return `
      <div class="mgd-entry${isRecommended ? ' mgd-entry--recommended' : ''}">
        <div class="mgd-entry-header">
          <span class="mgd-model-id">${entry.id}</span>
          <span class="mgd-model-tag">${entry.tag}</span>
        </div>
        <p class="mgd-summary">${entry.summary}</p>
        <div class="mgd-pros-cons">
          <div class="mgd-pros">
            <div class="mgd-pc-label">Pros</div>
            <ul>${entry.pros.map(p => `<li>${p}</li>`).join('')}</ul>
          </div>
          <div class="mgd-cons">
            <div class="mgd-pc-label">Cons</div>
            <ul>${entry.cons.map(c => `<li>${c}</li>`).join('')}</ul>
          </div>
        </div>
        <table class="mgd-cost-table">
          <thead><tr>${costCols}</tr></thead>
          <tbody><tr>${costVals}</tr></tbody>
        </table>
      </div>`;
  }

  const sectionsHtml = MODELS.map(({ section, entries }) => `
    <div class="mgd-section">
      <h3 class="mgd-section-title">${section}</h3>
      ${entries.map(e => renderEntry(e, section === 'Recommended')).join('')}
    </div>`).join('');

  const avoidHtml = AVOID.map(({ label, detail }) =>
    `<li><strong>${label}</strong> — ${detail}</li>`
  ).join('');

  const overlay = document.createElement('div');
  overlay.id = 'model-guide-overlay';
  overlay.className = 'mgd-overlay';
  overlay.innerHTML = `
    <div class="mgd-panel" role="dialog" aria-modal="true" aria-label="Model Selection Guide">
      <div class="mgd-panel-header">
        <div class="mgd-panel-title">Model Selection Guide</div>
        <button class="mgd-close" id="mgd-close-btn" aria-label="Close">✕</button>
      </div>
      <div class="mgd-body">
        <p class="mgd-intro">Choose the model your world's GM will use. You can change this at any time from the founder control panel — it takes effect on the next GM run.</p>
        <p class="mgd-intro mgd-intro--note">Cost estimates assume one letter per person every 3 days (~5,200 tokens per GM run).</p>
        ${sectionsHtml}
        <div class="mgd-section mgd-section--avoid">
          <h3 class="mgd-section-title mgd-section-title--avoid">Models to Avoid for This Use Case</h3>
          <p class="mgd-avoid-intro">These models are available but not well-suited to the GM role:</p>
          <ul class="mgd-avoid-list">${avoidHtml}</ul>
        </div>
        <p class="mgd-footer-note">You can change your model at any time from the founder control panel. The change takes effect on the next GM run — no restart required.</p>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('#mgd-close-btn').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function onKey(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
  });
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
render();
