import React, { useState } from 'react';

export function RestoreFlow({ workerUrl, onRestored }) {
  const [gameId, setGameId] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleRestore() {
    if (!gameId || !passphrase) { setError('Enter both fields.'); return; }
    setLoading(true);
    setError('');
    try {
      const url = `${workerUrl}/game/player?gameId=${encodeURIComponent(gameId)}&passphrase=${encodeURIComponent(passphrase)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Restore failed');
      onRestored({
        githubToken: data.githubToken,
        playerId: data.playerId,
        characterName: data.characterName,
        isFounder: data.isFounder,
        repoOwner: data.repoOwner,
        repoName: data.repoName,
        gameId,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <div className="screen-content">
        <div className="auth-form">
          <div style={{ textAlign: 'center', marginBottom: 32, marginTop: 40 }}>
            <div style={{ fontFamily: "'IM Fell English', serif", letterSpacing: '0.25em', fontSize: 20 }}>
              L O R E M A I L
            </div>
          </div>
          <h2>Restore your session</h2>
          <p style={{ color: 'var(--faded)', fontSize: 13, marginBottom: 20 }}>
            Enter your game ID and passphrase to continue where you left off.
          </p>
          <div className="field">
            <label>Game ID</label>
            <input
              type="text"
              value={gameId}
              onChange={e => setGameId(e.target.value)}
              placeholder="crumbling-empire-x7k2p"
            />
          </div>
          <div className="field">
            <label>Passphrase</label>
            <input
              type="text"
              value={passphrase}
              onChange={e => setPassphrase(e.target.value)}
              placeholder="wolf · runs · midnight"
            />
          </div>
          {error && <div className="error-msg">{error}</div>}
          <button className="btn-primary" onClick={handleRestore} disabled={loading}>
            {loading ? 'Restoring…' : 'Continue →'}
          </button>
          <p style={{ marginTop: 16, fontSize: 12, color: 'var(--faded)', textAlign: 'center' }}>
            New player? Open the invite link your founder sent you.
          </p>
        </div>
      </div>
    </div>
  );
}
