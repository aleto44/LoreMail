import React, { useState, useEffect, useCallback, useRef } from 'react';
import { JoinFlow } from './components/JoinFlow.jsx';
import { RestoreFlow } from './components/RestoreFlow.jsx';
import { WorldScreen } from './components/WorldScreen.jsx';
import { LettersScreen } from './components/LettersScreen.jsx';
import { ComposeScreen } from './components/ComposeScreen.jsx';
import { ControlPanel } from './components/ControlPanel.jsx';
import { NewLetterAnnouncement } from './components/NewLetterAnnouncement.jsx';
import { useGameData } from './hooks/useGameData.js';
import { usePushNotifications } from './hooks/usePushNotifications.js';
import { useLettersBadge } from './hooks/useLettersBadge.js';

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

  // "Press back again to exit" toast
  const [showExitToast, setShowExitToast] = useState(false);
  const exitToastRef = useRef(null);

  // Navigate to a tab and push a history entry so back button works
  const handleSetTab = useCallback((newTab) => {
    setTab(newTab);
    window.history.pushState({ view: 'tab', tab: newTab }, '');
  }, []);

  // Handle Android back button
  useEffect(() => {
    // Tag the page-load entry with our initial state, then push a guard
    // so the first back press doesn't immediately exit the app.
    window.history.replaceState({ view: 'tab', tab: 'letters' }, '');
    window.history.pushState({ view: 'tab', tab: 'letters' }, '');

    const handlePopState = (e) => {
      const state = e.state;

      if (!state || !state.view) {
        // Below our history floor — prevent exit, show toast
        window.history.pushState({ view: 'tab', tab: 'letters' }, '');
        setTab('letters');
        setComposing(false);
        setReadingLetter(null);
        setShowChronicle(false);
        setShowExitToast(true);
        clearTimeout(exitToastRef.current);
        exitToastRef.current = setTimeout(() => setShowExitToast(false), 2000);
        return;
      }

      if (state.view === 'tab') {
        setTab(state.tab ?? 'letters');
        setComposing(false);
        setReadingLetter(null);
        setShowChronicle(false);
      } else if (state.view === 'reading') {
        setReadingLetter(state.letter || null);
        setComposing(false);
        setShowChronicle(false);
      } else if (state.view === 'chronicle') {
        setShowChronicle(true);
        setComposing(false);
        setReadingLetter(null);
      } else if (state.view === 'composing') {
        setComposing(true);
        setReadingLetter(null);
        setShowChronicle(false);
      } else {
        setComposing(false);
        setReadingLetter(null);
        setShowChronicle(false);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      clearTimeout(exitToastRef.current);
    };
  }, []);

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

  // Unread-letter badge (app icon + tab indicator)
  const { unreadCount, newLetters, markLettersSeen } = useLettersBadge(session, data?.deliveredLetters);

  // ── New-letter announcement ───────────────────────────────
  const [announcementDismissed, setAnnouncementDismissed] = useState(false);
  const lastAnnouncedUnreadRef = useRef(0);

  // Show (or re-show) announcement whenever the unread count rises
  useEffect(() => {
    if (unreadCount > 0 && unreadCount !== lastAnnouncedUnreadRef.current) {
      lastAnnouncedUnreadRef.current = unreadCount;
      setAnnouncementDismissed(false);
    }
    if (unreadCount === 0) {
      lastAnnouncedUnreadRef.current = 0;
    }
  }, [unreadCount]);

  const showAnnouncement =
    unreadCount > 0 &&
    !announcementDismissed &&
    !composing &&
    !readingLetter &&
    !showChronicle;

  // Mark letters seen when on letters tab — but only AFTER the announcement
  // has been acknowledged (or there is nothing new to announce). Without this
  // guard, the effect runs immediately on mount (default tab is 'letters') and
  // kills the announcement before it ever renders.
  useEffect(() => {
    if (tab === 'letters' && (unreadCount === 0 || announcementDismissed)) {
      markLettersSeen();
    }
  }, [tab, unreadCount, announcementDismissed, markLettersSeen]);

  // Register push notifications silently in the background
  usePushNotifications(session);

   // Poll on focus
   useEffect(() => {
     const onFocus = () => refresh();
     window.addEventListener('focus', onFocus);
     return () => window.removeEventListener('focus', onFocus);
   }, [refresh]);

   // Wrapper for opening letters to push history
   const handleReadLetter = useCallback((letter) => {
     setReadingLetter(letter);
     window.history.pushState({ view: 'reading', letter }, '');
   }, []);

   // Wrapper for opening chronicle to push history
   const handleShowChronicle = useCallback(() => {
     setShowChronicle(true);
     window.history.pushState({ view: 'chronicle' }, '');
   }, []);

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
           window.history.back();
           // Do NOT call refresh() here — GitHub's API can lag a few hundred ms
           // after a successful commit, so an immediate read would race and
           // overwrite the optimistic state with stale data.
           // The focus-event listener in useEffect will sync when the user next
           // switches away and back, by which point GitHub is fully consistent.
         }}
         onCancel={() => {
           setComposing(false);
           window.history.back();
         }}
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
             <button className="letter-back" onClick={() => {
               setReadingLetter(null);
               window.history.back();
             }}>←</button>
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
             <button className="letter-back" style={{ marginBottom: 24 }} onClick={() => {
               setShowChronicle(false);
               window.history.back();
             }}>←</button>
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
        <button className={tab === 'world' ? 'active' : ''} onClick={() => handleSetTab('world')}>The World</button>
        <button className={tab === 'letters' ? 'active' : ''} onClick={() => handleSetTab('letters')}>
          Letters{unreadCount > 0 && <span className="tab-badge">{unreadCount}</span>}
        </button>
        {session.isFounder && (
          <button className={tab === 'control' ? 'active' : ''} onClick={() => handleSetTab('control')}>⚙ Control</button>
        )}
      </nav>

      {/* Android back button exit toast */}
      {showExitToast && (
        <div className="exit-toast">Press back again to exit</div>
      )}

      <div className="screen-content">
         {tab === 'letters' && (
           <LettersScreen
             session={session}
             data={data}
             loading={loading}
             onReadLetter={handleReadLetter}
             newLetters={newLetters}
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
             onChronicle={handleShowChronicle}
           />
         )}
      </div>

       {tab === 'letters' && (
         <button className="fab" onClick={() => {
           setComposing(true);
           window.history.pushState({ view: 'composing' }, '');
         }} title="Compose">✦</button>
       )}

       {/* New-letter arrival announcement */}
       {showAnnouncement && (
         <NewLetterAnnouncement
           newLetters={newLetters}
           data={data}
           onOpen={() => {
             setAnnouncementDismissed(true);
             markLettersSeen();
             handleSetTab('letters');
           }}
           onDismiss={() => {
             setAnnouncementDismissed(true);
             markLettersSeen();
           }}
         />
       )}
     </div>
   );
}
