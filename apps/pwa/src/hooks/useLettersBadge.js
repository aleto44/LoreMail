import { useEffect, useRef, useCallback } from 'react';

/**
 * useLettersBadge
 *
 * Tracks unread delivered letters (received since last time the Letters tab
 * was viewed) and keeps the PWA app-icon badge in sync via the Badge API.
 *
 * Storage key: `last_seen_letters_<gameId>` — unix timestamp, written when
 * markLettersSeen() is called.
 *
 * Returns:
 *   unreadCount     — number of delivered letters newer than lastSeen
 *   markLettersSeen — call this when the user opens the Letters tab
 */
export function useLettersBadge(session, deliveredLetters) {
  const gameId  = session?.gameId;
  const playerId = session?.playerId;
  const key = gameId ? `last_seen_letters_${gameId}` : null;

  // Read once at mount and freeze — badge stays until next session per spec
  const lastSeenRef = useRef(
    key ? (parseInt(localStorage.getItem(key) ?? '0', 10) || 0) : 0,
  );

  const unreadCount = deliveredLetters
    ? deliveredLetters.filter(
        l => l.to === playerId && l.deliverAt > lastSeenRef.current,
      ).length
    : 0;

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
    lastSeenRef.current = now;
    if ('clearAppBadge' in navigator) {
      navigator.clearAppBadge().catch(() => {});
    }
  }, [key]);

  return { unreadCount, markLettersSeen };
}
