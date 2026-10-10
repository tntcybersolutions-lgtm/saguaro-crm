/* Saguaro's service worker: alerts + working with no signal.
 *
 * One worker per scope, so this one does both jobs (the name stays push-sw.js
 * so devices already signed up for alerts keep working).
 *
 * Offline rules — chosen so it can never serve a stale page while online:
 *   • pages and their data (/api GETs, RSC payloads): network first; the last
 *     good copy is used ONLY when the network fails.
 *   • /_next/static/*: content-hashed, so cache first.
 *   • a page never opened before, with no network: a plain offline page.
 *   • nothing that writes (POST/PUT/PATCH/DELETE) is ever cached or replayed
 *     here — the app's outbox (lib/offline/outbox.ts) owns offline saves.
 * Sign-out sends 'saguaro:clear-cache' so the next person on this phone never
 * sees the last one's data offline.
 */
const V = 'v1';
const PAGES = `sag-pages-${V}`;
const STATIC = `sag-static-${V}`;
const DATA = `sag-data-${V}`;
const KEEP = [PAGES, STATIC, DATA];
const MAX_DATA = 400;
const MAX_PAGES = 120;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('sag-') && !KEEP.includes(k)) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener('message', (e) => {
  if (e.data === 'saguaro:clear-cache') e.waitUntil(Promise.all(KEEP.map((k) => caches.delete(k))));
  else if (e.data && e.data.type === 'saguaro:warm' && Array.isArray(e.data.urls)) e.waitUntil(warm(e.data.urls.slice(0, 40)));
});

/* Save the screens a field user needs before they lose signal: each page and
   the scripts/styles it loads. A page that redirects (signed out) is skipped. */
async function warm(urls) {
  const pages = await caches.open(PAGES);
  const st = await caches.open(STATIC);
  for (const u of urls) {
    try {
      const res = await fetch(u, { credentials: 'include' });
      if (!res.ok || res.redirected) continue;
      await pages.put(new Request(new URL(u, self.location.origin).href), res.clone());
      const html = await res.text();
      const assets = new Set([...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)].map((m) => m[1]));
      for (const a of assets) {
        if (await st.match(a)) continue;
        const r = await fetch(a);
        if (r.ok) await st.put(a, r);
      }
    } catch (_) { /* best effort: try again next time */ }
  }
}

async function trim(name, max) {
  const c = await caches.open(name);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Offline — Saguaro</title><style>html,body{margin:0;height:100%;background:#0b0c10;color:#f4f1e6;font:600 17px/1.45 -apple-system,system-ui,sans-serif}
main{min-height:100%;display:flex;flex-direction:column;justify-content:center;gap:14px;padding:32px 24px;box-sizing:border-box;max-width:520px;margin:0 auto}
h1{margin:0;font-size:26px;color:#ffe600}p{margin:0;color:#c9c4b4;font-weight:500}button{margin-top:8px;min-height:48px;border:0;border-radius:12px;background:#ffe600;color:#111;font:800 16px system-ui}</style></head>
<body><main><h1>You're offline</h1><p>This screen hasn't been opened on this phone yet, so there's no saved copy. Screens you've opened before still work — go back, or try again when you have signal.</p>
<p>Photos and video you add while offline are kept on this phone and upload when you're back.</p>
<button onclick="history.length>1?history.back():location.assign('/app')">Go back</button></main></body></html>`;

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Never hold on to auth or the worker itself.
  if (url.pathname.startsWith('/api/auth/') || url.pathname === '/push-sw.js') return;

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/') || /\.(woff2?|ttf)$/.test(url.pathname)) {
    e.respondWith(caches.open(STATIC).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
    return;
  }

  const isPage = req.mode === 'navigate';
  const isData = url.pathname.startsWith('/api/') || url.searchParams.has('_rsc') || req.headers.get('RSC') === '1';
  if (!isPage && !isData) return;

  const cacheName = isPage ? PAGES : DATA;
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') {
        const c = await caches.open(cacheName);
        c.put(req, res.clone()).then(() => trim(cacheName, isPage ? MAX_PAGES : MAX_DATA));
      }
      return res;
    } catch (err) {
      const c = await caches.open(cacheName);
      const hit = await c.match(req, { ignoreVary: true });
      if (hit) return hit;
      if (isPage) return new Response(OFFLINE_HTML, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      return new Response(JSON.stringify({ error: "You're offline and this hasn't been loaded on this phone yet.", offline: true }), {
        status: 503, headers: { 'Content-Type': 'application/json' },
      });
    }
  })());
});

self.addEventListener('push', (e) => {
  let p = {};
  try { p = e.data ? e.data.json() : {}; } catch (_) { p = { title: 'Saguaro', body: e.data ? e.data.text() : '' }; }
  const title = p.title || 'Saguaro';
  e.waitUntil(self.registration.showNotification(title, {
    body: p.body || '',
    icon: p.icon || '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    tag: p.tag || 'saguaro',
    renotify: !!p.tag,
    requireInteraction: !!p.requireInteraction,
    data: { url: p.url || p.route || '/app/notifications' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/app/notifications', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => c.url.startsWith(self.location.origin) && 'focus' in c);
    if (open) return open.focus().then((c) => (c && 'navigate' in c ? c.navigate(url) : undefined));
    return self.clients.openWindow(url);
  }));
});
