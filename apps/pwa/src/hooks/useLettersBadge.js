import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * useLettersBadge
 *
 * Tracks unread delivered letters and keeps the PWA app-icon badge in sync.
 *
 * Storage keys (both scoped to gameId):
 *   read_letters_<gameId>           — JSON array of letter IDs opened on this device (primary)
 *   last_seen_letters_<gameId>      — unix timestamp watermark (kept for migration bootstrap only)
 *   read_receipts_queue_<gameId>    — write-ahead queue of IDs pending background sync to server
 *
 * Returns:
 *   unreadCount     — reactive count; drops as letters are read / all marked seen
 *   newLetters      — reactive array; shrinks as individual letters are read
 *   readIds         — full Set of read letter IDs (for persistent open-envelope visual)
 *   markLetterRead  — call with a letter id when the user opens that letter
 *   markLettersSeen — call to bulk-clear all new letters (e.g. announcement "Open")
 */
export function useLettersBadge(session, deliveredLetters, serverReadIds, workerUrl) {
  const gameId   = session?.gameId;
  const playerId = session?.playerId;
  const seenKey  = gameId ? `last_seen_letters_${gameId}` : null;
  const readKey  = gameId ? `read_letters_${gameId}` : null;
  const queueKey = gameId ? `read_receipts_queue_${gameId}` : null;

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

  // A letter is unread if its ID is simply not in readIds.
  const newLetters = deliveredLetters
    ? deliveredLetters.filter(l => l.to === playerId && !readIds.has(l.id))
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

  // ── Background sync ──────────────────────────────────────────────────
  const syncTimerRef = useRef(null);

  const syncToServer = useCallback(async () => {
    if (!queueKey || !workerUrl || !session?.githubToken) return;
    const queued = JSON.parse(localStorage.getItem(queueKey) ?? '[]');
    if (queued.length === 0) return;
    try {
      const res = await fetch(`${workerUrl}/letters/read-receipts`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.githubToken}`,
        },
        body: JSON.stringify({
          gameId: session.gameId,
          playerId: session.playerId,
          readIds: queued,
        }),
      });
      if (res.ok && queueKey) localStorage.removeItem(queueKey);
    } catch { /* non-fatal — queue items stay for retry */ }
  }, [queueKey, workerUrl, session]);

  // On mount — retry any queue left from last session
  useEffect(() => {
    if (!queueKey || !workerUrl) return;
    const queued = JSON.parse(localStorage.getItem(queueKey) ?? '[]');
    if (queued.length > 0) syncToServer(); // fire-and-forget
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Merge server state when it arrives ──────────────────────────────
  useEffect(() => {
    if (serverReadIds === undefined || serverReadIds.size === 0) return;
    setReadIds(prev => {
      const hasNew = [...serverReadIds].some(id => !prev.has(id));
      if (!hasNew) return prev;
      const merged = new Set([...prev, ...serverReadIds]);
      if (readKey) localStorage.setItem(readKey, JSON.stringify([...merged]));
      return merged;
    });
  }, [serverReadIds, readKey]);

  // ── Bootstrap for ongoing games (watermark → readIds, one-time) ─────
  // When serverReadIds is undefined (file 404'd), seed readIds from letters
  // already behind the old watermark so they don't flash as unread.
  useEffect(() => {
    if (serverReadIds !== undefined) return; // file exists — no bootstrap needed
    if (!deliveredLetters?.length) return;
    const watermark = seenKey
      ? (parseInt(localStorage.getItem(seenKey) ?? '0', 10) || 0)
      : 0;
    if (watermark === 0) return;
    const alreadySeen = deliveredLetters
      .filter(l => l.to === playerId && l.deliverAt <= watermark)
      .map(l => l.id);
    if (alreadySeen.length === 0) return;
    setReadIds(prev => {
      const hasNew = alreadySeen.some(id => !prev.has(id));
      if (!hasNew) return prev;
      const merged = new Set([...prev, ...alreadySeen]);
      if (readKey) localStorage.setItem(readKey, JSON.stringify([...merged]));
      return merged;
    });
    // These IDs will be written to the server on the next sync triggered by a real letter open.
  }, [serverReadIds, deliveredLetters, playerId, seenKey, readKey]);

  // ── markLetterRead — add to sync queue and debounce sync ────────────
  const markLetterRead = useCallback((letterId) => {
    if (!readKey || !letterId) return;
    setReadIds(prev => {
      if (prev.has(letterId)) return prev;
      const next = new Set(prev);
      next.add(letterId);
      localStorage.setItem(readKey, JSON.stringify([...next]));
      // Add to sync queue
      if (queueKey) {
        const q = new Set(JSON.parse(localStorage.getItem(queueKey) ?? '[]'));
        q.add(letterId);
        localStorage.setItem(queueKey, JSON.stringify([...q]));
      }
      return next;
    });
    // Debounced background sync
    clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(syncToServer, 2000);
  }, [readKey, queueKey, syncToServer]);

  // ── markLettersSeen — bulk-mark all current newLetters as read ───────
  const markLettersSeen = useCallback(() => {
    const idsToMark = newLetters.map(l => l.id);
    if (idsToMark.length === 0) return;
    setReadIds(prev => {
      const next = new Set([...prev, ...idsToMark]);
      if (readKey) localStorage.setItem(readKey, JSON.stringify([...next]));
      // Add bulk to sync queue
      if (queueKey) {
        const q = new Set(JSON.parse(localStorage.getItem(queueKey) ?? '[]'));
        idsToMark.forEach(id => q.add(id));
        localStorage.setItem(queueKey, JSON.stringify([...q]));
      }
      return next;
    });
    clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(syncToServer, 2000);
    if ('clearAppBadge' in navigator) navigator.clearAppBadge().catch(() => {});
  }, [newLetters, readKey, queueKey, syncToServer]);

  return { unreadCount, newLetters, readIds, markLetterRead, markLettersSeen };
}