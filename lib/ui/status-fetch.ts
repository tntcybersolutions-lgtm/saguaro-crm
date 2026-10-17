'use client';
/**
 * Every write the person starts shows up in the status box, in the same words.
 *
 * Installed once (components/StatusCenter). It watches window.fetch for writes
 * to our own /api/ routes (and direct Supabase table writes) and turns each one
 * into a numbered step: "Saving punch item…" → "Punch item saved", or the
 * reason it didn't work. Reads, background traffic and anything started more
 * than a few seconds after the person last touched the screen stay quiet —
 * the box is for what THEY did.
 *
 * A caller that reports its own progress (the offline outbox, the upload
 * queue) sends `x-saguaro-status: off`. A caller can also name the step
 * itself: `x-saguaro-status: Sending pay app to the owner|Pay app sent|Couldn't send the pay app`.
 * The header is removed before the request leaves the browser.
 *
 * A write that fails for a reason trying again can fix (no signal, a server
 * hiccup, a conflict, too many at once) gets a Retry button. Retry presses the
 * same button again when it is still on screen — so the page's own handler
 * runs and the screen updates as it would have — and otherwise sends the same
 * request once more.
 */
import { describeRequest, type StatusWords } from './status-labels';
import { step, getStatusGroups } from './status';
import { TIME_ZONE_HEADER, deviceTimeZone } from '@/lib/time-zone';

export const STATUS_HEADER = 'x-saguaro-status';

/** A write counts as the person's own if it starts this soon after a tap or key. */
const GESTURE_MS = 10_000;

let installed = false;
let lastGesture = 0;
/** The button (or form) the person last pressed — what Retry presses again. */
let lastTrigger: HTMLElement | null = null;
let retryDepth = 0;

/** True while Retry is pressing a button on the person's behalf (the unsaved-changes gate counts it as theirs). */
export function inRetryPress(): boolean {
  return retryDepth > 0;
}

/** Failures that trying again can fix. A refusal (no permission, bad input, gone) cannot. */
export function isRetryable(status: number | null): boolean {
  if (status == null) return true; // never reached the server
  return status >= 500 || status === 408 || status === 409 || status === 425 || status === 429;
}

/** A body that can be sent a second time as it is. A stream cannot. */
function replayable(init?: RequestInit): boolean {
  const b = init?.body;
  return b == null || typeof b === 'string' || b instanceof FormData || b instanceof URLSearchParams || b instanceof Blob || b instanceof ArrayBuffer || ArrayBuffer.isView(b);
}

function headerOf(input: RequestInfo | URL, init?: RequestInit): string | null {
  const h = new Headers(input instanceof Request ? input.headers : undefined);
  if (init?.headers) new Headers(init.headers).forEach((v, k) => h.set(k, v));
  return h.get(STATUS_HEADER);
}

/** The same request without our header (it must never reach a server). */
function withoutHeader(input: RequestInfo | URL, init?: RequestInit): [RequestInfo | URL, RequestInit | undefined] {
  if (input instanceof Request && input.headers.has(STATUS_HEADER)) {
    const h = new Headers(input.headers);
    h.delete(STATUS_HEADER);
    input = new Request(input, { headers: h });
  }
  if (init?.headers) {
    const h = new Headers(init.headers);
    if (h.has(STATUS_HEADER)) { h.delete(STATUS_HEADER); init = { ...init, headers: h }; }
  }
  return [input, init];
}

/**
 * Every call to our own API says which time zone this device is in, so the
 * server computes "today", deadlines and clock windows where the person is
 * (lib/time-zone) — a contractor in Iowa gets Central days, not the server's.
 */
function withTimeZone(input: RequestInfo | URL, init: RequestInit | undefined, origin: string): [RequestInfo | URL, RequestInit | undefined] {
  const zone = deviceTimeZone();
  if (!zone) return [input, init];
  let u: URL;
  try { u = new URL(input instanceof Request ? input.url : String(input), origin); } catch { return [input, init]; }
  if (u.origin !== origin || !u.pathname.startsWith('/api/')) return [input, init];
  if (input instanceof Request && !init?.headers) {
    if (input.headers.has(TIME_ZONE_HEADER)) return [input, init];
    const h = new Headers(input.headers);
    h.set(TIME_ZONE_HEADER, zone);
    return [new Request(input, { headers: h }), init];
  }
  const h = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  if (h.has(TIME_ZONE_HEADER)) return [input, init];
  h.set(TIME_ZONE_HEADER, zone);
  return [input, { ...init, headers: h }];
}

/** Plain words for a refusal when the server didn't give any. */
export function reasonForStatus(status: number): string {
  if (status === 401) return "You're signed out. Sign in again, then try once more.";
  if (status === 403) return "You don't have permission to do this. Ask your company admin for access.";
  if (status === 404) return "It isn't there any more — it may have been deleted.";
  if (status === 409) return 'Someone else changed this at the same time. Reload and try again.';
  if (status === 413) return 'That file is too big.';
  if (status === 429) return 'Too many tries at once — wait a minute and try again.';
  if (status >= 500) return 'The server had a problem. Try again in a moment.';
  return 'The server said no. Check the details and try again.';
}

