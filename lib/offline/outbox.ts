'use client';
/**
 * Offline outbox for site photos and video — and, since stage 3, the field
 * records people write with no signal (daily logs, punch items).
 *
 * No signal on a jobsite is normal. A photo or clip taken offline (or one whose
 * upload dies mid-way for lack of network) is kept on the phone in IndexedDB —
 * the file itself, not a promise — and uploaded the moment the connection is
 * back. The same uploads the Photos page uses (lib/media-upload) do the sending.
 *
 * The connection state and the outbox count live in one tiny store that the
 * offline bar (components/OfflineBar) and the Photos page subscribe to.
 */
import { uploadPhoto, uploadVideo } from '@/lib/media-upload';
import { getAuthHeaders } from '@/lib/supabase-browser';
import { step } from '@/lib/ui/status';
import { describeRequest } from '@/lib/ui/status-labels';
import { STATUS_HEADER, reasonFromResponse } from '@/lib/ui/status-fetch';
import { SAVED_AT_HEADER } from '@/lib/offline/saved-at';

export interface OutboxItem {
  id: string;
  projectId: string;
  kind: 'image' | 'video';
  album: string | null;
  name: string;
  type: string;
  size: number;
  /** The file itself, where this browser lets IndexedDB keep one… */
  file?: Blob;
  /** …or its bytes, where it doesn't (Safari in a private window, WebKit test browsers). */
  bytes?: ArrayBuffer;
  createdAt: number;
  attempts: number;
  lastError?: string;
}

/** The waiting photo or video as a File again, whichever way it was kept. */
export function outboxFile(item: OutboxItem): File {
  const part: BlobPart = item.bytes ?? item.file ?? new Blob([]);
  return new File([part], item.name, { type: item.type, lastModified: item.createdAt });
}

export interface NetState {
  online: boolean;
  /** Items saved on this phone, waiting to upload. */
  pending: number;
  syncing: boolean;
  /** Items uploaded by the last sync after coming back online. */
  synced: number;
  /** When `online` last flipped (ms). */
  changedAt: number;
}

/** A write (create / edit / delete) kept on the phone until it can be sent. */
export interface SavedRequest {
  id: string;
  projectId: string | null;
  /** 'daily-log' | 'punch' — which screen shows it while it waits. */
  kind: string;
  label: string;
  url: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** JSON text. The auth token is NOT stored; a fresh one is added on send. */
  body: string | null;
  /** The row as the screen showed it, so it can show it again after a reload. */
  row?: Record<string, unknown>;
  /** For an edit/delete: the record it changes. */
  recordId?: string;
  createdAt: number;
  attempts: number;
  lastError?: string;
}

const DB = 'saguaro-offline';
const STORE = 'media';
const REQS = 'requests';
/** After this many refusals (not network trouble) an item stops retrying and says why. */
export const MAX_ATTEMPTS = 5;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
      if (!req.result.objectStoreNames.contains(REQS)) req.result.createObjectStore(REQS, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>, store: string = STORE): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(store, mode);
      const r = run(t.objectStore(store));
      t.oncomplete = () => resolve(r.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

/** Said when neither way of keeping the file on the phone worked. */
export const CANNOT_KEEP = "No signal, and this phone couldn't keep a copy of it. Try again when you have signal.";

export async function addToOutbox(o: Omit<OutboxItem, 'id' | 'createdAt' | 'attempts' | 'file' | 'bytes'> & { file: Blob }): Promise<string> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const { file, ...meta } = o;
  const base = { ...meta, id, createdAt: Date.now(), attempts: 0 };
  try {
    await tx('readwrite', (s) => s.put({ ...base, file }));
  } catch {
    // WebKit with no saved website data — Safari in a private window, and the
    // test browsers that walk the app — aborts any IndexedDB write holding a
    // File ("Error preparing Blob/File data to be stored in object store").
    // The photo was never kept and never sent. Its bytes always store.
    try {
      const bytes = await file.arrayBuffer();
      await tx('readwrite', (s) => s.put({ ...base, bytes }));
    } catch {
      throw new Error(CANNOT_KEEP);
    }
  }
  await refreshPending();
  return id;
}

export async function listOutbox(projectId?: string): Promise<OutboxItem[]> {
  const all = (await tx('readonly', (s) => s.getAll())) as OutboxItem[];
  return all.filter((i) => !projectId || i.projectId === projectId).sort((a, b) => a.createdAt - b.createdAt);
}

/** Take a photo or video off the phone without sending it. */
export async function removeFromOutbox(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id));
  await refreshPending();
}

/** Try a photo or video again that stopped retrying, and send it now if there's signal. */
export async function retryOutboxItem(id: string): Promise<void> {
  const cur = (await tx('readonly', (s) => s.get(id))) as OutboxItem | undefined;
  if (!cur) return;
  await tx('readwrite', (s) => s.put({ ...cur, attempts: 0, lastError: undefined }));
  await refreshPending();
  if (!isOffline()) void drainOutbox();
}

