import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { useLastSeen } from '../hooks/useLastSeen.js';

const WORKER_URL = import.meta.env.VITE_WORKER_URL ?? '';

// ── Force-directed layout ────────────────────────────────────────────────────

function useForceLayout(nodes, edges) {
  const posRef = useRef({});
  const velRef = useRef({});
  const rafRef = useRef(null);
  const [positions, setPositions] = useState({});

  const nodeKey = nodes.map(n => n.id).join(',');
  const edgeKey = edges.map(e => `${e.from}:${e.to}`).join(',');

  useEffect(() => {
    if (!nodes.length) return;

    nodes.forEach(n => {
      if (!posRef.current[n.id]) {
        const angle = Math.random() * 2 * Math.PI;
        const r = 50 + Math.random() * 90;
        posRef.current[n.id] = { x: 200 + r * Math.cos(angle), y: 200 + r * Math.sin(angle) };
      }
      if (!velRef.current[n.id]) velRef.current[n.id] = { vx: 0, vy: 0 };
    });

    const IDEAL = 150, KS = 0.04, KR = 5000, KC = 0.007, DAMP = 0.80;
    const CX = 200, CY = 200;
    let frame = 0, alive = true;

    function tick() {
      if (!alive) return;
      frame++;
      const pos = posRef.current;
      const vel = velRef.current;
      const ids = nodes.map(n => n.id).filter(id => pos[id]);
      const f = Object.fromEntries(ids.map(id => [id, { fx: 0, fy: 0 }]));

      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = ids[i], b = ids[j];
          const dx = pos[b].x - pos[a].x, dy = pos[b].y - pos[a].y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          const mag = KR / (d * d);
          f[a].fx -= dx / d * mag; f[a].fy -= dy / d * mag;
          f[b].fx += dx / d * mag; f[b].fy += dy / d * mag;
        }
      }

      edges.forEach(e => {
        if (!pos[e.from] || !pos[e.to]) return;
        const dx = pos[e.to].x - pos[e.from].x, dy = pos[e.to].y - pos[e.from].y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const mag = KS * (d - IDEAL);
        f[e.from].fx += dx / d * mag; f[e.from].fy += dy / d * mag;
        f[e.to].fx   -= dx / d * mag; f[e.to].fy   -= dy / d * mag;
      });

      ids.forEach(id => {
        f[id].fx += (CX - pos[id].x) * KC;
        f[id].fy += (CY - pos[id].y) * KC;
      });

      let ke = 0;
      ids.forEach(id => {
        vel[id].vx = (vel[id].vx + f[id].fx) * DAMP;
        vel[id].vy = (vel[id].vy + f[id].fy) * DAMP;
        pos[id].x += vel[id].vx;
        pos[id].y += vel[id].vy;
        ke += vel[id].vx ** 2 + vel[id].vy ** 2;
      });

      if (frame % 3 === 0) setPositions({ ...pos });
      if (ke > 0.08 && frame < 600) rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => { alive = false; cancelAnimationFrame(rafRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeKey, edgeKey]);

  return positions;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function relTime(ts) {
  if (!ts) return '';
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function Badge({ type }) {
  return <span className={`lore-badge lore-badge--${type}`}>{type === 'new' ? 'NEW' : 'UPDATED'}</span>;
}

// ── Tab: Timeline ─────────────────────────────────────────────────────────────

function TimelineTab({ worldTimeline, lastSeen }) {
  const entries = [...(worldTimeline?.entries ?? [])].sort((a, b) => b.timestamp - a.timestamp);
  if (!entries.length) return <div className="empty-state">No history has been recorded yet.</div>;

  return (
    <div className="lore-list">
      {entries.map(entry => {
        const isNew = entry.timestamp > lastSeen;
        return (
          <div key={entry.id} className="lore-card">
            {isNew && <Badge type="new" />}
            <div className="lore-card-body">{entry.summary}</div>
            <div className="lore-card-footer">
              {entry.tags?.length > 0 && <span className="lore-tags">{entry.tags.join(' · ')}</span>}
              <span className="lore-time">{relTime(entry.timestamp)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Tab: People ───────────────────────────────────────────────────────────────

function PeopleTab({ worldPeople, lastSeen }) {
  const people = [...(worldPeople?.people ?? [])].sort((a, b) => (b.last_updated ?? b.first_mentioned ?? 0) - (a.last_updated ?? a.first_mentioned ?? 0));
  if (!people.length) return <div className="empty-state">No people have been recorded yet.</div>;

  return (
    <div className="lore-list">
      {people.map(person => {
        const isNew     = person.first_mentioned > lastSeen;
        const isUpdated = !isNew && person.last_updated > lastSeen;
        // Use the person's ID as their name (capitalized)
        const displayName = person.id.charAt(0).toUpperCase() + person.id.slice(1);
        return (
          <div key={person.id} className="lore-card">
            {isNew     && <Badge type="new" />}
            {isUpdated && <Badge type="updated" />}
            <div className="lore-card-name">{displayName}</div>
            <div className="lore-card-body">{person.description}</div>
            {person.status && <div className="lore-card-status">status: {person.status}</div>}
          </div>
        );
      })}
    </div>
  );
}

// ── Tab: Map ──────────────────────────────────────────────────────────────────

function MapTab({ worldMap, lastSeen, session, characters }) {
  const rawNodes        = worldMap?.nodes ?? [];
  let   edges           = worldMap?.edges ?? [];
  const rawPlayerLocs   = worldMap?.player_locations ?? {};   // { playerId: nodeId }

  // ── Synthesise nodes from character location.md when the GM hasn't yet
  //    populated world/map.json (e.g. early in a new game).
  let nodes              = rawNodes;
  let playerLocations    = rawPlayerLocs;
  let hasSyntheticNodes  = false;

  if (!rawNodes.length && characters && Object.keys(characters).length) {
    const synthMap  = {};   // locationKey → node
    const synthLocs = {};   // playerId → nodeId

    Object.entries(characters).forEach(([playerId, charData]) => {
      if (!charData.location?.trim()) return;
      // Use the first non-empty line as the place name
      const label      = charData.location.trim().split('\n').find(l => l.trim()) ?? charData.location.trim();
      const shortLabel = label.slice(0, 50);
      const key        = shortLabel.toLowerCase().replace(/[^a-z0-9]/g, '-');
      if (!synthMap[key]) {
        synthMap[key] = { id: `loc-${key}`, label: shortLabel, description: charData.location.trim(), _synthetic: true };
      }
      synthLocs[playerId] = synthMap[key].id;
    });

    if (Object.keys(synthMap).length) {
      nodes             = Object.values(synthMap);
      playerLocations   = synthLocs;
      hasSyntheticNodes = true;
    }
  }

  // When a real canon map exists, try to match untracked characters to existing
  // nodes using word-overlap normalization. We deliberately do NOT create
  // synthetic nodes here — phantom nodes alongside GM-created canon nodes cause
  // the duplicate-location bug (e.g. "somewhere on the road…" spawning a second
  // node next to the GM's "Road Between Unnamed Cities"). Characters whose
  // location text doesn't fuzzy-match any existing node simply have no map pin
  // until the GM engine assigns them a player_location entry on the next run.
  if (rawNodes.length > 0 && characters) {
    const newLocs = { ...playerLocations };
    let   changed = false;

    // Normalize a label to comparable lowercase words
    const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();

    Object.entries(characters).forEach(([pid, charData]) => {
      if (newLocs[pid]) return;                     // already tracked
      if (!charData?.location?.trim()) return;

      const label      = (charData.location.trim().split('\n').find(l => l.trim()) ?? charData.location.trim()).slice(0, 60);
      const labelNorm  = norm(label);
      const labelWords = labelNorm.split(' ').filter(w => w.length > 3);

      // Match an existing node whose significant words all appear in the
      // character's location text, or vice-versa.
      const matchNode = rawNodes.find(n => {
        const nl = norm(n.label ?? '');
        if (nl.length < 3) return false;
        // Direct containment (handles "Bathlam" ↔ "City of Bathlam")
        if (labelNorm.includes(nl) || nl.includes(labelNorm)) return true;
        // All significant words of the shorter label appear in the longer string
        const nlWords   = nl.split(' ').filter(w => w.length > 3);
        const shorter   = nlWords.length <= labelWords.length ? nlWords : labelWords;
        const longerStr = nlWords.length <= labelWords.length ? labelNorm : nl;
        return shorter.length >= 2 && shorter.every(w => longerStr.includes(w));
      });

      if (matchNode) {
        newLocs[pid] = matchNode.id;
        changed = true;
      }
      // No match → leave the character without a map pin for now.
    });

    if (changed) {
      playerLocations = newLocs;
    }
  }

  // Synthesise ghost nodes for any edge endpoints that don't exist in the
  // nodes array (e.g. an edge "cybercity-435 → coastal-region" where the map
  // only has "cybercity-435-undergrounds"). Without this the edge is silently
  // dropped because positions[e.from] is undefined.
  const nodeIds = new Set(nodes.map(n => n.id));
  const ghostNodes = [];
  edges.forEach(e => {
    [e.from, e.to].forEach(missingId => {
      if (!nodeIds.has(missingId)) {
        // Try prefix-match against existing nodes first (e.g. "cybercity-435"
        // matches "cybercity-435-undergrounds").
        const match = nodes.find(n => n.id.startsWith(missingId + '-') || missingId.startsWith(n.id + '-'));
        if (match) {
          // Remap the edge to the matched node so we don't need a ghost node
          edges = edges.map(ed => ({
            ...ed,
            from: ed.from === missingId ? match.id : ed.from,
            to:   ed.to   === missingId ? match.id : ed.to,
          }));
        } else if (!ghostNodes.find(n => n.id === missingId)) {
          const label = missingId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          ghostNodes.push({ id: missingId, label, _ghost: true });
          nodeIds.add(missingId);
        }
      }
    });
  });
  if (ghostNodes.length) nodes = [...nodes, ...ghostNodes];

  const positions = useForceLayout(nodes, edges);

  const [selected, setSelected] = useState(null);
  const [pan, setPan]           = useState({ x: 0, y: 0 });
  const panStart                = useRef(null);
  const svgRef                  = useRef(null);

  // Build reverse map: nodeId → [playerName, ...]
  const playersAtNode = {};
  Object.entries(playerLocations).forEach(([playerId, nodeId]) => {
    if (!playersAtNode[nodeId]) playersAtNode[nodeId] = [];
    const name = characters?.[playerId]?.name ?? playerId;
    playersAtNode[nodeId].push(name);
  });

  function getConnections(nodeId) {
    return edges
      .filter(e => e.from === nodeId || e.to === nodeId)
      .map(e => ({ otherId: e.from === nodeId ? e.to : e.from, label: e.label }));
  }

  function nodeLabel(id) { return nodes.find(n => n.id === id)?.label ?? id; }

  function onPointerDown(e) {
    if (e.target.closest('.map-node-group')) return;
    panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    svgRef.current?.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e) {
    if (!panStart.current) return;
    setPan({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y });
  }
  function onPointerUp() { panStart.current = null; }

  if (!nodes.length) return <div className="empty-state">The map is uncharted. Places will appear as the world reveals itself.</div>;

  const selectedNode = selected ? nodes.find(n => n.id === selected) : null;
  const hasPlayerLocations = Object.keys(playerLocations).length > 0;

  return (
    <div className="map-container">
      <svg
        ref={svgRef}
        className="map-svg"
        viewBox="0 0 400 400"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        style={{ touchAction: 'none' }}
      >
        <g transform={`translate(${pan.x},${pan.y})`}>
          {edges.map((e, i) => {
            const a = positions[e.from], b = positions[e.to];
            if (!a || !b) return null;
            return (
              <g key={i}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="map-edge" />
                {e.label && (
                  <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 5} className="map-edge-label">{e.label}</text>
                )}
              </g>
            );
          })}
          {nodes.map(node => {
            const pos    = positions[node.id];
            if (!pos) return null;
            const isNew  = node.first_mentioned > lastSeen;
            const isSel  = selected === node.id;
            const isPC   = !!playersAtNode[node.id];
            return (
              <g key={node.id} className="map-node-group" onClick={() => setSelected(isSel ? null : node.id)} style={{ cursor: 'pointer' }}>
                <circle cx={pos.x} cy={pos.y} r={isPC ? 9 : 8}
                  className={[
                    'map-node',
                    isNew  && 'map-node--new',
                    isSel  && 'map-node--selected',
                    isPC   && 'map-node--pc',
                  ].filter(Boolean).join(' ')} />
                <text x={pos.x} y={pos.y + (isPC ? 22 : 20)} className="map-node-label">{node.label}</text>
              </g>
            );
          })}
        </g>
      </svg>

      {selectedNode && (
        <div className="map-detail-panel">
          <div className="map-detail-name">{selectedNode.label}</div>
          {playersAtNode[selectedNode.id]?.length > 0 && (
            <div className="map-detail-players">
              {playersAtNode[selectedNode.id].map(n => `◉ ${n}`).join('  ')}
            </div>
          )}
          {selectedNode.description && <div className="map-detail-desc">{selectedNode.description}</div>}
          {getConnections(selectedNode.id).length > 0 && (
            <div className="map-detail-connections">
              <div className="map-detail-connections-label">Connected to:</div>
              {getConnections(selectedNode.id).map((c, i) => (
                <div key={i} className="map-detail-connection">→ {nodeLabel(c.otherId)}{c.label ? ` — ${c.label}` : ''}</div>
              ))}
            </div>
          )}
          {selectedNode.first_mentioned && (
            <div className="map-detail-time">Last mentioned: {relTime(selectedNode.first_mentioned)}</div>
          )}
          <button className="map-detail-close" onClick={() => setSelected(null)}>close</button>
        </div>
      )}

      <div className="map-legend">
        <span className="map-legend-item">◎ location</span>
        {hasPlayerLocations && <span className="map-legend-item map-legend-item--pc">◉ character</span>}
        <span className="map-legend-item map-legend-item--new">◉ new</span>
        <span className="map-legend-sep">· drag to pan</span>
        {hasSyntheticNodes && <span className="map-legend-sep">· from character sheets — map filling as letters arrive</span>}
      </div>
    </div>
  );
}

// ── Tab: Factions ─────────────────────────────────────────────────────────────

function FactionsTab({ worldFactions, lastSeen }) {
  const factions = [...(worldFactions?.factions ?? [])].sort((a, b) => (b.last_updated ?? b.first_mentioned ?? 0) - (a.last_updated ?? a.first_mentioned ?? 0));
  if (!factions.length) return <div className="empty-state">No factions have been recorded yet.</div>;

  return (
    <div className="lore-list">
      {factions.map(faction => {
        const isNew     = faction.first_mentioned > lastSeen;
        const isUpdated = !isNew && faction.last_updated > lastSeen;
        // Use the faction's ID as their name (capitalized)
        const displayName = faction.id.charAt(0).toUpperCase() + faction.id.slice(1);
        return (
          <div key={faction.id} className="lore-card">
            {isNew     && <Badge type="new" />}
            {isUpdated && <Badge type="updated" />}
            <div className="lore-card-name">{displayName}</div>
            <div className="lore-card-body">{faction.description}</div>
            {faction.disposition && <div className="lore-card-status">disposition: {faction.disposition}</div>}
          </div>
        );
      })}
    </div>
  );
}

// ── WorldScreen ───────────────────────────────────────────────────────────────

export function WorldScreen({ data, loading, worldTab, setWorldTab, session, onRefresh }) {
  const { lastSeen, startSeenTimer, cancelSeenTimer } = useLastSeen(session?.gameId);
  const [retriggerState, setRetriggerState] = useState(null);
  const tabsRef = useRef(null);
  const tabsDrag = useRef(null);

  const loreTabs = ['timeline', 'people', 'map', 'factions'];
  const isLoreTab = loreTabs.includes(worldTab);

  useEffect(() => {
    if (isLoreTab) startSeenTimer();
    else cancelSeenTimer();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoreTab]);

  if (loading && !data) return <div className="loading">Loading world…</div>;

  function onTabsPointerDown(e) {
    if (e.target.tagName === 'BUTTON') return; // let button clicks pass through normally
    tabsDrag.current = { x: e.clientX, scrollLeft: tabsRef.current.scrollLeft, moved: false };
    tabsRef.current.setPointerCapture(e.pointerId);
  }
  function onTabsPointerMove(e) {
    if (!tabsDrag.current) return;
    const dx = e.clientX - tabsDrag.current.x;
    if (Math.abs(dx) > 4) tabsDrag.current.moved = true;
    tabsRef.current.scrollLeft = tabsDrag.current.scrollLeft - dx;
  }
  function onTabsPointerUp() { tabsDrag.current = null; }

  const canon          = data?.canon ?? '';
  const events         = data?.events ?? '';
  const worldChapters  = data?.worldChapters ?? { chapters: [] };
  const characters     = data?.characters ?? {};
  const seed           = data?.seed ?? '';
  const seedGenerating = data?.seedGenerating ?? false;

  const recentMatch   = canon.match(/## RECENT HISTORY[\s\S]*?\n\n([\s\S]*)$/);
  const recentHistory = recentMatch
    ? recentMatch[1].trim().split(/(?=### )/).filter(s => s.trim()).reverse().join('\n\n')
    : '';
  const eventLines    = events.split('\n').filter(l => l && !l.startsWith('# ')).join('\n').trim();
  const seedBody      = seed.replace(/^#\s+World Seed\s*/i, '').trim();

  function stripMeta(text) {
    return text ? text.replace(/\s+source:\s*gm-inference/gi, '') : text;
  }

  // Unseen dots
  const ts          = lastSeen;
  const timelineDot = (data?.worldTimeline?.entries   ?? []).some(e => e.timestamp      > ts);
  const peopleDot   = (data?.worldPeople?.people      ?? []).some(p => p.first_mentioned > ts || p.last_updated > ts);
  const mapDot      = (data?.worldMap?.nodes          ?? []).some(n => n.first_mentioned > ts);
  const factionsDot = (data?.worldFactions?.factions  ?? []).some(f => f.first_mentioned > ts || f.last_updated > ts);

  const TAB_DEFS = [
    { id: 'world',      label: 'World',      dot: false },
    { id: 'characters', label: 'Characters', dot: false },
    { id: 'timeline',   label: 'Timeline',   dot: timelineDot },
    { id: 'people',     label: 'People',     dot: peopleDot },
    { id: 'map',        label: 'Map',        dot: mapDot },
    { id: 'factions',   label: 'Factions',   dot: factionsDot },
  ];

  async function handleRetriggerSeed() {
    setRetriggerState('loading');
    try {
      const res  = await fetch(`${WORKER_URL}/game/trigger-seed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: session.gameId, founderGithubToken: session.githubToken }),
      });
      const body = await res.json();
      if (!res.ok || body.error) throw new Error(body.error ?? 'Dispatch failed');
      setRetriggerState('ok');
      setTimeout(() => onRefresh?.(), 15000);
    } catch (e) {
      console.error('Trigger seed failed:', e);
      setRetriggerState('error');
    }
  }

  return (
    <div>
      <div
        className="world-tabs"
        ref={tabsRef}
        onPointerDown={onTabsPointerDown}
        onPointerMove={onTabsPointerMove}
        onPointerUp={onTabsPointerUp}
        onPointerLeave={onTabsPointerUp}
        style={{ cursor: 'grab', userSelect: 'none' }}
      >
        {TAB_DEFS.map(t => (
          <button
            key={t.id}
            className={`world-tab${worldTab === t.id ? ' active' : ''}`}
            onClick={() => setWorldTab(t.id)}
          >
            {t.label}{t.dot && <span className="world-tab-dot" />}
          </button>
        ))}
      </div>

      {worldTab === 'world' && (
        <div className="world-content">
          {seedGenerating ? (
            <div className="seed-generating">
              <span className="seed-generating-text">✦ World seed is being written by the GM…</span>
              {session?.isFounder && (
                <div style={{ marginTop: 8 }}>
                  {retriggerState === null    && <button className="btn-secondary" onClick={handleRetriggerSeed}>Re-trigger seed generation</button>}
                  {retriggerState === 'loading' && <span style={{ opacity: 0.6 }}>Dispatching…</span>}
                  {retriggerState === 'ok'      && <span style={{ color: 'var(--faded)' }}>Dispatched — check back in a minute.</span>}
                  {retriggerState === 'error'   && <span style={{ color: '#a33' }}>Dispatch failed. Try the workflow manually in your GitHub repo.</span>}
                </div>
              )}
            </div>
          ) : null}

          {/* Current (unchapterized) canon entries */}
          {recentHistory ? (
            <div className="world-prose" style={{ marginTop: seedGenerating ? 20 : 0 }}>
              <ReactMarkdown>{stripMeta(recentHistory)}</ReactMarkdown>
            </div>
          ) : !seedGenerating && (worldChapters.chapters ?? []).length === 0 ? (
            <div className="world-prose" style={{ marginTop: seedGenerating ? 20 : 0 }}>
              <ReactMarkdown>*The world is quiet. No history has been recorded yet.*</ReactMarkdown>
            </div>
          ) : null}

          {/* Chapters — newest first */}
          {[...(worldChapters.chapters ?? [])].reverse().map(ch => (
            <div key={ch.number} className="chapter-card">
              <div className="chapter-card-header">
                <span className="chapter-card-number">Chapter {ch.number}</span>
                <span className="chapter-card-title">{ch.title}</span>
              </div>
              <div className="chapter-card-summary">{ch.summary}</div>
            </div>
          ))}

          {eventLines && (
            <div className="world-events">
              <div className="world-events-title">Recent Events</div>
               {stripMeta(eventLines).split(/\n### /).filter(Boolean).reverse().map((e, i) => (
                <div key={i} className="event-item"><ReactMarkdown>{e.trim()}</ReactMarkdown></div>
              ))}
            </div>
          )}

          {seedBody && (
            <div className="world-seed" style={{ marginTop: 20 }}>
              <div className="world-seed-label">World Seed</div>
              <div className="world-prose"><ReactMarkdown>{stripMeta(seedBody)}</ReactMarkdown></div>
            </div>
          )}
        </div>
      )}

      {worldTab === 'characters' && (
        <div style={{ paddingTop: 12 }}>
          {Object.entries(characters)
            .sort(([aId], [bId]) => {
              // Your character always comes first
              if (aId === session.playerId) return -1;
              if (bId === session.playerId) return 1;
              return 0;
            })
            .map(([id, info]) => (
              <div key={id} className="character-card">
                <div className="char-name">
                  {info.name ?? id}
                  {id === session.playerId && <span className="char-you">· you</span>}
                </div>
                <div className="char-bio"><ReactMarkdown>{info.character ?? ''}</ReactMarkdown></div>
                {info.location && <div className="char-location">last known: {info.location}</div>}
              </div>
            ))}
          {Object.keys(characters).length === 0 && <div className="empty-state">No characters yet.</div>}
        </div>
      )}

      {worldTab === 'timeline' && (
        <TimelineTab worldTimeline={data?.worldTimeline} lastSeen={lastSeen} />
      )}
      {worldTab === 'people' && (
        <PeopleTab worldPeople={data?.worldPeople} lastSeen={lastSeen} />
      )}
      {worldTab === 'map' && (
        <MapTab worldMap={data?.worldMap} lastSeen={lastSeen} session={session} characters={data?.characters ?? {}} />
      )}
      {worldTab === 'factions' && (
        <FactionsTab worldFactions={data?.worldFactions} lastSeen={lastSeen} />
      )}
    </div>
  );
}