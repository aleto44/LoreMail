import { useEffect, useCallback, useRef, useState } from 'react';
const WORKER_URL = import.meta.env.VITE_WORKER_URL ?? 'https://loremail-worker.amix.workers.dev';
function urlBase64ToUint8Array(base64url) {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
/**
 * usePushNotifications
 *
 * Returns { pushStatus, pushError, retrySubscribe, sendTestNotification }
 *
 * pushStatus: 'idle' | 'subscribed' | 'denied' | 'unsupported' | 'error'
 *
 * retrySubscribe: force-unsubscribes any stale browser subscription first,
 * then creates a fresh one and re-registers with the Worker.
 */
export function usePushNotifications(session) {
  const subscribedRef = useRef(false);
  const [pushStatus, setPushStatus] = useState('idle');
  const [pushError, setPushError] = useState(null);
  const subscribe = useCallback(async (forceRefresh = false) => {
    if (subscribedRef.current && !forceRefresh) return;
    if (!session?.gameId || !session?.playerId) {
      console.log('[Push] No session yet, skipping');
      return;
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('[Push] serviceWorker or PushManager not supported');
      setPushStatus('unsupported');
      return;
    }
    if (!('Notification' in window)) {
      console.warn('[Push] Notification API not supported');
      setPushStatus('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      console.warn('[Push] Permission denied');
      setPushStatus('denied');
      return;
    }
    try {
      console.log('[Push] Waiting for service worker...');
      const registration = await navigator.serviceWorker.ready;
      console.log('[Push] SW ready:', registration.scope);
      console.log('[Push] Fetching VAPID key...');
      const keyRes = await fetch(`${WORKER_URL}/push/vapid-key`);
      if (!keyRes.ok) {
        const msg = `VAPID key fetch failed: ${keyRes.status}`;
        console.warn('[Push]', msg);
        setPushStatus('error');
        setPushError(msg);
        return;
      }
      const { publicKey } = await keyRes.json();
      if (!publicKey) {
        const msg = 'No publicKey in VAPID response';
        console.warn('[Push]', msg);
        setPushStatus('error');
        setPushError(msg);
        return;
      }
      let subscription = await registration.pushManager.getSubscription();
      // Force-refresh: unsubscribe the old (potentially dead) subscription first
      if (forceRefresh && subscription) {
        console.log('[Push] Force-refresh: unsubscribing old subscription...');
        await subscription.unsubscribe();
        subscription = null;
      }
      if (!subscription) {
        console.log('[Push] Requesting permission...');
        const permission = await Notification.requestPermission();
        console.log('[Push] Permission:', permission);
        if (permission !== 'granted') {
          setPushStatus('denied');
          return;
        }
        console.log('[Push] Creating new subscription...');
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
        console.log('[Push] Subscribed to push service');
      } else {
        console.log('[Push] Reusing existing browser subscription');
      }
      if (!subscription) {
        const msg = 'pushManager.subscribe returned null';
        console.warn('[Push]', msg);
        setPushStatus('error');
        setPushError(msg);
        return;
      }
      console.log('[Push] Registering with Worker...');
      const subJson = subscription.toJSON();
      const res = await fetch(`${WORKER_URL}/push/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId:   session.gameId,
          playerId: session.playerId,
          subscription: subJson,
        }),
      });
      if (!res.ok) {
        const msg = `Worker subscribe failed: ${res.status}`;
        console.warn('[Push]', msg);
        setPushStatus('error');
        setPushError(msg);
        return;
      }
      subscribedRef.current = true;
      setPushStatus('subscribed');
      setPushError(null);
      console.log('[Push] Push notifications active');
    } catch (e) {
      console.warn('[Push] Failed:', e.message, e);
      setPushStatus('error');
      setPushError(e.message);
    }
  }, [session]);
  // Soft retry — keeps existing browser subscription but re-registers with Worker
  const retrySubscribe = useCallback(() => {
    subscribedRef.current = false;
    setPushStatus('idle');
    setPushError(null);
    subscribe(false);
  }, [subscribe]);
  // Hard retry — unsubscribes existing browser subscription and creates a brand new one
  const forceResubscribe = useCallback(() => {
    subscribedRef.current = false;
    setPushStatus('idle');
    setPushError(null);
    subscribe(true);
  }, [subscribe]);
  const sendTestNotification = useCallback(async () => {
    if (!session?.gameId || !session?.playerId) return { ok: false, error: 'No session' };
    try {
      const res = await fetch(`${WORKER_URL}/push/self-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: session.gameId, playerId: session.playerId }),
      });
      const data = await res.json();
      console.log('[Push] Self-test result:', data);
      // If subscription expired, auto-trigger a hard re-subscribe
      if (res.status === 410 || data.error?.includes('expired')) {
        console.warn('[Push] Subscription expired — forcing fresh subscription...');
        setTimeout(() => forceResubscribe(), 500);
      }
      return data;
    } catch (e) {
      console.warn('[Push] Self-test failed:', e.message);
      return { ok: false, error: e.message };
    }
  }, [session, forceResubscribe]);
  useEffect(() => {
    const id = setTimeout(() => subscribe(false), 2000);
    return () => clearTimeout(id);
  }, [subscribe]);
  return { pushStatus, pushError, retrySubscribe, forceResubscribe, sendTestNotification };
}
