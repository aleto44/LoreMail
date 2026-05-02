import { useEffect, useCallback, useRef, useState } from 'react';

const WORKER_URL = import.meta.env.VITE_WORKER_URL ?? 'https://loremail-worker.amix.workers.dev';

/**
 * Convert a base64url string to a Uint8Array — required by pushManager.subscribe()
 * for the applicationServerKey parameter.
 */
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
 * Returns { pushStatus, pushError, retrySubscribe } so the UI can show
 * status and offer a manual enable button.
 *
 * pushStatus values:
 *   'idle'        — not yet attempted
 *   'subscribed'  — fully registered with server
 *   'denied'      — user denied notification permission
 *   'unsupported' — browser / platform doesn't support push
 *   'error'       — something failed (see pushError)
 */
export function usePushNotifications(session) {
  const subscribedRef = useRef(false);
  const [pushStatus, setPushStatus] = useState('idle');
  const [pushError, setPushError] = useState(null);

  const subscribe = useCallback(async () => {
    if (subscribedRef.current) return;
    if (!session?.gameId || !session?.playerId) {
      console.log('[Push] No session yet, skipping');
      return;
    }

    // Feature detection
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
      console.warn('[Push] Notification permission is denied');
      setPushStatus('denied');
      return;
    }

    try {
      console.log('[Push] Waiting for service worker to be ready...');
      const registration = await navigator.serviceWorker.ready;
      console.log('[Push] Service worker ready:', registration.scope);

      console.log('[Push] Fetching VAPID public key...');
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
      console.log('[Push] Got VAPID key ✓');

      let subscription = await registration.pushManager.getSubscription();
      console.log('[Push] Existing subscription:', subscription ? 'yes' : 'none');

      if (!subscription) {
        console.log('[Push] Requesting notification permission...');
        const permission = await Notification.requestPermission();
        console.log('[Push] Permission result:', permission);
        if (permission !== 'granted') {
          setPushStatus('denied');
          return;
        }

        console.log('[Push] Subscribing to push service...');
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
        console.log('[Push] Push subscription created ✓');
      }

      if (!subscription) {
        const msg = 'pushManager.subscribe returned null';
        console.warn('[Push]', msg);
        setPushStatus('error');
        setPushError(msg);
        return;
      }

      console.log('[Push] Registering subscription with Worker...');
      const subJson = subscription.toJSON();
      const res = await fetch(`${WORKER_URL}/push/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId:       session.gameId,
          playerId:     session.playerId,
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
      console.log('[Push] Push notifications subscribed ✓');
    } catch (e) {
      console.warn('[Push] Push subscription failed:', e.message, e);
      setPushStatus('error');
      setPushError(e.message);
    }
  }, [session]);

  // Manual retry — also resets the subscribed guard so it can re-run
  const retrySubscribe = useCallback(() => {
    subscribedRef.current = false;
    setPushStatus('idle');
    setPushError(null);
    subscribe();
  }, [subscribe]);

  useEffect(() => {
    const id = setTimeout(subscribe, 2000);
    return () => clearTimeout(id);
  }, [subscribe]);

  return { pushStatus, pushError, retrySubscribe };
}
