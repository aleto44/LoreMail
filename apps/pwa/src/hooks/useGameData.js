import { useState, useEffect, useCallback, useRef } from 'react';
import { Octokit } from '@octokit/rest';

/**
 * Minimal YAML front-matter parser — browser-safe replacement for gray-matter.
 * Handles the simple key: value format used by LoreMail letters.
 */
function parseMatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, content: raw };
  const data = {};
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const val = line.slice(colonIdx + 1).trim();
    if (val === 'true') data[key] = true;
    else if (val === 'false') data[key] = false;
    else if (/^\d+$/.test(val)) data[key] = parseInt(val, 10);
    else data[key] = val;
  }
  return { data, content: match[2] };
}

/**
 * useGameData — fetches all game data from the GitHub repo.
 * Caches in memory, refreshes on mount and tab focus.
 */
export function useGameData(session) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const cacheRef = useRef(null);

  const refresh = useCallback(async () => {
    if (!session?.githubToken || !session?.repoOwner || !session?.repoName) return;
    setLoading(true);
    try {
      const fetched = await fetchGameData(session);
      cacheRef.current = fetched;
      setData(fetched);
    } catch (e) {
      console.error('Failed to fetch game data:', e);
    } finally {
      setLoading(false);
    }
  }, [session]);

  /**
   * Optimistically patch the in-memory data without a network round-trip.
   * patchFn receives the current data object and should return the updated one.
   */
  const patchData = useCallback((patchFn) => {
    setData(prev => {
      if (!prev) return prev;
      const next = patchFn(prev);
      cacheRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    if (session) refresh();
  }, [session, refresh]);

  return { data, loading, refresh, patchData };
}

async function fetchGameData(session) {
  const octokit = new Octokit({ auth: session.githubToken });
  const { repoOwner: owner, repoName: repo, playerId, isFounder } = session;

  const getContent = async (path) => {
    try {
      const res = await octokit.repos.getContent({ owner, repo, path });
      return atob(res.data.content.replace(/\n/g, ''));
    } catch { return null; }
  };

  const listDir = async (path) => {
    try {
      const res = await octokit.repos.getContent({ owner, repo, path });
      return Array.isArray(res.data) ? res.data : [];
    } catch { return []; }
  };

  // Fetch all in parallel
  const [
    gameJsonRaw,
    engineJsonRaw,
    canonRaw,
    eventsRaw,
    statusRaw,
    seedRaw,
    chronicleRaw,
    gmNotesRaw,
    factsRaw,
    pendingFiles,
    deliveredFiles,
  ] = await Promise.all([
    getContent('config/game.json'),
    getContent('config/engine.json'),
    getContent('world/canon.md'),
    getContent('world/events.md'),
    getContent('.gm-status.json'),
    getContent('world/seed.md'),
    isFounder ? getContent('world/chronicle.md') : Promise.resolve(null),
    isFounder ? getContent('world/gm-notes.md') : Promise.resolve(null),
    isFounder ? getContent('world/canon-facts.md') : Promise.resolve(null),
    listDir('letters/pending'),
    listDir('letters/delivered'),
  ]);

  const game = gameJsonRaw ? JSON.parse(gameJsonRaw) : null;
  const engine = engineJsonRaw ? JSON.parse(engineJsonRaw) : null;
  const gmStatus = statusRaw ? JSON.parse(statusRaw) : null;

  // Parse delivered letters
  const myDelivered = [];
  for (const file of deliveredFiles) {
    if (!file.name.endsWith('.md') || file.name === '.gitkeep') continue;
    const parts = file.name.replace('.md', '').split('_');
    const [deliverAt, from, to] = parts;
    if (from === playerId || to === playerId) {
      const raw = await getContent(`letters/delivered/${file.name}`);
      if (!raw) continue;
      const parsed = parseMatter(raw);
      if (parsed.data.to === playerId || parsed.data.from === playerId) {
        myDelivered.push({
          id: file.name,
          from: parsed.data.from,
          to: parsed.data.to,
          sentAt: parsed.data.sent_at,
          deliverAt: parsed.data.deliver_at,
          body: parsed.content.trim(),
          arrivedLabel: formatRelative(parsed.data.deliver_at),
        });
      }
    }
  }

  // Parse pending letters for "in transit" display
  const myPending = [];
  for (const file of pendingFiles) {
    if (!file.name.endsWith('.md') || file.name === '.gitkeep') continue;
    const parts = file.name.replace('.md', '').split('_');
    const [deliverAt, from, to] = parts;
    if (from === playerId || to === playerId) {
      myPending.push({
        id: file.name,
        from,
        to,
        deliverAt: parseInt(deliverAt),
        hoursRemaining: Math.max(0, Math.ceil((parseInt(deliverAt) - Date.now() / 1000) / 3600)),
      });
    }
  }

  // Fetch character data for all players
  const characters = {};
  if (game?.players) {
    await Promise.all(
      game.players.filter(p => p.joined && !p.removed).map(async (p) => {
        const [char, loc] = await Promise.all([
          getContent(`players/${p.id}/character.md`),
          getContent(`players/${p.id}/location.md`),
        ]);
        characters[p.id] = { character: char, location: loc, name: p.character };
      }),
    );
  }

  // Always ensure the current player's own character is visible, even if
  // game.json hasn't been updated yet (e.g. founder before first GM loop).
  if (!characters[playerId]) {
    const [char, loc] = await Promise.all([
      getContent(`players/${playerId}/character.md`),
      getContent(`players/${playerId}/location.md`),
    ]);
    if (char || loc) {
      const myEntry = game?.players?.find(p => p.id === playerId);
      characters[playerId] = {
        character: char,
        location: loc,
        name: myEntry?.character ?? session.characterName ?? playerId,
      };
    }
  }

  return {
    game,
    engine,
    canon: canonRaw,
    events: eventsRaw,
    gmStatus,
    seed: seedRaw,
    seedGenerating: !seedRaw || seedRaw.includes('*Generating...*'),
    chronicle: chronicleRaw,
    gmNotes: gmNotesRaw,
    facts: factsRaw,
    deliveredLetters: myDelivered.sort((a, b) => b.deliverAt - a.deliverAt),
    pendingLetters: myPending,
    characters,
  };
}

function formatRelative(unixTs) {
  if (!unixTs) return '';
  const now = Date.now() / 1000;
  const diff = now - unixTs;
  if (diff < 60) return 'arrived just now';
  if (diff < 3600) return `arrived ${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `arrived ${Math.floor(diff / 3600)} hours ago`;
  return `arrived ${Math.floor(diff / 86400)} days ago`;
}
