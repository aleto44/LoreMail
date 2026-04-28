import React, { useState, useEffect, useCallback } from 'react';
import { JoinFlow } from './components/JoinFlow.jsx';
import { RestoreFlow } from './components/RestoreFlow.jsx';
import { WorldScreen } from './components/WorldScreen.jsx';
import { LettersScreen } from './components/LettersScreen.jsx';
import { ComposeScreen } from './components/ComposeScreen.jsx';
import { ControlPanel } from './components/ControlPanel.jsx';
import { useGameData } from './hooks/useGameData.js';

const WORKER_URL = import.meta.env.VITE_WORKER_URL ?? 'https://loremail-worker.aleto44.workers.dev';

export default function App() {
  const [session, setSession] = useState(() => {
    try { return JSON.parse(localStorage.getItem('loremail_session')); } catch { return null; }
  });
  const [tab, setTab] = useState('letters');
  const [worldTab, setWorldTab] = useState('world');
  const [composing, setComposing] = useState(false);
  const [readingLetter, setReadingLetter] = useState(null);
  const [showChronicle, setShowChronicle] = useState(false);

  // Check for join flow params
  const params = new URLSearchParams(window.location.search);
  const joinGameId = params.get('game');
  const inviteToken = params.get('invite');

  const saveSession = useCallback((sess) => {
    localStorage.setItem('loremail_session', JSON.stringify(sess));
    setSession(sess);
  }, []);

  const { data, loading, refresh } = useGameData(session);

  // Poll on focus
  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  // ── Auth states ──────────────────────────────────────────
  if (!session) {
    if (joinGameId && inviteToken) {
      return (
        <JoinFlow
          gameId={joinGameId}
          inviteToken={inviteToken}
          workerUrl={WORKER_URL}
          onJoined={saveSession}
        />
      );
    }
    return <RestoreFlow workerUrl={WORKER_URL} onRestored={saveSession} />;
  }

  // ── Compose overlay ──────────────────────────────────────
  if (composing) {
    return (
      <ComposeScreen
        session={session}
        data={data}
        workerUrl={WORKER_URL}
        onSent={() => { setComposing(false); refresh(); }}
        onCancel={() => setComposing(false)}
      />
    );
  }

  // ── Letter reading ────────────────────────────────────────
  if (readingLetter) {
    return (
      <div className="app-shell">
        <div className="screen-content">
          <div className="letter-view">
            <button className="letter-back" onClick={() => setReadingLetter(null)}>←</button>
            <div className="letter-paper">
              <div>{readingLetter.body}</div>
              <div className="letter-signature">{readingLetter.from}</div>
            </div>
            <div className="letter-arrived">{readingLetter.arrivedLabel}</div>
          </div>
        </div>
      </div>
    );
  }

  // ── Chronicle view ────────────────────────────────────────
  if (showChronicle && data?.chronicle) {
    return (
      <div className="app-shell">
        <div className="screen-content">
          <div className="chronicle-view">
            <button className="letter-back" style={{ marginBottom: 24 }} onClick={() => setShowChronicle(false)}>←</button>
            <div className="chronicle-title">{data.game?.name?.toUpperCase()}</div>
            <div className="chronicle-subtitle">A Chronicle</div>
            <hr className="chronicle-divider" />
            <div className="chronicle-body">{data.chronicle}</div>
            <hr className="chronicle-divider" />
            <div className="loremail-mark">L O R E M A I L</div>
          </div>
        </div>
      </div>
    );
  }

  const tabs = ['letters', 'world'];
  if (session.isFounder) tabs.push('control');

  return (
    <div className="app-shell">
      <nav className="tab-bar">
        <button className={tab === 'world' ? 'active' : ''} onClick={() => setTab('world')}>The World</button>
        <button className={tab === 'letters' ? 'active' : ''} onClick={() => setTab('letters')}>Letters</button>
        {session.isFounder && (
          <button className={tab === 'control' ? 'active' : ''} onClick={() => setTab('control')}>⚙ Control</button>
        )}
      </nav>

      <div className="screen-content">
        {tab === 'letters' && (
          <LettersScreen
            session={session}
            data={data}
            loading={loading}
            onReadLetter={setReadingLetter}
          />
        )}
        {tab === 'world' && (
          <WorldScreen
            data={data}
            loading={loading}
            worldTab={worldTab}
            setWorldTab={setWorldTab}
            session={session}
          />
        )}
        {tab === 'control' && session.isFounder && (
          <ControlPanel
            session={session}
            data={data}
            workerUrl={WORKER_URL}
            onRefresh={refresh}
            onChronicle={() => setShowChronicle(true)}
          />
        )}
      </div>

      {tab === 'letters' && (
        <button className="fab" onClick={() => setComposing(true)} title="Compose">✦</button>
      )}
    </div>
  );
}
