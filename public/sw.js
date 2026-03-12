/* Saguaro Field — Service Worker v1 */
const CACHE = 'saguaro-field-v1';
const OFFLINE_URL = '/field';

const PRECACHE = [
  '/field',
  '/field/log',
  '/field/photos',
  '/field/inspect',
  '/logo-icon.jpg',
  '/site.webmanifest',
];

// ─── Install ─────────────────────────────────────────────
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
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

  // Skip non-GET and cross-origin (except same-origin API)
  if (request.method !== 'GET') return;
  if (url.origin !== location.origin) return;

  // API calls: network first, no cache
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ error: 'offline' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 503,
        })
      )
    );
    return;
  }

  // App navigation: network first, fallback to cache, fallback to /field
  if (url.pathname.startsWith('/field') || request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(request, clone));
          return res;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match(OFFLINE_URL))
        )
    );
    return;
  }

  // Static assets: cache first
  e.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        const clone = res.clone();
        caches.open(CACHE).then((c) => c.put(request, clone));
        return res;
      });
    })
  );
});

// ─── Background Sync (Chromium only) ─────────────────────
self.addEventListener('sync', (e) => {
  if (e.tag === 'field-sync') {
    e.waitUntil(replayQueue());
  }
});

async function replayQueue() {
  // The page handles replaying; we just notify all clients
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach((c) => c.postMessage({ type: 'SYNC_NOW' }));
}

// ─── Message handler ─────────────────────────────────────
self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
