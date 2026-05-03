/**
 * Loremail Cloudflare Worker
 * Central auth, game creation, invite, join, and trigger endpoints.
 */

import { handleCreateGame } from './routes/create-game.js';
import { handleInvite } from './routes/invite.js';
import { handleJoin } from './routes/join.js';
import { handleGetPlayer } from './routes/get-player.js';
import { handlePatchConfig } from './routes/patch-config.js';
import { handleRegenerateInvite } from './routes/regenerate-invite.js';
import { handleDeletePlayer } from './routes/delete-player.js';
import { handleGameInfo } from './routes/game-info.js';
import { handleListModels, handleProbeModel } from './routes/list-models.js';
import { handleTriggerSeed } from './routes/trigger-seed.js';
import { handleDeleteRepo } from './routes/delete-repo.js';
import { handleGetVapidKey, handlePushSubscribe } from './routes/push-subscribe.js';
import { handlePushNotify } from './routes/push-notify.js';
import { handlePushSelfTest } from './routes/push-self-test.js';
import { handleUpdateEngine } from './routes/update-engine.js';
import { corsHeaders, handleCors } from './lib/cors.js';

export default {
  async fetch(request, env) {
    // Handle CORS preflight — must respond before any route logic
    if (request.method === 'OPTIONS') {
      return handleCors(request, env);
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    let response;
    try {
      if (method === 'POST' && path === '/game/create') response = await handleCreateGame(request, env);
      else if (method === 'POST' && path === '/game/invite') response = await handleInvite(request, env);
      else if (method === 'POST' && path === '/game/join') response = await handleJoin(request, env);
      else if (method === 'GET' && path === '/game/player') response = await handleGetPlayer(request, env);
      else if (method === 'PATCH' && path === '/game/config') response = await handlePatchConfig(request, env);
      else if (method === 'POST' && path === '/game/regenerate-invite') response = await handleRegenerateInvite(request, env);
      else if (method === 'DELETE' && path === '/game/player') response = await handleDeletePlayer(request, env);
      else if (method === 'GET' && path === '/game/info') response = await handleGameInfo(request, env);
      else if (method === 'GET' && path === '/models/list') response = await handleListModels(request, env);
      else if (method === 'POST' && path === '/models/probe') response = await handleProbeModel(request, env);
      else if (method === 'POST' && path === '/game/trigger-seed') response = await handleTriggerSeed(request, env);
      else if (method === 'DELETE' && path === '/game/repo') response = await handleDeleteRepo(request, env);
      else if (method === 'GET'  && path === '/push/vapid-key') response = await handleGetVapidKey(request, env);
      else if (method === 'POST' && path === '/push/subscribe') response = await handlePushSubscribe(request, env);
      else if (method === 'POST' && path === '/push/notify')    response = await handlePushNotify(request, env);
      else if (method === 'POST' && path === '/push/self-test') response = await handlePushSelfTest(request, env);
      else if (method === 'POST' && path === '/game/update-engine') response = await handleUpdateEngine(request, env);
      else response = json({ error: 'Not found' }, 404);
    } catch (err) {
      console.error('Worker error:', err);
      response = json({ error: err.message ?? 'Internal server error' }, 500);
    }

    // Attach the correct CORS headers to every response (based on the actual request origin)
    const origin = request.headers.get('Origin') ?? '';
    const cors = corsHeaders(origin, env);
    const out = new Response(response.body, response);
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
    return out;
  },
};

// Plain JSON response — no CORS headers here; they are added at the top level above.
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
