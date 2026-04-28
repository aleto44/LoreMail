import React from 'react';
import ReactMarkdown from 'react-markdown';

export function WorldScreen({ data, loading, worldTab, setWorldTab, session }) {
  if (loading && !data) {
    return <div className="loading">Loading world…</div>;
  }

  const canon = data?.canon ?? '';
  const events = data?.events ?? '';
  const characters = data?.characters ?? {};
  const game = data?.game;

  // Parse canon sections for display
  const recentMatch = canon.match(/## RECENT HISTORY[\s\S]*?\n\n([\s\S]*)$/);
  const recentHistory = recentMatch ? recentMatch[1].trim() : '';

  // Parse events — strip markdown headers for display
  const eventLines = events
    .split('\n')
    .filter(l => l && !l.startsWith('# '))
    .join('\n')
    .trim();

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
          <div className="world-prose">
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
