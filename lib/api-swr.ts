/**
 * api-swr — pages show their data the moment they open.
 *
 * Every page under /app fetches its data from /api/* after it mounts, so each
 * tap showed a dark loading screen for 0.5–1.5s while the server answered —
 * every time, even for a page opened ten seconds earlier.
 *
 * This wraps window.fetch once, in the app shell, for same-origin GET /api/*
 * calls that return JSON:
 *  - The last answer for that exact URL is kept in memory (this tab only,
 *    never written to disk). Opening the page again returns it instantly and
 *    asks the server again in the background, so the copy is never older than
 *    the user's previous visit, and never older than MAX_AGE_MS.
 *  - Any change the user makes (POST/PUT/PATCH/DELETE to /api) wipes the whole
 *    copy, so nothing the user just saved can show the old value.
 *  - The URLs each page asks for are remembered (URLs only, no data), so a
 *    finger landing on a link starts loading that page's data before release.
 *
 * Never cached: sign-in, billing, AI/chat/streams, notifications, messages,
 * presence, uploads, exports/PDFs, and anything not a 200 JSON answer.
 */

const MAX_AGE_MS = 2 * 60_000;
const MAX_ENTRIES = 300;
const MAX_BODY_CHARS = 1_500_000;
const ROUTE_MAP_KEY = 'sag_route_api_v1';
const SKIP = /^\/api\/(?:auth|billing|stripe|sage|ai|chat|ask|stream|notifications|messages|presence|realtime|upload|uploads|export|exports|download|pdf|cron|webhooks?|sign|signature|offline)(?:\/|$)|\/(?:stream|export|download|pdf|upload)(?:\/|$|\?)/i;

type Entry = { body: string; status: number; headers: [string, string][]; at: number };

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<Entry | null>>();
let installed = false;
let realFetch: typeof fetch;

function routeMap(): Record<string, string[]> {
  try { return JSON.parse(localStorage.getItem(ROUTE_MAP_KEY) || '{}') || {}; } catch { return {}; }
}

function rememberRouteUrl(url: string) {
  const page = window.location.pathname;
  if (!page.startsWith('/app')) return;
  try {
    const map = routeMap();
    const list = map[page] || [];
    if (list.includes(url)) return;
    map[page] = [url, ...list].slice(0, 12);
    const pages = Object.keys(map);
    if (pages.length > 150) delete map[pages[0]];
    localStorage.setItem(ROUTE_MAP_KEY, JSON.stringify(map));
  } catch { /* storage full or blocked — warming is a bonus, not required */ }
}

function toResponse(e: Entry): Response {
  return new Response(e.body, { status: e.status, headers: e.headers });
}

function cacheable(input: RequestInfo | URL, init?: RequestInit): string | null {
  const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  if (method !== 'GET' || init?.body) return null;
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  let url: URL;
  try { url = new URL(raw, window.location.href); } catch { return null; }
  if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) return null;
  if (SKIP.test(url.pathname)) return null;
  if (init?.signal?.aborted) return null;
  return url.pathname + url.search;
}

function isMutation(input: RequestInfo | URL, init?: RequestInit): boolean {
  const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return false;
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  try {
    const url = new URL(raw, window.location.href);
    return url.origin === window.location.origin && url.pathname.startsWith('/api/');
  } catch { return false; }
}

/** Ask the server and store a good JSON answer. Shared by page calls and warming. */
function load(key: string): Promise<Entry | null> {
  const running = inflight.get(key);
  if (running) return running;
  const p = realFetch(key, { credentials: 'same-origin' })
    .then(async (res) => {
      const type = res.headers.get('content-type') || '';
      if (res.status !== 200 || !type.includes('application/json')) return null;
      const body = await res.text();
      if (body.length > MAX_BODY_CHARS) return null;
      const entry: Entry = { body, status: res.status, headers: [['content-type', type]], at: Date.now() };
      cache.set(key, entry);
      if (cache.size > MAX_ENTRIES) { const first = cache.keys().next().value; if (first !== undefined) cache.delete(first); }
      return entry;
    })
    .catch(() => null)
    .finally(() => { inflight.delete(key); });
  inflight.set(key, p);
  return p;
}

export function installApiSwr(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  realFetch = window.fetch.bind(window);

  const wrapped = async function swrFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    if (isMutation(input, init)) {
      try {
        return await realFetch(input, init);
      } finally {
        cache.clear(); // something changed — the next read goes to the server
      }
    }
    const key = cacheable(input, init);
    if (!key) return realFetch(input, init);
    rememberRouteUrl(key);

    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < MAX_AGE_MS) {
      void load(key); // refresh quietly for next time
      return toResponse(hit);
    }
    // Not cached yet: one trip to the server, and keep its answer. A warm-up
    // already on its way is reused rather than asked twice.
    const pending = inflight.get(key);
    if (pending) {
      const entry = await pending;
      if (entry) return toResponse(entry);
    }
    const res = await realFetch(input, init);
    const type = res.headers.get('content-type') || '';
    if (res.status === 200 && type.includes('application/json')) {
      res.clone().text().then((body) => {
        if (body.length > MAX_BODY_CHARS) return;
        cache.set(key, { body, status: 200, headers: [['content-type', type]], at: Date.now() });
      }).catch(() => { /* answer still reaches the page */ });
    }
    return res;
  };
  window.fetch = wrapped as typeof fetch;

  // Signing out wipes the copy (another account must never see it).
  window.addEventListener('storage', (e) => { if (e.key === null) cache.clear(); });
}

/** Start loading a page's data before it opens (a finger is on its link). */
export function warmRoute(path: string): void {
  if (!installed) return;
  const page = path.split('?')[0];
  const urls = routeMap()[page];
  if (!urls) return;
  for (const key of urls) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < MAX_AGE_MS / 2) continue;
    void load(key);
  }
}

/** Forget everything (sign-out, account switch). */
export function clearApiSwr(): void {
  cache.clear();
}
