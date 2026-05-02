import React, { useState, useEffect, useCallback } from 'react';
import { JoinFlow } from './components/JoinFlow.jsx';
import { RestoreFlow } from './components/RestoreFlow.jsx';
import { WorldScreen } from './components/WorldScreen.jsx';
import { LettersScreen } from './components/LettersScreen.jsx';
import { ComposeScreen } from './components/ComposeScreen.jsx';
import { ControlPanel } from './components/ControlPanel.jsx';
import { useGameData } from './hooks/useGameData.js';
import { usePushNotifications } from './hooks/usePushNotifications.js';

const WORKER_URL = import.meta.env.VITE_WORKER_URL ?? 'https://loremail-worker.amix.workers.dev';

export default function App() {
  const [session, setSession] = useState(() => {
    try { return JSON.parse(localStorage.getItem('loremail_session')); } catch { return null; }
  });
  const [tab, setTab] = useState('letters');
  const [worldTab, setWorldTab] = useState('world');
  const [composing, setComposing] = useState(false);
  const [readingLetter, setReadingLetter] = useState(null);
  const [showChronicle, setShowChronicle] = useState(false);

  // Remaining post-join refresh attempts (counts down to 0)
  const [joinPollsLeft, setJoinPollsLeft] = useState(0);

  // Check for join flow params
  const params = new URLSearchParams(window.location.search);
  const joinGameId = params.get('game');
  const inviteToken = params.get('invite');

  const saveSession = useCallback((sess) => {
    localStorage.setItem('loremail_session', JSON.stringify(sess));
    setSession(sess);
  }, []);

  const { data, loading, refresh, patchData } = useGameData(session);

  // Register push notifications once the player has a session
  usePushNotifications(session);

  // Poll on focus
  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  // ── Post-join smart polling ───────────────────────────────
  // After a player joins, retry every 3 s until their first letter appears
  // (the worker / GitHub CI can take a few seconds to commit it).
  useEffect(() => {
    if (joinPollsLeft <= 0) return;
    // Stop early if data already has letters
    if (data?.deliveredLetters?.length > 0 || data?.pendingLetters?.length > 0) {
      setJoinPollsLeft(0);
      return;
    }
    const id = setTimeout(async () => {
      await refresh();
      setJoinPollsLeft(n => Math.max(0, n - 1));
    }, 3000);
    return () => clearTimeout(id);
  }, [joinPollsLeft, data, refresh]);

  // ── Auth states ──────────────────────────────────────────
  // Always show JoinFlow for invite links — even if the user has an existing
  // session from a different game, the invite link must take priority.
  if (joinGameId && inviteToken) {
    return (
      <JoinFlow
        gameId={joinGameId}
        inviteToken={inviteToken}
        workerUrl={WORKER_URL}
        onJoined={(sess) => {
          saveSession(sess);
          // Start polling so the welcome letter appears as soon as the
          // worker/CI finishes committing it (up to 8 retries × 3 s = 24 s).
          setJoinPollsLeft(8);
        }}
      />
    );
  }

  // If the URL specifies a game ID that doesn't match the stored session, force
  // re-authentication so the founder can log into the newly created game.
  if (joinGameId && session?.gameId && session.gameId !== joinGameId) {
    return <RestoreFlow workerUrl={WORKER_URL} onRestored={saveSession} />;
  }

  if (!session) {
    return <RestoreFlow workerUrl={WORKER_URL} onRestored={saveSession} />;
  }

  // ── Compose overlay ──────────────────────────────────────
  if (composing) {
    return (
      <ComposeScreen
        session={session}
        data={data}
        onSent={(newLetter) => {
          // Optimistically inject the sent letter into the pending list so
          // "In Transit" appears instantly without any network round-trip.
          if (newLetter) {
            patchData(d => ({
              ...d,
              pendingLetters: [...(d?.pendingLetters ?? []), newLetter],
            }));
          }
          setComposing(false);
          // Do NOT call refresh() here — GitHub's API can lag a few hundred ms
          // after a successful commit, so an immediate read would race and
          // overwrite the optimistic state with stale data.
          // The focus-event listener in useEffect will sync when the user next
          // switches away and back, by which point GitHub is fully consistent.
        }}
        onCancel={() => setComposing(false)}
      />
    );
  }

  // ── Letter reading ────────────────────────────────────────
  if (readingLetter) {
    const senderName =
      data?.characters?.[readingLetter.from]?.name ?? readingLetter.from;
    const isSent = readingLetter.from === session.playerId;
    return (
      <div className="app-shell">
        <div className="screen-content">
          <div className="letter-view">
            <button className="letter-back" onClick={() => setReadingLetter(null)}>←</button>
            <div className="letter-paper">
              {isSent && (
                <div className="letter-meta-header">
                  to {data?.characters?.[readingLetter.to]?.name ?? readingLetter.to}
                </div>
              )}
              <div>{readingLetter.body}</div>
              <div className="letter-signature">{senderName}</div>
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
            onRefresh={refresh}
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
