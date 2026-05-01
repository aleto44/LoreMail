import { useRef } from 'react';

/**
 * Tracks the "last seen" timestamp for lore content, keyed by gameId.
 * - lastSeen is read once at mount and frozen for the session (badges stay
 *   visible until next app open, per spec).
 * - After 30 s on the lore panel, writes the current time to localStorage
 *   so badges are gone on the NEXT open.
 */
export function useLastSeen(gameId) {
  const key = gameId ? `last_seen_${gameId}` : null;

  // Read once at mount — stays frozen for this session
  const lastSeenRef = useRef(
    key ? (parseInt(localStorage.getItem(key) ?? '0', 10) || 0) : 0,
  );

  const timerRef = useRef(null);

  function startSeenTimer() {
    if (timerRef.current || !key) return;
    timerRef.current = setTimeout(() => {
      const now = Math.floor(Date.now() / 1000);
      localStorage.setItem(key, String(now));
      timerRef.current = null;
      // Intentionally do NOT update lastSeenRef — badges stay gone next session
    }, 30_000);
  }

  function cancelSeenTimer() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  return { lastSeen: lastSeenRef.current, startSeenTimer, cancelSeenTimer };
}
