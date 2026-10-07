/* Saguaro alerts — push only.
 *
 * Registered by lib/push-client.ts when someone turns on alerts for a browser.
 * It does nothing else: no fetch handler, no caching, so it can never serve a
 * stale page. Payload comes from lib/push.ts: { title, body, icon, tag, url }.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

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
