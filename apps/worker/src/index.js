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
import { corsHeaders, handleCors } from './lib/cors.js';

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return handleCors();
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      if (method === 'POST' && path === '/game/create') return handleCreateGame(request, env);
      if (method === 'POST' && path === '/game/invite') return handleInvite(request, env);
      if (method === 'POST' && path === '/game/join') return handleJoin(request, env);
      if (method === 'GET' && path === '/game/player') return handleGetPlayer(request, env);
      if (method === 'PATCH' && path === '/game/config') return handlePatchConfig(request, env);
      if (method === 'POST' && path === '/game/regenerate-invite') return handleRegenerateInvite(request, env);
      if (method === 'DELETE' && path === '/game/player') return handleDeletePlayer(request, env);
      if (method === 'GET' && path === '/game/info') return handleGameInfo(request, env);
      if (method === 'GET' && path === '/models/list') return handleListModels(request, env);
      if (method === 'POST' && path === '/models/probe') return handleProbeModel(request, env);
      if (method === 'POST' && path === '/game/trigger-seed') return handleTriggerSeed(request, env);

      return json({ error: 'Not found' }, 404);
    } catch (err) {
      console.error('Worker error:', err);
      return json({ error: err.message ?? 'Internal server error' }, 500);
    }
  },
};

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}
