import { corsHeaders } from '../lib/cors.js';

const MODELS_API = 'https://models.github.ai/inference';
const CATALOG_API = 'https://models.github.ai/catalog/models';

/**
 * GET /models/list
 * Proxies the GitHub Models catalog server-side (no CORS on that endpoint from browsers).
 * Returns { models: string[] } — sorted array of model id strings.
 */
export async function handleListModels(request) {
  const authHeader = request.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return json401('Missing Authorization header');
  }

  const upstream = await fetch(CATALOG_API, {
    headers: {
      Authorization: authHeader,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'loremail-worker/1.0',
    },
  });

  if (!upstream.ok) {
    const text = await upstream.text();
    return jsonRes(
      { error: `GitHub Models API returned ${upstream.status}`, detail: text.slice(0, 300) },
      upstream.status
    );
  }

  const data = await upstream.json();
  const list = Array.isArray(data) ? data : (data.data ?? data.models ?? []);
  const models = list
    .map(m => m.id ?? m.name ?? m.friendly_name)
    .filter(Boolean)
    .sort();

  return jsonRes({ models }, 200);
}

// Ordered list of reliable probe models — tried in sequence until one succeeds
const PROBE_FALLBACKS = [
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
  'meta/llama-3.3-70b-instruct',
  'mistralai/mistral-large-2411',
];

/**
 * POST /models/probe
 * Makes a minimal real inference call to verify the token can actually prompt.
 * Body: { model: string }
 * Returns { ok: true } or { ok: false, error: string }
 *
 * Tries the requested model first, then falls back through PROBE_FALLBACKS so
 * that a single unsupported first-alphabetical model doesn't block verification.
 * Uses max_completion_tokens (supported by all GitHub Models including o-series).
 */
export async function handleProbeModel(request) {
  const authHeader = request.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return json401('Missing Authorization header');
  }

  let requestedModel = 'openai/gpt-4o';
  try {
    const body = await request.json();
    if (body.model) requestedModel = body.model;
  } catch { /* use default */ }

  // Build the list to try: requested model first, then known-good fallbacks
  const modelsToTry = [requestedModel, ...PROBE_FALLBACKS.filter(m => m !== requestedModel)];

  let lastStatus = 400;
  let lastErrText = '';

  for (const model of modelsToTry) {
    const res = await fetch(`${MODELS_API}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'loremail-worker/1.0',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
        // max_completion_tokens works for both standard and reasoning models;
        // max_tokens kept as alias for older model endpoints
        max_completion_tokens: 5,
        max_tokens: 5,
      }),
    });

    if (res.ok) {
      return jsonRes({ ok: true }, 200);
    }

    lastStatus = res.status;
    lastErrText = await res.text();

    // Auth failures are definitive — no point trying other models
    if (res.status === 401 || res.status === 403) break;
  }

  const friendly =
    lastStatus === 401 || lastStatus === 403
      ? 'Token does not have permission to call this model. Add Account permissions → Models: Read to your fine-grained PAT.'
      : lastStatus === 429
      ? 'Rate limited — token permissions are fine but you have hit the free-tier quota. Try again in a minute.'
      : `Inference API returned HTTP ${lastStatus}`;

  return jsonRes({ ok: false, error: friendly, detail: lastErrText.slice(0, 300) }, 200);
}

// ── helpers ──────────────────────────────────────────────────────────────────

function jsonRes(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

function json401(msg) {
  return jsonRes({ error: msg }, 401);
}
