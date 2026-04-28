import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';

export function ControlPanel({ session, data, workerUrl, onRefresh, onChronicle }) {
  const [gmPaused, setGmPaused] = useState(data?.game?.gm_paused ?? false);
  const [model, setModel] = useState(data?.game?.model ?? 'gpt-4o');
  const [gmStyle, setGmStyle] = useState(data?.game?.gm_style ?? 'medium');
  const [passphrase, setPassphrase] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [showFacts, setShowFacts] = useState(false);
  const [msg, setMsg] = useState('');

  const game = data?.game;
  const status = data?.gmStatus;
  const characters = data?.characters ?? {};

  async function patchConfig(changes) {
    if (!passphrase) { setMsg('Enter your passphrase first.'); return; }
    const res = await fetch(`${workerUrl}/game/config`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: session.gameId, passphrase, changes }),
    });
    const d = await res.json();
    if (!res.ok) { setMsg(d.error); return; }
    setMsg('Saved.'); onRefresh();
  }

  async function triggerGm() {
    if (!passphrase) { setMsg('Enter passphrase to trigger GM.'); return; }
    const res = await fetch(`${workerUrl}/game/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: session.gameId, passphrase }),
    });
    const d = await res.json();
    setMsg(d.success ? 'GM triggered.' : `Error: ${d.error}`);
  }

  async function triggerChronicle() {
    if (!passphrase) { setMsg('Enter passphrase first.'); return; }
    const res = await fetch(`${workerUrl}/game/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: session.gameId, passphrase, trigger: 'finalization' }),
    });
    const d = await res.json();
    if (d.success) {
      setMsg('Chronicle generation triggered. Refresh in a minute.');
      setTimeout(() => { onRefresh(); onChronicle(); }, 60000);
    } else {
      setMsg(`Error: ${d.error}`);
    }
  }

  async function removePlayer(playerId) {
    if (!passphrase) { setMsg('Enter passphrase first.'); return; }
    if (!confirm(`Remove ${playerId}?`)) return;
    const res = await fetch(`${workerUrl}/game/player`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: session.gameId, passphrase, playerId }),
    });
    const d = await res.json();
    setMsg(d.success ? 'Removed.' : d.error);
    onRefresh();
  }

  async function regenInvite(playerId) {
    if (!passphrase) { setMsg('Enter passphrase first.'); return; }
    const res = await fetch(`${workerUrl}/game/regenerate-invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: session.gameId, passphrase, playerId }),
    });
    const d = await res.json();
    if (d.inviteLink) {
      await navigator.clipboard.writeText(d.inviteLink).catch(() => {});
      setMsg('New invite link copied!');
    } else {
      setMsg(d.error);
    }
  }

  // Canon word count
  const canonWords = (data?.canon ?? '').split(/\s+/).filter(Boolean).length;

  return (
    <div>
      {/* Passphrase unlock */}
      <div className="control-section">
        <div className="control-title">Passphrase</div>
        <input
          type="password"
          value={passphrase}
          onChange={e => setPassphrase(e.target.value)}
          placeholder="Enter passphrase to make changes"
        />
        {msg && <div style={{ fontSize: 13, marginTop: 8, color: 'var(--accent)' }}>{msg}</div>}
      </div>

      {/* World management */}
      <div className="control-section">
        <div className="control-title">World Management</div>

        <div className="control-row">
          <label>Model</label>
          <select
            value={model}
            onChange={e => { setModel(e.target.value); patchConfig({ gameChanges: { model: e.target.value } }); }}
            style={{ width: 'auto' }}
          >
            {['gpt-4o', 'gpt-4o-mini', 'gpt-4.5-preview', 'o3-mini'].map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <div className="control-row">
          <label>GM Style</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {['gentle', 'medium', 'dramatic'].map(s => (
              <button
                key={s}
                className="btn-ghost"
                style={gmStyle === s ? { background: 'var(--ink)', color: 'white', border: 'none' } : {}}
                onClick={() => { setGmStyle(s); patchConfig({ gameChanges: { gm_style: s } }); }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="control-row">
          <label>GM Paused</label>
          <button
            className={`toggle${gmPaused ? ' on' : ''}`}
            onClick={() => { setGmPaused(!gmPaused); patchConfig({ gameChanges: { gm_paused: !gmPaused } }); }}
          />
        </div>

        <button className="control-btn" onClick={triggerGm}>Trigger GM Now</button>
        <button className="control-btn" onClick={() => setShowNotes(!showNotes)}>
          {showNotes ? 'Hide GM Notes' : 'View GM Notes'}
        </button>
        {showNotes && (
          <div style={{ padding: '12px 0', fontSize: 13, color: 'var(--faded)', fontStyle: 'italic' }}>
            <ReactMarkdown>{data?.gmNotes || '*No notes yet.*'}</ReactMarkdown>
          </div>
        )}
        <button className="control-btn" onClick={() => setShowFacts(!showFacts)}>
          {showFacts ? 'Hide Canon Facts' : 'View Canon Facts'}
        </button>
        {showFacts && (
          <div style={{ padding: '12px 0', fontSize: 13, color: 'var(--faded)' }}>
            <ReactMarkdown>{data?.facts || '*No facts extracted yet.*'}</ReactMarkdown>
          </div>
        )}
        <button className="control-btn" onClick={triggerChronicle}>Generate Chronicle</button>
        {data?.chronicle && (
          <button className="control-btn" onClick={onChronicle}>View Chronicle</button>
        )}
      </div>

      {/* Players */}
      <div className="control-section">
        <div className="control-title">Players</div>
        {(game?.players ?? []).map(p => (
          <div key={p.id} className="player-row">
            <div>
              <div>{characters[p.id]?.name ?? p.id}{p.id === session.playerId ? ' (you)' : ''}</div>
              <div className="player-status">{p.removed ? 'removed' : p.joined ? 'joined' : 'awaiting'}</div>
            </div>
            {!p.is_founder && !p.removed && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn-ghost" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => regenInvite(p.id)}>
                  New Link
                </button>
                <button className="btn-ghost" style={{ fontSize: 12, padding: '4px 8px', color: '#c0392b' }} onClick={() => removePlayer(p.id)}>
                  Remove
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Game health */}
      <div className="control-section">
        <div className="control-title">Game Health</div>
        <div className="health-stat">
          <span>Last GM run</span>
          <strong>{status?.timestamp ? new Date(status.timestamp).toLocaleString() : 'Never'} {status?.success ? '· ✓' : status?.success === false ? '· ✗' : ''}</strong>
        </div>
        <div className="health-stat">
          <span>Pending</span>
          <strong>{(data?.pendingLetters ?? []).length} letter{(data?.pendingLetters ?? []).length !== 1 ? 's' : ''} in transit</strong>
        </div>
        <div className="health-stat">
          <span>Canon size</span>
          <strong>{canonWords.toLocaleString()} words</strong>
        </div>
        <div className="health-stat">
          <span>Next compress</span>
          <strong>at {(data?.game?.engine?.canon_recent_word_limit ?? 4000).toLocaleString()} words</strong>
        </div>
        <div className="health-stat">
          <span>Repo</span>
          <strong>
            <a
              href={`https://github.com/${session.repoOwner}/${session.repoName}`}
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--accent)' }}
            >
              {session.repoName}
            </a>
          </strong>
        </div>
      </div>
    </div>
  );
}