// ── saved writes (daily logs, punch items) ───────────────────────────────────
const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export async function listSaved(projectId?: string | null, kind?: string): Promise<SavedRequest[]> {
  try {
    const all = (await tx('readonly', (s) => s.getAll(), REQS)) as SavedRequest[];
    return all.filter((r) => (!projectId || r.projectId === projectId) && (!kind || r.kind === kind)).sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    return []; // no IndexedDB (private mode): nothing can be saved
  }
}

/** Change a saved write before it is sent (e.g. editing a log made offline). */
export async function updateSaved(id: string, patch: Partial<Pick<SavedRequest, 'body' | 'row' | 'label'>>): Promise<void> {
  const cur = (await tx('readonly', (s) => s.get(id), REQS)) as SavedRequest | undefined;
  if (!cur) return;
  await tx('readwrite', (s) => s.put({ ...cur, ...patch, attempts: 0, lastError: undefined }), REQS);
}

export async function removeSaved(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id), REQS);
  await refreshPending();
}

/** The id a screen gives a row that is only on this phone. */
export const savedRowId = (id: string) => `offline-${id}`;
export const savedIdOf = (rowId: string): string | null => (rowId.startsWith('offline-') ? rowId.slice(8) : null);

/**
 * Send a write now, or — with no network — keep it on this phone and send it
 * the moment the connection is back. The server's answer (any status) comes
 * back as `response`; only "no network" turns into `saved`.
 */
export async function sendOrSave(r: {
  url: string; method: SavedRequest['method']; body?: unknown; projectId?: string | null; kind: string; label: string; row?: Record<string, unknown>; recordId?: string;
}): Promise<{ saved: true; id: string } | { saved: false; response: Response }> {
  const body = r.body === undefined ? null : typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
  // This write is one step in the status box; it says itself whether it went or stayed on the phone.
  const words = describeRequest(r.method, r.url) ?? { doing: r.label, done: r.label, failed: `Couldn't send: ${r.label}` };
  const h = step(words.doing);
  if (!isOffline()) {
    try {
      const response = await fetch(r.url, { method: r.method, headers: { 'Content-Type': 'application/json', [STATUS_HEADER]: 'off', ...(await getAuthHeaders()) }, body: body ?? undefined });
      if (response.ok) h.done(words.done);
      else void reasonFromResponse(response).then((why) => h.fail(words.failed, why));
      return { saved: false, response };
    } catch (e) {
      if (!looksLikeNetworkError(e)) { h.fail(words.failed, 'Something stopped it before it reached the server. Try again.'); throw e; }
    }
  }
  const id = newId();
  try {
    await tx('readwrite', (s) => s.put({
      id, projectId: r.projectId ?? null, kind: r.kind, label: r.label, url: r.url, method: r.method, body,
      row: r.row, recordId: r.recordId, createdAt: Date.now(), attempts: 0,
    } satisfies SavedRequest), REQS);
  } catch (e) {
    h.fail(words.failed, 'No signal, and this phone could not keep a copy. Try again when you have signal.', true);
    throw e;
  }
  h.offline(`${r.label} — saved on this phone`, "It sends by itself when you're back online.");
  await refreshPending();
  return { saved: true, id };
}

async function noteFailure(item: OutboxItem, message: string): Promise<void> {
  await tx('readwrite', (s) => s.put({ ...item, attempts: item.attempts + 1, lastError: message.slice(0, 200) }));
}

// ── connection state ─────────────────────────────────────────────────────────
let state: NetState = { online: true, pending: 0, syncing: false, synced: 0, changedAt: 0 };
const subs = new Set<() => void>();
function set(p: Partial<NetState>) {
  state = { ...state, ...p };
  subs.forEach((f) => f());
}
export function getNetState(): NetState { return state; }
export function getServerNetState(): NetState { return state; }
export function subscribeNet(fn: () => void): () => void { subs.add(fn); return () => { subs.delete(fn); }; }

export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** A failure that means "no network", not "the server said no". */
export function looksLikeNetworkError(e: unknown): boolean {
  if (isOffline()) return true;
  const m = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  return /Failed to fetch|Load failed|NetworkError|network connection|Network request failed|offline|The Internet connection appears/i.test(m);
}

export async function refreshPending(): Promise<void> {
  try {
    const media = (await listOutbox()).filter((i) => i.attempts < MAX_ATTEMPTS).length;
    const writes = (await listSaved()).filter((r) => r.attempts < MAX_ATTEMPTS).length;
    set({ pending: media + writes });
  } catch { /* no IndexedDB (private mode): nothing can be pending */ }
}

/* One send at a time. The 'online' event, the start-up check and the minute
   timer can all fire together; two runs reading the same list would upload the
   same photo twice. The second caller just waits for the first. */
let draining: Promise<{ done: number; failed: number }> | null = null;

