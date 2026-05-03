import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * useLettersBadge
 *
 * Tracks unread delivered letters and keeps the PWA app-icon badge in sync.
 *
 * Storage keys (both scoped to gameId):
 *   last_seen_letters_<gameId>  — unix timestamp; updated by markLettersSeen()
 *   read_letters_<gameId>       — JSON array of letter IDs the user has opened;
 *                                 lets us remove highlights one-by-one and
 *                                 survive page refreshes without re-showing
 *                                 already-read letters.
 *
 * Returns:
 *   unreadCount     — reactive count; drops as letters are read / all marked seen
 *   newLetters      — reactive array; shrinks as individual letters are read
 *   markLetterRead  — call with a letter id when the user opens that letter
 *   markLettersSeen — call to bulk-clear all new letters (e.g. announcement "Open")
 */
export function useLettersBadge(session, deliveredLetters) {
  const gameId   = session?.gameId;
  const playerId = session?.playerId;
  const seenKey = gameId ? `last_seen_letters_${gameId}` : null;
  const readKey = gameId ? `read_letters_${gameId}` : null;

  // Coarse "seen" timestamp — read from localStorage once at mount.
  // Updated (in-memory + localStorage) by markLettersSeen().
  const lastSeenRef = useRef(
    seenKey ? (parseInt(localStorage.getItem(seenKey) ?? '0', 10) || 0) : 0,
  );

  // Fine-grained per-letter read IDs — persisted so highlights don't
  // reappear after a page refresh.
  const [readIds, setReadIds] = useState(() => {
    if (!readKey) return new Set();
    try {
      const stored = JSON.parse(localStorage.getItem(readKey) ?? '[]');
      return new Set(Array.isArray(stored) ? stored : []);
    } catch {
      return new Set();
    }
  });

  // newLetters: letters delivered after lastSeen that haven't been read yet.
  // Reactive — shrinks one-by-one as markLetterRead() is called.
  const newLetters = deliveredLetters
    ? deliveredLetters.filter(
        l => l.to === playerId &&
             l.deliverAt > lastSeenRef.current &&
             !readIds.has(l.id),
      )
    : [];

  const unreadCount = newLetters.length;

  // Keep the app-icon badge in sync
  useEffect(() => {
    if (!('setAppBadge' in navigator)) return;
    if (unreadCount > 0) {
      navigator.setAppBadge(unreadCount).catch(() => {});
    } else {
      navigator.clearAppBadge().catch(() => {});
    }
  }, [unreadCount]);

  // Mark a single letter as read — removes its highlight immediately and
  // persists the decision so it survives a refresh.
  const markLetterRead = useCallback((letterId) => {
    if (!readKey || !letterId) return;
    setReadIds(prev => {
      if (prev.has(letterId)) return prev; // already read, no-op
      const next = new Set(prev);
      next.add(letterId);
      localStorage.setItem(readKey, JSON.stringify([...next]));
      return next;
    });
  }, [readKey]);

  // Bulk-clear: advance the coarse timestamp to "now" and wipe the individual
  // read set (no longer needed once all letters are behind the new watermark).
  const markLettersSeen = useCallback(() => {
    if (!seenKey) return;
    const now = Math.floor(Date.now() / 1000);
    localStorage.setItem(seenKey, String(now));
    lastSeenRef.current = now;
    if (readKey) localStorage.removeItem(readKey);
    setReadIds(new Set());
    if ('clearAppBadge' in navigator) {
      navigator.clearAppBadge().catch(() => {});
    }
  }, [seenKey, readKey]);

  return { unreadCount, newLetters, markLetterRead, markLettersSeen };
}