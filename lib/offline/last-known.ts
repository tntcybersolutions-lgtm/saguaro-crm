'use client';
/**
 * The last job list this phone loaded, kept in IndexedDB so a crew with no
 * signal can still pick the job for a daily log, a clock-in or a photo.
 *
 * Every picker asks the server first. Only when that fails for lack of network
 * does it fall back to the copy kept here — and the copy is replaced each time
 * the server answers. Sign-out wipes it (clearLastKnown) so the next person on
 * the phone never sees this one's jobs.
 */
import { looksLikeNetworkError } from '@/lib/offline/outbox';

export interface KnownJob { id: string; name: string }

const DB = 'saguaro-last-known';
const STORE = 'lists';
const JOBS = 'jobs';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function put(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(STORE, 'readwrite');
      t.objectStore(STORE).put({ at: Date.now(), value }, key);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally { db.close(); }
}

async function get<T>(key: string): Promise<{ at: number; value: T } | null> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, 'readonly');
      const r = t.objectStore(STORE).get(key);
      t.oncomplete = () => resolve((r.result as { at: number; value: T } | undefined) ?? null);
      t.onerror = () => reject(t.error);
    });
  } finally { db.close(); }
}

/** Only real jobs: an id and a name. Sorted by name so every picker reads the same. */
function clean(list: unknown): KnownJob[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((p): p is KnownJob => !!p && typeof (p as KnownJob).id === 'string' && typeof (p as KnownJob).name === 'string' && !!(p as KnownJob).name)
    .map((p) => ({ id: p.id, name: p.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Keep this list as the phone's last-known jobs. Never throws (private mode just doesn't keep it). */
export async function rememberJobs(list: unknown): Promise<void> {
  const jobs = clean(list);
  if (!jobs.length) return;
  try {
    // A short list (a picker that asked for 3) must not replace a longer one.
    const cur = await get<KnownJob[]>(JOBS).catch(() => null);
    const merged = new Map((cur?.value ?? []).map((j) => [j.id, j] as const));
    for (const j of jobs) merged.set(j.id, j);
    await put(JOBS, clean([...merged.values()]));
  } catch (e) {
    console.debug('[last-known] job list not kept on this phone', e);
  }
}

export async function lastKnownJobs(): Promise<KnownJob[] | null> {
  try {
    const hit = await get<KnownJob[]>(JOBS);
    return hit?.value?.length ? hit.value : null;
  } catch {
    return null;
  }
}

/**
 * The job list for a picker: the server's, else — with no signal — the last
 * one this phone saw. `fromPhone` says which. Throws only when there is neither.
 */
export async function loadJobs(url = '/api/projects?limit=500&fields=id,name'): Promise<{ jobs: KnownJob[]; fromPhone: boolean }> {
  try {
    const r = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
    if (!r.ok) throw new Error(`projects ${r.status}`);
    const d = await r.json();
    const jobs = clean(Array.isArray(d) ? d : d?.projects ?? d?.data ?? []);
    void rememberJobs(jobs);
    return { jobs, fromPhone: false };
  } catch (e) {
    if (!looksLikeNetworkError(e) && !(e instanceof Error && /^projects 5\d\d$/.test(e.message))) throw e;
    const kept = await lastKnownJobs();
    if (kept) return { jobs: kept, fromPhone: true };
    throw e;
  }
}

/**
 * Who is signed in on this phone, for the time clock: their employee row
 * (id and name only — never pay) and their company. Without it a reload with
 * no signal could not resolve the employee, and Clock In stayed disabled.
 * Replaced every time the server answers; wiped on sign-out with the jobs.
 */
const ME = 'me';
export interface KnownMe { emp: { id: string; full_name: string | null; first_name: string | null }; tenantId: string }

export async function rememberMe(me: KnownMe): Promise<void> {
  if (!me?.emp?.id || !me.tenantId) return;
  try {
    await put(ME, { emp: { id: me.emp.id, full_name: me.emp.full_name ?? null, first_name: me.emp.first_name ?? null }, tenantId: me.tenantId });
  } catch (e) {
    console.debug('[last-known] employee not kept on this phone', e);
  }
}

export async function lastKnownMe(): Promise<KnownMe | null> {
  try {
    const hit = await get<KnownMe>(ME);
    return hit?.value?.emp?.id ? hit.value : null;
  } catch {
    return null;
  }
}

/** On sign-out: forget this person's jobs. */
export async function clearLastKnown(): Promise<void> {
  try {
    await new Promise<void>((resolve) => {
      const r = indexedDB.deleteDatabase(DB);
      r.onsuccess = r.onerror = r.onblocked = () => resolve();
    });
  } catch { /* nothing kept */ }
}