/** Send everything saved on this phone, oldest first. Stops at the first network failure. */
export function drainOutbox(): Promise<{ done: number; failed: number }> {
  if (draining) return draining;
  if (state.syncing || isOffline()) return Promise.resolve({ done: 0, failed: 0 });
  draining = drainOnce().finally(() => { draining = null; });
  return draining;
}

async function drainOnce(): Promise<{ done: number; failed: number }> {
  let items: OutboxItem[] = [];
  try { items = (await listOutbox()).filter((i) => i.attempts < MAX_ATTEMPTS); } catch { return { done: 0, failed: 0 }; }
  const writes = (await listSaved()).filter((r) => r.attempts < MAX_ATTEMPTS);
  if (!items.length && !writes.length) { set({ pending: 0 }); return { done: 0, failed: 0 }; }
  set({ syncing: true, synced: 0 });
  let done = 0, failed = 0;
  let offline = false;
  const total = items.length + writes.length;
  const things = (n: number) => `${n} saved ${n === 1 ? 'item' : 'items'}`;
  const h = step(`Sending ${things(total)} from this phone`);
  h.update({ count: { done: 0, total } });
  // Written records first (a log is small and the office is waiting on it), then media.
  for (const w of writes) {
    try {
      // SAVED_AT_HEADER: when it was really done, so a punch kept on the phone keeps its time.
      const res = await fetch(w.url, { method: w.method, headers: { 'Content-Type': 'application/json', [STATUS_HEADER]: 'off', [SAVED_AT_HEADER]: new Date(w.createdAt).toISOString(), ...(await getAuthHeaders()) }, body: w.body ?? undefined });
      if (!res.ok && res.status !== 404) {
        // 404 on an edit/delete: the record is already gone — nothing left to do.
        const text = await res.text().catch(() => '');
        let msg = `HTTP ${res.status}`;
        try { msg = (JSON.parse(text).error as string) || msg; } catch { /* plain text */ }
        failed++;
        await tx('readwrite', (s) => s.put({ ...w, attempts: w.attempts + 1, lastError: msg.slice(0, 200) }), REQS).catch(() => {});
        continue;
      }
      const result = await res.json().catch(() => null);
      await tx('readwrite', (s) => s.delete(w.id), REQS);
      done++;
      set({ pending: Math.max(0, state.pending - 1), synced: done });
      h.update({ count: { done: done + failed, total } });
      window.dispatchEvent(new CustomEvent('saguaro:outbox-synced', { detail: { projectId: w.projectId, kind: w.kind, id: w.id, result } }));
    } catch (e) {
      if (looksLikeNetworkError(e)) { offline = true; break; }
      failed++;
      await tx('readwrite', (s) => s.put({ ...w, attempts: w.attempts + 1, lastError: (e instanceof Error ? e.message : 'Send failed').slice(0, 200) }), REQS).catch(() => {});
    }
  }
  for (const item of offline ? [] : items) {
    try {
      const file = outboxFile(item);
      if (item.kind === 'video') await uploadVideo(file, { projectId: item.projectId });
      else await uploadPhoto(file, { projectId: item.projectId, album: item.album || undefined });
      // Off the phone the moment it is on the server, so a later run can't send it again.
      await tx('readwrite', (s) => s.delete(item.id));
      done++;
      set({ pending: Math.max(0, state.pending - 1), synced: done });
      h.update({ count: { done: done + failed, total } });
      window.dispatchEvent(new CustomEvent('saguaro:outbox-synced', { detail: { projectId: item.projectId } }));
    } catch (e) {
      if (looksLikeNetworkError(e)) break; // still no real connection — try again later
      failed++;
      await noteFailure(item, e instanceof Error ? e.message : 'Upload failed').catch(() => {});
    }
  }
  set({ syncing: false, synced: done });
  await refreshPending();
  if (failed) h.fail(`${failed} of ${things(total)} couldn't be sent`, done ? `${done} went through. The rest say why on their screens.` : 'Each one says why on its screen.');
  else if (done < total) h.offline(`${done ? `${done} sent — ` : ''}${things(total - done)} still on this phone`, 'The signal dropped again. They go by themselves when it is back.');
  else h.done(`${things(total)} sent from this phone`);
  return { done, failed };
}

/** Wire the browser's online/offline events once for the whole app. */
export function startOfflineWatch(): () => void {
  const flip = () => {
    const online = !isOffline();
    if (online !== state.online) set({ online, changedAt: Date.now(), synced: online ? state.synced : 0 });
    if (online) void drainOutbox();
  };
  set({ online: !isOffline() });
  window.addEventListener('online', flip);
  window.addEventListener('offline', flip);
  void refreshPending().then(() => { if (!isOffline()) void drainOutbox(); });
  // A phone that "has signal" but no data never fires 'online' again: retry quietly.
  const timer = window.setInterval(() => { if (!isOffline() && state.pending > 0) void drainOutbox(); }, 60_000);
  return () => {
    window.removeEventListener('online', flip);
    window.removeEventListener('offline', flip);
    window.clearInterval(timer);
  };
}
