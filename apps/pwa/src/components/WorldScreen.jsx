import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';

const WORKER_URL = import.meta.env.VITE_WORKER_URL ?? '';

export function WorldScreen({ data, loading, worldTab, setWorldTab, session, onRefresh }) {
  const [retriggerState, setRetriggerState] = useState(null); // null | 'loading' | 'ok' | 'error'

  if (loading && !data) {
    return <div className="loading">Loading world…</div>;
  }

  const canon = data?.canon ?? '';
  const events = data?.events ?? '';
  const characters = data?.characters ?? {};
  const game = data?.game;
  const seed = data?.seed ?? '';
  const seedGenerating = data?.seedGenerating ?? false;

  // Parse canon sections for display
  const recentMatch = canon.match(/## RECENT HISTORY[\s\S]*?\n\n([\s\S]*)$/);
  const recentHistory = recentMatch ? recentMatch[1].trim() : '';

  // Parse events — strip markdown headers for display
  const eventLines = events
    .split('\n')
    .filter(l => l && !l.startsWith('# '))
    .join('\n')
    .trim();

  // Strip the "# World Seed" h1 from seed for display (it's shown by the section heading)
  const seedBody = seed.replace(/^#\s+World Seed\s*/i, '').trim();

  async function handleRetriggerSeed() {
    setRetriggerState('loading');
    try {
      const res = await fetch(`${WORKER_URL}/game/trigger-seed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: session.gameId, founderGithubToken: session.githubToken }),
      });
      const body = await res.json();
      if (!res.ok || body.error) throw new Error(body.error ?? 'Dispatch failed');
      setRetriggerState('ok');
      // Poll for the seed after a short delay, then refresh
      setTimeout(() => onRefresh?.(), 15000);
    } catch (e) {
      console.error('Trigger seed failed:', e);
      setRetriggerState('error');
    }
  }

  return (
    <div>
      <div className="world-tabs">
        <button
          className={`world-tab${worldTab === 'world' ? ' active' : ''}`}
          onClick={() => setWorldTab('world')}
        >
          World
        </button>
        <button
          className={`world-tab${worldTab === 'characters' ? ' active' : ''}`}
          onClick={() => setWorldTab('characters')}
        >
          Characters
        </button>
      </div>

      {worldTab === 'world' && (
        <div className="world-content">
          {game?.name && (
            <div style={{ fontFamily: "'IM Fell English', serif", fontSize: 18, marginBottom: 16 }}>
              {game.name}
            </div>
          )}

          {/* World Seed */}
          {seedGenerating ? (
            <div className="seed-generating">
              <span className="seed-generating-text">✦ World seed is being written by the GM…</span>
              {session?.isFounder && (
                <div style={{ marginTop: 8 }}>
                  {retriggerState === null && (
                    <button className="btn-secondary" onClick={handleRetriggerSeed}>
                      Re-trigger seed generation
                    </button>
                  )}
                  {retriggerState === 'loading' && <span style={{ opacity: 0.6 }}>Dispatching…</span>}
                  {retriggerState === 'ok' && <span style={{ color: 'var(--ink-faint)' }}>Dispatched — check back in a minute.</span>}
                  {retriggerState === 'error' && (
                    <span style={{ color: '#a33' }}>
                      Dispatch failed. Try running the workflow manually in your GitHub repo.
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : seedBody ? (
            <div className="world-seed">
              <div className="world-seed-label">World Seed</div>
              <div className="world-prose">
                <ReactMarkdown>{seedBody}</ReactMarkdown>
              </div>
            </div>
          ) : null}

          <div className="world-prose" style={{ marginTop: seedBody && !seedGenerating ? 20 : 0 }}>
            <ReactMarkdown>{recentHistory || '*The world is quiet. No history has been recorded yet.*'}</ReactMarkdown>
          </div>

          {eventLines && (
            <div className="world-events">
              <div className="world-events-title">Recent Events</div>
              {eventLines.split(/\n### /).filter(Boolean).map((e, i) => (
                <div key={i} className="event-item">
                  <ReactMarkdown>{e.trim()}</ReactMarkdown>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {worldTab === 'characters' && (
        <div style={{ paddingTop: 12 }}>
          {Object.entries(characters).map(([id, info]) => (
            <div key={id} className="character-card">
              <div className="char-name">
                {info.name ?? id}
                {id === session.playerId && <span className="char-you">· you</span>}
              </div>
              <div className="char-bio">
                <ReactMarkdown>{info.character ?? ''}</ReactMarkdown>
              </div>
              {info.location && (
                <div className="char-location">last known: {info.location}</div>
              )}
            </div>
          ))}
          {Object.keys(characters).length === 0 && (
            <div className="empty-state">No characters yet.</div>
          )}
        </div>
      )}
    </div>
  );
}