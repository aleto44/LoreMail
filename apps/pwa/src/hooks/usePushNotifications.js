import { useEffect, useCallback, useRef } from 'react';

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
 * Registers the service worker, requests push permission, subscribes to
 * the browser's push service, and sends the subscription to the Loremail
 * Worker so it can fire notifications when new letters arrive.
 *
 * Called once after the player has a session.  Silently no-ops if:
 *  - The browser doesn't support service workers / Push API
 *  - The user denies notification permission
 *  - VAPID keys aren't configured on the server
 */
export function usePushNotifications(session) {
  // Prevent double-subscribing in StrictMode / multiple renders
  const subscribedRef = useRef(false);

  const subscribe = useCallback(async () => {
    if (subscribedRef.current) return;
    if (!session?.gameId || !session?.playerId) return;

    // Feature detection
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (!('Notification' in window)) return;

    // Don't pester users who already denied
    if (Notification.permission === 'denied') return;

    try {
      // Wait for the service worker to be ready
      const registration = await navigator.serviceWorker.ready;

      // Fetch the VAPID public key from the Worker
      const keyRes = await fetch(`${WORKER_URL}/push/vapid-key`);
      if (!keyRes.ok) return; // VAPID not configured — fail silently

      const { publicKey } = await keyRes.json();
      if (!publicKey) return;

      // Check if we already have a valid subscription
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        // Ask for permission first (required on iOS)
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;

        // Subscribe
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      if (!subscription) return;

      // Register the subscription with our Worker
      const subJson = subscription.toJSON();
      await fetch(`${WORKER_URL}/push/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId:       session.gameId,
          playerId:     session.playerId,
          subscription: subJson,
        }),
      });

      subscribedRef.current = true;
      console.log('[LoreMail] Push notifications subscribed ✓');
    } catch (e) {
      // Non-fatal — the app works fine without notifications
      console.warn('[LoreMail] Push subscription failed:', e.message);
    }
  }, [session]);

  useEffect(() => {
    // Small delay so it doesn't race the service worker installation
    const id = setTimeout(subscribe, 2000);
    return () => clearTimeout(id);
  }, [subscribe]);
}
