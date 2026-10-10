'use client';
/**
 * Registers the app's service worker (public/push-sw.js) for everyone signed
 * in, so the app keeps working with no signal, and — at most every 6 hours,
 * while online — saves the screens a field user needs ahead of time.
 */
const WARMED_AT = 'saguaro-warmed-at';
const TOP = ['/app', '/app/my-work', '/app/projects', '/app/time', '/app/daily-logs', '/app/notifications', '/app/documents'];
const PER_JOB = ['overview', 'photos', 'daily-logs', 'punch-list', 'rfis', 'drawings'];

export async function startAppWorker(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/push-sw.js', { scope: '/' });
    const reg = await navigator.serviceWorker.ready;
    if (!navigator.onLine) return;
    let last = 0;
    try { last = Number(localStorage.getItem(WARMED_AT) || 0); } catch { /* storage off: warm every launch */ }
    if (Date.now() - last < 6 * 3600_000) return;
    let jobs: string[] = [];
    try {
      const r = await fetch('/api/projects?limit=3&fields=id,name', { credentials: 'include' });
      const d = await r.json();
      const list = (Array.isArray(d) ? d : d.projects || d.data || []) as Array<{ id?: string }>;
      jobs = list.map((p) => p.id).filter((x): x is string => !!x).slice(0, 3);
    } catch { /* no jobs list: warm the main screens only */ }
    const urls = [...TOP, ...jobs.flatMap((id) => PER_JOB.map((t) => `/app/projects/${id}/${t}`))];
    reg.active?.postMessage({ type: 'saguaro:warm', urls });
    try { localStorage.setItem(WARMED_AT, String(Date.now())); } catch { /* fine */ }
  } catch {
    /* No service worker here (e.g. the iPhone app before App-Bound Domains): the outbox still works. */
  }
}

/** On sign-out: the next person on this phone must never see this one's saved screens. */
export function clearOfflineCopies(): void {
  try {
    navigator.serviceWorker?.controller?.postMessage('saguaro:clear-cache');
    localStorage.removeItem(WARMED_AT);
  } catch { /* nothing cached */ }
}
