/**
 * sw.js — Loremail PWA Service Worker
 *
 * Handles:
 *  1. Asset precaching (injected by vite-plugin-pwa / Workbox)
 *  2. Web Push notification display
 *  3. Notification click → open / focus the app
 */
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';

// Precache all build assets (manifest injected at build time by vite-plugin-pwa)
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// ─── Push Events ─────────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { body: event.data?.text() ?? '' };
  }

  const title   = data.title ?? 'New letter in Loremail';
  const options = {
    body:      data.body  ?? 'A new letter has arrived. Open Loremail to read it.',
    icon:      '/LoreMail/icon.svg',
    badge:     '/LoreMail/icon.svg',
    tag:       'loremail-letter',
    renotify:  true,
    data:      { url: data.url ?? '/LoreMail/' },
  };

  // Set the app-icon badge — works even when Android suppresses the notification popup
  const setBadge = self.navigator?.setAppBadge
    ? self.navigator.setAppBadge(1).catch(() => {})
    : Promise.resolve();

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      setBadge,
    ]),
  );
});

// ─── Notification Click ───────────────────────────────────────────────────────

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url ?? '/LoreMail/';

  // Clear the app-icon badge when the user taps the notification
  if (self.navigator?.clearAppBadge) {
    self.navigator.clearAppBadge().catch(() => {});
  }

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Focus existing window if already open
        for (const client of windowClients) {
          if (client.url.includes('/LoreMail') && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise open a new window
        if (clients.openWindow) return clients.openWindow(targetUrl);
      }),
  );
});
