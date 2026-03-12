/* Saguaro Field — Service Worker v3 */
const CACHE = 'saguaro-field-v3';
const OFFLINE_URL = '/field';

const PRECACHE = [
  '/field',
  '/field/log',
  '/field/photos',
  '/field/inspect',
  '/field/punch',
  '/field/clock',
  '/field/contacts',
  '/field/schedule',
  '/field/delivery',
  '/field/more',
  '/field/install',
  '/logo-icon.jpg',
  '/site.webmanifest',
];

// ─── Install ─────────────────────────────────────────────
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// ─── Activate ────────────────────────────────────────────
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ─── Fetch ───────────────────────────────────────────────
self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin
  if (request.method !== 'GET') return;
  if (url.origin !== location.origin) return;

  // API calls: network first, offline JSON fallback
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ error: 'offline', offline: true }), {
          headers: { 'Content-Type': 'application/json' },
          status: 503,
        })
      )
    );
    return;
  }

  // Field app navigation: network first, cache fallback, offline page fallback
  if (url.pathname.startsWith('/field') || request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(request, clone));
          }
          return res;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match(OFFLINE_URL))
        )
    );
    return;
  }

  // Static assets (images, fonts, JS chunks): cache first
  e.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(request, clone));
        }
        return res;
      });
    })
  );
});

// ─── Background Sync (Chromium only) ─────────────────────
self.addEventListener('sync', (e) => {
  if (e.tag === 'field-sync') {
    e.waitUntil(notifyClientsToSync());
  }
});

async function notifyClientsToSync() {
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach((c) => c.postMessage({ type: 'SYNC_NOW' }));
}

// ─── Push Notifications (future) ─────────────────────────
self.addEventListener('push', (e) => {
  if (!e.data) return;
  const data = e.data.json().catch(() => ({ title: 'Saguaro Field', body: e.data.text() }));
  e.waitUntil(
    data.then((d) =>
      self.registration.showNotification(d.title || 'Saguaro Field', {
        body: d.body || '',
        icon: '/logo-icon.jpg',
        badge: '/logo-icon.jpg',
        data: d,
      })
    )
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      const target = (e.notification.data?.url) || '/field';
      const existing = clients.find((c) => c.url.includes('/field') && 'focus' in c);
      if (existing) return existing.focus();
      return self.clients.openWindow(target);
    })
  );
});

// ─── Message handler ─────────────────────────────────────
self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
