import React, { useState } from 'react';

export function JoinFlow({ gameId, inviteToken, workerUrl, onJoined }) {
  const [step, setStep] = useState('splash'); // splash | form | loading
  const [charName, setCharName] = useState('');
  const [charBio, setCharBio] = useState('');
  const [error, setError] = useState('');
  const [worldInfo, setWorldInfo] = useState(null);

  // Fetch world excerpt on mount
  React.useEffect(() => {
    fetch(`https://api.github.com`)
      .catch(() => {})
      .finally(() => setStep('splash'));
  }, []);

  async function handleJoin() {
    if (!charName || !charBio) { setError('Please fill in both fields.'); return; }
    setStep('loading');
    setError('');
    try {
      const res = await fetch(`${workerUrl}/game/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, inviteToken, characterName: charName, characterBio: charBio }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Join failed');
      // Clear URL params
      window.history.replaceState({}, '', '/');
      onJoined({
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
      setStep('form');
    }
  }

  if (step === 'loading') {
    return (
      <div className="splash">
        <div style={{ fontSize: 32, marginBottom: 16 }}>〄</div>
        <div style={{ color: 'var(--faded)', fontStyle: 'italic' }}>Entering the world…</div>
      </div>
    );
  }

  if (step === 'splash') {
    return (
      <div className="splash">
        <div className="splash-title">A letter awaits</div>
        <div className="splash-divider" />
        <div className="splash-excerpt">
          The empire does not fall at once.<br />
          It retreats, road by road, into<br />
          the memory of those who walked<br />
          them when the maps were true.
        </div>
        <div className="letter-seal" onClick={() => setStep('form')}>〄</div>
        <div className="letter-seal-label">tap to open</div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="screen-content">
        <div className="auth-form">
          <h2>Who are you in this world?</h2>
          <div className="field">
            <label>Your name in this world</label>
            <input
              type="text"
              value={charName}
              onChange={e => setCharName(e.target.value)}
              placeholder="Callum Reed"
            />
          </div>
          <div className="field">
            <label>Who are you, in one sentence?</label>
            <textarea
              value={charBio}
              onChange={e => setCharBio(e.target.value)}
              placeholder="A former guild enforcer who stopped enforcing."
              rows={2}
            />
          </div>
          {error && <div className="error-msg">{error}</div>}
          <button className="btn-primary" onClick={handleJoin}>Enter the world →</button>
        </div>
      </div>
    </div>
  );
}
