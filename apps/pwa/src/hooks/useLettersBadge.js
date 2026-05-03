import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * useLettersBadge
 *
 * Tracks unread delivered letters and keeps the PWA app-icon badge in sync.
 *
 * Storage key: `last_seen_letters_<gameId>` — unix timestamp written when
 * markLettersSeen() is called.
 *
 * Returns:
 *   unreadCount     — drops to 0 when markLettersSeen() is called (state-driven)
 *   newLetters      — frozen at first data load; used for per-letter highlights
 *                     and is NOT wiped by markLettersSeen()
 *   markLettersSeen — call this when the user has actually opened the Letters tab
 */
export function useLettersBadge(session, deliveredLetters) {
  const gameId   = session?.gameId;
  const playerId = session?.playerId;
  const key = gameId ? `last_seen_letters_${gameId}` : null;

  // Read once at mount and freeze — determines which letters were "new" on entry
  const lastSeenAtMount = useRef(
    key ? (parseInt(localStorage.getItem(key) ?? '0', 10) || 0) : 0,
  );

  // newLetters: frozen at the first render that has deliveredLetters.
  // Subsequent markLettersSeen() calls do NOT affect this — highlights persist
  // until the user reloads / re-mounts.
  const newLettersFrozenRef = useRef(null);
  if (newLettersFrozenRef.current === null && deliveredLetters != null) {
    newLettersFrozenRef.current = deliveredLetters.filter(
      l => l.to === playerId && l.deliverAt > lastSeenAtMount.current,
    );
  }
  const newLetters = newLettersFrozenRef.current ?? [];

  // seen: becomes true when markLettersSeen() is called.
  // unreadCount is derived from it so a single setState zeroes the badge
  // without mutating the frozen newLetters array.
  const [seen, setSeen] = useState(false);
  const unreadCount = seen ? 0 : newLetters.length;

  // Keep the app-icon badge in sync whenever unread count changes
  useEffect(() => {
    if (!('setAppBadge' in navigator)) return;
    if (unreadCount > 0) {
      navigator.setAppBadge(unreadCount).catch(() => {});
    } else {
      navigator.clearAppBadge().catch(() => {});
    }
  }, [unreadCount]);

  const markLettersSeen = useCallback(() => {
    if (!key) return;
    const now = Math.floor(Date.now() / 1000);
    localStorage.setItem(key, String(now));
    setSeen(true);
    if ('clearAppBadge' in navigator) {
      navigator.clearAppBadge().catch(() => {});
    }
  }, [key]);

  return { unreadCount, newLetters, markLettersSeen };
}