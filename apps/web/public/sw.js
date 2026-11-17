// Vinci service worker: Web Push and notification taps only.
// It caches nothing and has no fetch handler, so every page, asset and login redirect goes to the network as without it.
// A new web build does not touch it; the browser replaces it when this file's bytes change (served with no-cache).
// The push payload is NotificationWebPushPayload in packages/contracts/src/types/notification.types.ts.

self.addEventListener('install', () => {
  void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  const payload = event.data?.json() ?? {};

  // Every push must show a notification, or Safari ends the subscription.
  event.waitUntil(self.registration.showNotification(payload.title ?? 'Vinci', {
    body: payload.body ?? '',
    tag: payload.botId,
    renotify: Boolean(payload.botId),
    icon: payload.botId ? `/avatars/bots/${payload.botId}.png` : '/img/favicon/web-app-manifest-192x192.png',
    data: { path: payload.path ?? '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.path ?? '/', self.location.origin);
  const path = target.origin === self.location.origin ? target.pathname : '/';

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // An app window (not the admin panel) follows the path itself; without one, or if it cannot be focused, open the path.
    const open = windows.find((client) => {
      const url = new URL(client.url);

      return url.origin === self.location.origin && !url.pathname.startsWith('/admin');
    });

    if (open) {
      open.postMessage({ type: 'notification-open', path });

      if (await open.focus().then(() => true, () => false)) {
        return;
      }
    }

    await self.clients.openWindow(path);
  })());
});
