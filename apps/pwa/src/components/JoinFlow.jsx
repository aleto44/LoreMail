import React, { useState, useEffect } from 'react';
const DEFAULT_EXCERPT = 'The world awaits. A letter has been written for you.';

function EnvelopeSVG({ opening }) {
  return (
    <svg width="140" height="100" viewBox="0 0 140 100" fill="none" style={{ overflow: 'visible' }}>
      {/* Letter lines visible when flap opens */}
      <g style={{
        opacity: opening ? 1 : 0,
        transform: opening ? 'translateY(0)' : 'translateY(10px)',
        transition: 'opacity 0.45s 0.5s ease-out, transform 0.45s 0.5s ease-out',
      }}>
        <rect x="24" y="26" width="92" height="56" rx="2" fill="#faf7f2" stroke="#e0d8cc" strokeWidth="1"/>
        <line x1="32" y1="40" x2="108" y2="40" stroke="#d4c9b4" strokeWidth="1.5"/>
        <line x1="32" y1="50" x2="108" y2="50" stroke="#d4c9b4" strokeWidth="1.5"/>
        <line x1="32" y1="60" x2="84" y2="60" stroke="#d4c9b4" strokeWidth="1.5"/>
      </g>
      {/* Envelope body */}
      <rect x="4" y="32" width="132" height="64" rx="3" fill="#ede8dd" stroke="#d4c9b4" strokeWidth="1.5"/>
      {/* Bottom V folds */}
      <path d="M4 96 L70 58 L136 96" fill="none" stroke="#d4c9b4" strokeWidth="1.2"/>
      {/* Flap + wax seal (animated) */}
      <g style={{
        transformBox: 'fill-box',
        transformOrigin: 'top center',
        transform: opening ? 'perspective(450px) rotateX(-175deg)' : 'perspective(450px) rotateX(0deg)',
        transition: 'transform 0.7s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>
        <path d="M4 32 L70 70 L136 32 Z" fill="#e3ddd0" stroke="#d4c9b4" strokeWidth="1.5"/>
        <circle cx="70" cy="65" r="13" fill="#7a3b1e"/>
        <text x="70" y="70" textAnchor="middle" fontSize="12" fill="#f5f0e8"
          style={{ fontFamily: "'IM Fell English', serif", fontStyle: 'italic' }}>✦</text>
      </g>
    </svg>
  );
}

export function JoinFlow({ gameId, inviteToken, workerUrl, onJoined }) {
  const [step, setStep] = useState('loading'); // loading | splash | letter | form | joining
  const [charName, setCharName] = useState('');
  const [charBio, setCharBio] = useState('');
  const [charLocation, setCharLocation] = useState('');
  const [charGender, setCharGender] = useState('');
  const [error, setError] = useState('');
  const [worldInfo, setWorldInfo] = useState({ worldName: null, seedExcerpt: null, inviteLetter: null });
  const [envelopeOpening, setEnvelopeOpening] = useState(false);

  // Fetch world info via the worker (validates invite token, returns seed excerpt)
  useEffect(() => {
    async function fetchInfo() {
      try {
        const params = new URLSearchParams({ gameId, inviteToken });
        const res = await fetch(`${workerUrl}/game/info?${params}`);
        if (res.ok) {
          const data = await res.json();
          setWorldInfo(data);
        }
      } catch (e) {
        console.warn('Could not fetch world info:', e.message);
      } finally {
        setStep('splash');
      }
    }
    fetchInfo();
  }, [gameId, inviteToken, workerUrl]);

  function handleOpenEnvelope() {
    if (envelopeOpening) return;
    setEnvelopeOpening(true);
    setTimeout(() => setStep('letter'), 750);
  }

  async function handleJoin() {
    if (!charName || !charBio || !charLocation) { setError('Please fill in all three fields.'); return; }
    setStep('joining');
    setError('');
    try {
      const res = await fetch(`${workerUrl}/game/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, inviteToken, characterName: charName, characterBio: charBio, characterLocation: charLocation, characterGender: charGender }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Join failed');
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

  const rawName = worldInfo?.worldName ?? null;
  const name = rawName ? rawName.toUpperCase().split('').join('\u200a') : null;
  const excerpt = worldInfo?.seedExcerpt ?? DEFAULT_EXCERPT;
  const inviteLetter = worldInfo?.inviteLetter ?? null;
  const founderName = worldInfo?.founderName ?? null;

  if (step === 'loading') {
    return (
      <div className="splash">
        <div style={{ fontSize: 32, marginBottom: 16, opacity: 0.5 }}>&#x3004;</div>
      </div>
    );
  }
  if (step === 'joining') {
    return (
      <div className="splash">
        <div style={{ fontSize: 32, marginBottom: 16 }}>&#x3004;</div>
        <div style={{ color: 'var(--faded)', fontStyle: 'italic' }}>Entering the world&hellip;</div>
      </div>
    );
  }
  if (step === 'splash') {
    return (
      <div className="splash">
        {name && <div className="splash-title">{name}</div>}
        <div className="splash-divider" />
        <div className="splash-excerpt">{excerpt}</div>
        <div className="splash-divider" />
        <div
          className={`invite-envelope-wrap${envelopeOpening ? ' is-opening' : ''}`}
          onClick={handleOpenEnvelope}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && handleOpenEnvelope()}
        >
          <EnvelopeSVG opening={envelopeOpening} />
        </div>
        <div className="letter-seal-label">a letter has found you — open it</div>
      </div>
    );
  }
  if (step === 'letter') {
    return (
      <div className="splash invite-letter-splash">
        {name && <div className="splash-title" style={{ fontSize: 16, opacity: 0.55, marginBottom: 0 }}>{name}</div>}
        <div className="splash-divider" style={{ margin: '16px auto' }} />
        <div className="letter-paper invite-letter-paper">
          <div>{inviteLetter ?? DEFAULT_EXCERPT}</div>
          {founderName && (
            <div className="letter-signature" style={{ marginTop: 28 }}>— {founderName}</div>
          )}
        </div>
        <button
          className="btn-primary"
          style={{ maxWidth: 320, width: '100%', marginTop: 24 }}
          onClick={() => setStep('form')}
        >
          Create your character &rarr;
        </button>
      </div>
    );
  }
  // step === 'form'
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
          <div className="field">
            <label>Where are you in the world right now?</label>
            <textarea
              value={charLocation}
              onChange={e => setCharLocation(e.target.value)}
              placeholder="Somewhere on the road between two cities I'd rather not name."
              rows={2}
            />
          </div>
          <div className="field">
            <label>Gender (optional)</label>
            <input
              type="text"
              value={charGender}
              onChange={e => setCharGender(e.target.value)}
              placeholder="e.g. woman, man, non-binary"
            />
          </div>
          {error && <div className="error-msg">{error}</div>}
          <button className="btn-primary" onClick={handleJoin}>Enter the world &rarr;</button>
        </div>
      </div>
    </div>
  );
}