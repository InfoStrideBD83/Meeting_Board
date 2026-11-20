// Deliberately minimal — this app isn't trying to work offline. This
// service worker exists for exactly two things: (1) it's one of the
// installability requirements that lets the browser offer "Install
// InfoStride Meeting Board" (so it can run in its own window and be pinned
// to the taskbar, like a desktop app), and (2) it's what lets a push
// notification reach this device even when no tab is open — a push event
// wakes the browser's service worker process independent of any page.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// A pass-through fetch handler — required by Chrome's installability
// criteria, but not used for caching; every request still goes to the
// network exactly as if this file didn't exist.
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { /* ignore malformed payloads */ }
  const title = payload.title || 'Meeting Board';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || '',
      icon: '/apple-touch-icon.png',
      badge: '/favicon-48.png',
      tag: payload.tag,
      data: payload.data || {},
    })
  );
});

// Clicking the notification focuses an already-open tab if there is one,
// rather than always opening a new one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
      return undefined;
    })
  );
});