/** The server's own message from a refused response, if it sent one. */
export async function reasonFromResponse(res: Response): Promise<string> {
  let text = '';
  try {
    const body = await Promise.race([
      res.clone().text(),
      new Promise<string>((r) => setTimeout(() => r(''), 2000)),
    ]);
    try {
      const j = JSON.parse(body) as { error?: unknown; message?: unknown };
      const m = typeof j.error === 'string' ? j.error : typeof j.message === 'string' ? j.message : '';
      text = m.trim();
    } catch { /* not JSON — an HTML error page says nothing useful */ }
  } catch { /* body unreadable */ }
  if (!text || text.length > 200 || /^HTTP \d+$/.test(text)) return reasonForStatus(res.status);
  return text;
}

/** Which writes the box describes, and in what words. Null = stay quiet. */
export function wordsFor(method: string, url: string, origin: string, supabaseOrigin: string): StatusWords | null {
  let u: URL;
  try { u = new URL(url, origin); } catch { return null; }
  if (u.origin === origin && u.pathname.startsWith('/api/')) return describeRequest(method, u.pathname);
  if (supabaseOrigin && u.origin === supabaseOrigin && u.pathname.startsWith('/rest/v1/') && !u.pathname.startsWith('/rest/v1/rpc/')) {
    return describeRequest(method, u.pathname.slice('/rest/v1/'.length));
  }
  return null;
}

function customWords(v: string): StatusWords {
  const [doing, done, failed] = v.split('|').map((x) => x.trim());
  return { doing, done: done || 'Done', failed: failed || `Couldn't finish: ${doing.toLowerCase()}` };
}

export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const m = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  return /Failed to fetch|Load failed|NetworkError|network connection|Network request failed|offline|The Internet connection appears/i.test(m);
}

export const NO_SIGNAL_DETAIL = "No signal — it didn't reach the server. Nothing was saved; try again when you have signal.";

export function installStatusFetch(): void {
  if (installed || typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  installed = true;
  const mark = () => { lastGesture = Date.now(); };
  const press = (e: Event) => {
    mark();
    const t = e.target instanceof Element ? e.target.closest<HTMLElement>('button, input[type="submit"], [role="button"], [role="menuitem"]') : null;
    // The status box's own buttons (Retry, Close) are never what a retry presses.
    if (t && !t.closest('.stc')) lastTrigger = t;
  };
  window.addEventListener('pointerdown', press, { capture: true, passive: true });
  window.addEventListener('click', press, { capture: true, passive: true });
  window.addEventListener('keydown', mark, { capture: true, passive: true });
  window.addEventListener('submit', (e) => {
    mark();
    const sub = (e as SubmitEvent).submitter;
    if (sub instanceof HTMLElement) lastTrigger = sub;
  }, { capture: true });
  // A native Are-you-sure holds the write back while the person reads it; the
  // answer is their gesture, so the write that follows still shows its step.
  for (const name of ['confirm', 'prompt'] as const) {
    const orig = window[name];
    if (typeof orig !== 'function') continue;
    (window as unknown as Record<string, unknown>)[name] = function (this: Window, ...args: unknown[]) {
      try { return (orig as (...a: unknown[]) => unknown).apply(this, args); } finally { mark(); }
    };
  }

  const supabaseOrigin = (() => {
    try { return process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin : ''; } catch { return ''; }
  })();
  const original = window.fetch.bind(window);

  window.fetch = async function statusFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const flag = headerOf(input, init);
    if (flag != null) [input, init] = withoutHeader(input, init);
    [input, init] = withTimeZone(input, init, window.location.origin);
    if (flag === 'off' || init?.keepalive) return original(input, init);

    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const url = input instanceof Request ? input.url : String(input);
    const words = flag ? customWords(flag) : wordsFor(method, url, window.location.origin, supabaseOrigin);
    if (!words) return original(input, init);

    // Only what the person just did — or what joins a box that is already open.
    const open = getStatusGroups().some((g) => !g.dismissed && g.settledAt == null);
    if (!flag && !open && Date.now() - lastGesture > GESTURE_MS) return original(input, init);

    // What Retry needs: the button pressed for this write, and a copy of the request.
    const trigger = Date.now() - lastGesture <= GESTURE_MS && lastTrigger?.isConnected ? lastTrigger : null;
    const canReplay = replayable(init) && (!(input instanceof Request) || !input.bodyUsed);
    const spare = input instanceof Request && canReplay ? input.clone() : null;
    const retry = () => {
      const b = trigger as HTMLButtonElement | null;
      if (b && b.isConnected && !b.disabled && b.getAttribute('aria-disabled') !== 'true') {
        lastGesture = Date.now();
        lastTrigger = b;
        retryDepth++;
        try { b.click(); } finally { retryDepth--; }
        return;
      }
      if (!canReplay) return;
      lastGesture = Date.now();
      void window.fetch(spare ? spare.clone() : input, init).catch(() => { /* its own step says why */ });
    };
    const retryOn = (status: number | null) => (isRetryable(status) && (trigger || canReplay) ? [{ label: 'Retry', run: retry }] : []);

    const h = step(words.doing);
    try {
      const res = await original(input, init);
      if (res.ok || res.status === 304) h.done(words.done);
      else void reasonFromResponse(res).then((why) => { h.fail(words.failed, why); h.setActions(retryOn(res.status)); });
      return res;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') h.drop();
      else if (isNetworkError(e)) { h.fail(words.failed, NO_SIGNAL_DETAIL, true); h.setActions(retryOn(null)); }
      else { h.fail(words.failed, 'Something stopped it before it reached the server. Try again.'); h.setActions(retryOn(null)); }
      throw e;
    }
  };
}
