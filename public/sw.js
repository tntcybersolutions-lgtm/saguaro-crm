/* Saguaro Field — Service Worker v7
 * Supports: PWA offline, background sync, web push notifications.
 * Native Capacitor builds do NOT use this SW — they use FCM/APNS directly.
 */
const CACHE = 'saguaro-field-v7';
const OFFLINE_URL = '/field';

// Pages that should be available offline immediately after first visit
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
  '/field/drawings',
  '/field/equipment',
  '/field/chat',
  '/field/sage',
  '/field/qr',
  '/field/safety',
  '/field/activity',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/site.webmanifest',
];

// API routes that return safe offline fallbacks (GET only)
const OFFLINE_API_RESPONSES = {
  '/api/notifications/count': { count: 0, offline: true },
  '/api/projects/list':       { projects: [], offline: true },
};

// ─── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((cache) =>
        Promise.allSettled(PRECACHE.map((url) => cache.add(url)))
      )
      .then(() => self.skipWaiting()),
  );
});

// ─── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// ─── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin requests
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // ── API routes: network-first with typed offline fallbacks ──
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(request)
        .then((res) => {
          // Cache successful GET API responses that are safe to reuse
          if (res.ok && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(request, clone));
          }
          return res;
        })
        .catch(async () => {
          // Try cache first
          const cached = await caches.match(request);
          if (cached) return cached;
          // Typed offline response for known endpoints
          const offlineData = OFFLINE_API_RESPONSES[url.pathname];
          if (offlineData) {
            return new Response(JSON.stringify(offlineData), {
              headers: { 'Content-Type': 'application/json', 'X-SW-Offline': '1' },
              status: 200,
            });
          }
          return new Response(JSON.stringify({ error: 'offline', offline: true }), {
            headers: { 'Content-Type': 'application/json' },
            status: 503,
          });
        }),
    );
    return;
  }

  // ── Field app pages: network-first, cache fallback ──
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
          caches.match(request)
            .then((cached) => cached || caches.match(OFFLINE_URL))
        ),
    );
    return;
  }

  // ── Static assets (_next/static, images, fonts): cache-first ──
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.match(/\.(png|jpg|jpeg|webp|avif|woff2?|svg|ico)$/)
  ) {
    e.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(request, res.clone()));
          return res;
        });
      }),
    );
    return;
  }

  // ── Everything else: network with cache fallback ──
  e.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(request, res.clone()));
        return res;
      })
      .catch(() => caches.match(request)),
  );
});

// ─── Background Sync (Chromium/Android only) ──────────────────────────────────
self.addEventListener('sync', (e) => {
  if (e.tag === 'field-sync') {
    e.waitUntil(notifyClientsToSync());
  }
});

async function notifyClientsToSync() {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clients.forEach((c) => c.postMessage({ type: 'SYNC_NOW' }));
}

// ─── Web Push Notifications (PWA / web only) ──────────────────────────────────
self.addEventListener('push', (e) => {
  if (!e.data) return;

  let payload;
  try {
    payload = e.data.json();
  } catch {
    payload = { title: 'Saguaro Field', body: e.data.text() };
  }

  const title = payload.title || 'Saguaro Field';
  const options = {
    body:    payload.body  || '',
    icon:    payload.icon  || '/icons/icon-192x192.png',
    badge:   '/icons/icon-96x96.png',
    image:   payload.image || undefined,
    tag:     payload.tag   || 'saguaro-field',
    renotify: payload.tag  ? true : false,
    data:    payload,
    actions: payload.actions || [],
    requireInteraction: payload.requireInteraction || false,
    vibrate: [100, 50, 100],
  };

  e.waitUntil(self.registration.showNotification(title, options));
});

// ─── Notification click ───────────────────────────────────────────────────────
self.addEventListener('notificationclick', (e) => {
  e.notification.close();

  const route = e.notification.data?.route || e.notification.data?.url || '/field';

  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus existing field tab if present
      const existing = clients.find((c) => c.url.includes('/field') && 'focus' in c);
      if (existing) {
        existing.focus();
        existing.postMessage({ type: 'NAVIGATE', route });
        return;
      }
      // Open new window
      return self.clients.openWindow(route);
    }),
  );
});

// ─── Message handler ──────────────────────────────────────────────────────────
self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (e.data?.type === 'CLAIM_CLIENTS') self.clients.claim();
});
