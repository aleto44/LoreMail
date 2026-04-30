#!/usr/bin/env node
/**
 * validate-token.mjs
 *
 * Validates a GitHub PAT for use with LoreMail.
 *
 * Usage:
 *   node scripts/validate-token.mjs <your-github-pat>
 *   GITHUB_TOKEN=ghp_... node scripts/validate-token.mjs
 */

const token = process.argv[2] ?? process.env.GITHUB_TOKEN;

if (!token) {
  console.error('Usage: node scripts/validate-token.mjs <github-pat>');
  console.error('       or set GITHUB_TOKEN env var');
  process.exit(1);
}

const GH_API     = 'https://api.github.com';
const MODELS_API = 'https://models.github.ai/inference';

function ghHeaders(tok) {
  return {
    Authorization: `Bearer ${tok}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'loremail-validate/1.0',
  };
}

const results = [];

function record(label, status, detail, fix = null) {
  results.push({ label, status, detail, fix });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Token identity
// ─────────────────────────────────────────────────────────────────────────────
const userRes = await fetch(`${GH_API}/user`, { headers: ghHeaders(token) });

if (!userRes.ok) {
  record(
    'Token is valid',
    'FAIL',
    `GitHub rejected the token with HTTP ${userRes.status}. The token value is wrong, expired, or revoked.`,
    'Generate a new token at https://github.com/settings/tokens'
  );
  printResults();
  process.exit(1);
}

const user = await userRes.json();
record('Token is valid', 'PASS', `Authenticated as @${user.login}`);

// ─────────────────────────────────────────────────────────────────────────────
// 2. Scope detection
// ─────────────────────────────────────────────────────────────────────────────
const rawScopes    = userRes.headers.get('x-oauth-scopes') ?? '';
const scopes       = rawScopes ? rawScopes.split(',').map(s => s.trim()) : [];
const isFinegrained = scopes.length === 0;

if (isFinegrained) {
  record(
    'Token type',
    'INFO',
    'Fine-grained PAT detected (no x-oauth-scopes header). Scope checks will rely on live API calls instead.'
  );
} else {
  record('Token type', 'INFO', `Classic PAT — scopes on this token: ${scopes.join(', ')}`);

  const hasModels   = scopes.includes('models') || scopes.includes('models:read');
  const hasRepo     = scopes.includes('repo') || scopes.includes('public_repo');
  const hasWorkflow = scopes.includes('workflow');

  if (hasModels) {
    record('Scope: models (for AI inference)', 'PASS', 'Present on this token.');
  } else {
    record(
      'Scope: models (for AI inference)',
      'FAIL',
      'NOT present. The GM engine will get a 401 error every time it tries to call the AI.',
      'Go to https://github.com/settings/tokens → click your token → scroll to the bottom → check "models" → click Save.'
    );
  }

  if (hasRepo) {
    record('Scope: repo (for game repo management)', 'PASS', 'Present on this token.');
  } else {
    record(
      'Scope: repo (for game repo management)',
      'FAIL',
      'NOT present. The worker cannot create or update files in the game repo.',
      'Go to https://github.com/settings/tokens → click your token → check "repo" → click Save.'
    );
  }

  if (hasWorkflow) {
    record('Scope: workflow (to trigger GM runs)', 'PASS', 'Present on this token.');
  } else {
    record(
      'Scope: workflow (to trigger GM runs)',
      'FAIL',
      'NOT present. The worker cannot dispatch the gm-loop.yml workflow.',
      'Go to https://github.com/settings/tokens → click your token → check "workflow" → click Save.'
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Live models API calls
// ─────────────────────────────────────────────────────────────────────────────

async function probeModel(modelId, label) {
  process.stdout.write(`\nContacting models.github.ai (${modelId}) … `);
  const res = await fetch(`${MODELS_API}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
      max_tokens: 5,
    }),
  });
  process.stdout.write('done.\n');

  if (res.ok) {
    const data  = await res.json();
    const reply = data.choices?.[0]?.message?.content?.trim() ?? '(empty)';
    record(label, 'PASS', `Model responded: "${reply}".`);
  } else {
    const errText = await res.text();
    if (res.status === 401 || res.status === 403) {
      record(
        label,
        'FAIL',
        `HTTP ${res.status} — token is recognised by GitHub but is NOT allowed to call this model.\nAPI error: ${errText.slice(0, 200)}`,
        isFinegrained
          ? 'Go to https://github.com/settings/personal-access-tokens → click your token → "Account permissions" section → set "Models" to "Read-only" → click Save.'
          : 'Go to https://github.com/settings/tokens → click your token → scroll to the very bottom → check "models" → click Save.'
      );
    } else if (res.status === 404) {
      record(label, 'WARN', `HTTP 404 — model "${modelId}" is not available with this token/plan.`);
    } else if (res.status === 429) {
      record(label, 'WARN', `HTTP 429 — Rate limited. Token permissions are fine, but you have hit the free-tier quota. Try again in a few minutes.`);
    } else {
      record(label, 'FAIL', `Unexpected HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }
  }
}

await probeModel('openai/gpt-4.1-mini',               'AI inference — openai/gpt-4.1-mini (COPILOT_TOKEN check)');
await probeModel('anthropic/claude-3-7-sonnet',        'AI inference — anthropic/claude-3-7-sonnet');
await probeModel('anthropic/claude-3-5-sonnet',        'AI inference — anthropic/claude-3-5-sonnet');
await probeModel('anthropic/claude-3-haiku',           'AI inference — anthropic/claude-3-haiku');

// ─────────────────────────────────────────────────────────────────────────────
// 4. Available models
// ─────────────────────────────────────────────────────────────────────────────
process.stdout.write('\nFetching available models … ');
const modelsListRes = await fetch('https://models.github.ai/catalog/models', {
  headers: {
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'loremail-validate/1.0',
  },
});
process.stdout.write('done.\n');

if (modelsListRes.ok) {
  const modelsData = await modelsListRes.json();
  const list = Array.isArray(modelsData) ? modelsData : (modelsData.data ?? []);
  const modelIds = list
    .map(m => m.id ?? m.name ?? m.friendly_name)
    .filter(Boolean)
    .sort();

  if (modelIds.length) {
    const anthropicNote = modelIds.some(id => id.startsWith('anthropic/'))
      ? ''
      : '\n\n  ⚠️  No anthropic/* models appear here. The /catalog/models endpoint does not always\n  list Anthropic models even when they are usable — see the live probe results above\n  (section 3) for the real answer.';
    record(
      'Available models',
      'INFO',
      `${modelIds.length} model(s) listed by the catalog endpoint:\n${modelIds.map(id => `• ${id}`).join('\n')}${anthropicNote}`
    );
  } else {
    record('Available models', 'WARN', 'The /models endpoint returned an empty list.');
  }
} else {
  const errText = await modelsListRes.text();
  record(
    'Available models',
    'WARN',
    `Could not fetch model list — HTTP ${modelsListRes.status}: ${errText.slice(0, 200)}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Repo API (live call)
// ─────────────────────────────────────────────────────────────────────────────
const reposRes = await fetch(`${GH_API}/user/repos?per_page=1`, { headers: ghHeaders(token) });
if (reposRes.ok) {
  record(
    'Repo API access (game repo management)',
    'PASS',
    'Token can list and interact with repos.'
  );
} else {
  record(
    'Repo API access (game repo management)',
    'FAIL',
    `HTTP ${reposRes.status} — token cannot access the repo API. The worker will fail to create game repos.`,
    isFinegrained
      ? 'Go to https://github.com/settings/personal-access-tokens → click your token → "Repository permissions" → set Contents, Actions, and Secrets to "Read & Write" → click Save.'
      : 'Go to https://github.com/settings/tokens → click your token → check "repo" and "workflow" → click Save.'
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Print results
// ─────────────────────────────────────────────────────────────────────────────
printResults();

function printResults() {
  const icons    = { PASS: '✅ PASS', FAIL: '❌ FAIL', WARN: '⚠️  WARN', INFO: 'ℹ️  INFO' };
  const hasFails = results.some(r => r.status === 'FAIL');
  const hasWarns = results.some(r => r.status === 'WARN');

  console.log('\n' + '═'.repeat(62));
  console.log('  LOREMAIL TOKEN VALIDATION RESULTS');
  console.log('═'.repeat(62));

  for (const { label, status, detail, fix } of results) {
    if (status === 'INFO') {
      console.log(`\n  ℹ️  ${label}`);
      console.log(`      ${detail}`);
      continue;
    }
    console.log(`\n  ${icons[status]}  ${label}`);
    console.log(`      ${detail.replace(/\n/g, '\n      ')}`);
    if (fix) {
      console.log(`\n      👉 TO FIX: ${fix}`);
    }
  }

  console.log('\n' + '─'.repeat(62));
  if (hasFails) {
    console.log('  OVERALL RESULT: ❌ TOKEN HAS PROBLEMS');
    console.log('  ► Fix every item marked ❌ FAIL above, then re-run this script.');
  } else if (hasWarns) {
    console.log('  OVERALL RESULT: ⚠️  TOKEN IS VALID (rate-limited right now)');
    console.log('  ► Wait a few minutes, then try again.');
  } else {
    console.log('  OVERALL RESULT: ✅ TOKEN IS GOOD — everything passed.');
  }
  console.log('─'.repeat(62) + '\n');
}