'use client';
/**
 * Offline outbox for site photos and video.
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

export interface OutboxItem {
  id: string;
  projectId: string;
  kind: 'image' | 'video';
  album: string | null;
  name: string;
  type: string;
  size: number;
  file: Blob;
  createdAt: number;
  attempts: number;
  lastError?: string;
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

const DB = 'saguaro-offline';
const STORE = 'media';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const r = run(t.objectStore(STORE));
      t.oncomplete = () => resolve(r.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

export async function addToOutbox(o: Omit<OutboxItem, 'id' | 'createdAt' | 'attempts'>): Promise<string> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  await tx('readwrite', (s) => s.put({ ...o, id, createdAt: Date.now(), attempts: 0 }));
  await refreshPending();
  return id;
}

export async function listOutbox(projectId?: string): Promise<OutboxItem[]> {
  const all = (await tx('readonly', (s) => s.getAll())) as OutboxItem[];
  return all.filter((i) => !projectId || i.projectId === projectId).sort((a, b) => a.createdAt - b.createdAt);
}

async function removeFromOutbox(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id));
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
  try { set({ pending: (await listOutbox()).length }); } catch { /* no IndexedDB (private mode): nothing can be pending */ }
}

/** Upload everything saved on this phone. Stops at the first network failure. */
export async function drainOutbox(): Promise<{ done: number; failed: number }> {
  if (state.syncing || isOffline()) return { done: 0, failed: 0 };
  let items: OutboxItem[] = [];
  try { items = await listOutbox(); } catch { return { done: 0, failed: 0 }; }
  if (!items.length) { set({ pending: 0 }); return { done: 0, failed: 0 }; }
  set({ syncing: true, synced: 0 });
  let done = 0, failed = 0;
  for (const item of items) {
    try {
      const file = new File([item.file], item.name, { type: item.type, lastModified: item.createdAt });
      if (item.kind === 'video') await uploadVideo(file, { projectId: item.projectId });
      else await uploadPhoto(file, { projectId: item.projectId, album: item.album || undefined });
      await removeFromOutbox(item.id);
      done++;
      set({ pending: Math.max(0, state.pending - 1), synced: done });
      window.dispatchEvent(new CustomEvent('saguaro:outbox-synced', { detail: { projectId: item.projectId } }));
    } catch (e) {
      if (looksLikeNetworkError(e)) break; // still no real connection — try again later
      failed++;
      await noteFailure(item, e instanceof Error ? e.message : 'Upload failed').catch(() => {});
    }
  }
  set({ syncing: false, synced: done });
  await refreshPending();
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
