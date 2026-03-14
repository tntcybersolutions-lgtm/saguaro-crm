/**
 * Saguaro Field — IndexedDB Offline Queue v2
 * Improvements:
 *   - Exponential backoff between retries (30s → 2m → 10m → 30m → 2h)
 *   - Max 5 retries → moves to dead-letter store, never fails silently forever
 *   - 72-hour TTL auto-purge so stale clock punches don't pile up
 *   - Background Sync API triggered on every enqueue (Chromium)
 *   - Storage quota guard (refuses to queue when >80% full)
 */

export interface QueuedRequest {
  id: string;
  url: string;
  method: string;
  body: string | null;
  contentType: string;
  createdAt: number;
  retries: number;
  lastFailedAt?: number;
  isFormData: boolean;
  /** For multipart uploads stored as base64 blobs */
  formDataEntries?: Array<{ name: string; value: string; filename?: string; type?: string }>;
}

const DB_NAME    = 'saguaro-field';
const DB_VERSION = 2;          // bumped: adds dead_queue store
const STORE      = 'queue';
const DEAD_STORE = 'dead_queue';

export const MAX_RETRIES = 5;
export const TTL_MS      = 72 * 60 * 60 * 1000; // 72 hours

/** Exponential backoff per retry: 30s, 2m, 10m, 30m, 2h */
const BACKOFF_MS = [30_000, 120_000, 600_000, 1_800_000, 7_200_000];

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains(DEAD_STORE)) {
        const dead = db.createObjectStore(DEAD_STORE, { keyPath: 'id' });
        dead.createIndex('createdAt', 'createdAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror  = () => reject(req.error);
  });
}

// ─── Storage quota guard ──────────────────────────────────
/** Returns how full the storage is (0-100). */
export async function checkStorageQuota(): Promise<{ ok: boolean; usagePercent: number }> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return { ok: true, usagePercent: 0 };
  }
  const { usage = 0, quota = 1 } = await navigator.storage.estimate();
  const usagePercent = Math.round((usage / quota) * 100);
  return { ok: usagePercent < 80, usagePercent };
}

// ─── Background Sync trigger ──────────────────────────────
/** Registers the 'field-sync' tag so the SW can replay when online. */
async function registerSync(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    if ('sync' in reg) {
      // @ts-expect-error SyncManager not in all TS DOM libs
      await reg.sync.register('field-sync');
    }
  } catch { /* not supported on this browser/OS */ }
}

// ─── Core CRUD ────────────────────────────────────────────
export async function enqueue(item: Omit<QueuedRequest, 'id' | 'createdAt' | 'retries'>): Promise<string> {
  // Storage guard — fail loudly before writing
  const { ok, usagePercent } = await checkStorageQuota();
  if (!ok) throw new Error(`Device storage ${usagePercent}% full. Free up space to continue working offline.`);

  const db = await openDb();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const record: QueuedRequest = { ...item, id, createdAt: Date.now(), retries: 0 };

  await new Promise<void>((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).put(record);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });

  // Kick off Background Sync so SW can replay even if page is closed
  registerSync().catch(() => {});

  return id;
}

export async function dequeue(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

export async function getQueue(): Promise<QueuedRequest[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).index('createdAt').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

export async function getQueueCount(): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

export async function incrementRetry(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const item = getReq.result as QueuedRequest;
      if (!item) { resolve(); return; }
      item.retries     += 1;
      item.lastFailedAt = Date.now();
      const putReq = store.put(item);
      putReq.onsuccess = () => resolve();
      putReq.onerror   = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

// ─── Dead-letter store ────────────────────────────────────
/** Items that failed MAX_RETRIES times. User must manually dismiss. */
export async function getDeadLetterQueue(): Promise<QueuedRequest[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(DEAD_STORE, 'readonly');
    const req = tx.objectStore(DEAD_STORE).index('createdAt').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

export async function getDeadLetterCount(): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(DEAD_STORE, 'readonly');
    const req = tx.objectStore(DEAD_STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

export async function clearDeadLetter(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(DEAD_STORE, 'readwrite');
    const req = tx.objectStore(DEAD_STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

/** Atomically move an item from queue → dead_queue. */
async function moveToDeadLetter(item: QueuedRequest): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE, DEAD_STORE], 'readwrite');
    tx.objectStore(DEAD_STORE).put(item);
    tx.objectStore(STORE).delete(item.id);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

// ─── TTL purge ────────────────────────────────────────────
/** Remove items older than TTL_MS from both stores. Returns purged count. */
export async function purgeExpired(): Promise<number> {
  const cutoff = Date.now() - TTL_MS;
  let purged = 0;
  const db = await openDb();

  for (const storeName of [STORE, DEAD_STORE] as const) {
    const items: QueuedRequest[] = await new Promise((res, rej) => {
      const tx  = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).index('createdAt').getAll();
      req.onsuccess = () => res(req.result);
      req.onerror   = () => rej(req.error);
    });
    for (const item of items) {
      if (item.createdAt < cutoff) {
        await new Promise<void>((res, rej) => {
          const tx  = db.transaction(storeName, 'readwrite');
          const req = tx.objectStore(storeName).delete(item.id);
          req.onsuccess = () => res();
          req.onerror   = () => rej(req.error);
        });
        purged++;
      }
    }
  }
  return purged;
}

// ─── Replay ───────────────────────────────────────────────
/** Replay all queued requests with exponential backoff.
 *  Returns { success, skipped, failed, dead } counts. */
export async function replayQueue(): Promise<{ success: number; skipped: number; failed: number; dead: number }> {
  const queue = await getQueue();
  let success = 0;
  let skipped = 0;
  let failed  = 0;
  let dead    = 0;
  const now   = Date.now();

  for (const item of queue) {
    // Respect backoff window — don't hammer a failing endpoint
    if (item.retries > 0 && item.lastFailedAt) {
      const backoffMs = BACKOFF_MS[Math.min(item.retries - 1, BACKOFF_MS.length - 1)];
      if (now - item.lastFailedAt < backoffMs) {
        skipped++;
        continue;
      }
    }

    try {
      let res: Response;
      if (item.isFormData && item.formDataEntries) {
        const fd = new FormData();
        for (const entry of item.formDataEntries) {
          if (entry.filename && entry.type) {
            const binaryStr = atob(entry.value);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
            const blob = new Blob([bytes], { type: entry.type });
            fd.append(entry.name, blob, entry.filename);
          } else {
            fd.append(entry.name, entry.value);
          }
        }
        res = await fetch(item.url, { method: item.method, body: fd });
      } else {
        res = await fetch(item.url, {
          method: item.method,
          body:   item.body,
          headers: item.contentType ? { 'Content-Type': item.contentType } : undefined,
        });
      }

      if (res.ok) {
        await dequeue(item.id);
        success++;
      } else {
        const nextRetries = item.retries + 1;
        if (nextRetries >= MAX_RETRIES) {
          await moveToDeadLetter({ ...item, retries: nextRetries, lastFailedAt: now });
          dead++;
        } else {
          await incrementRetry(item.id);
          failed++;
        }
      }
    } catch {
      const nextRetries = item.retries + 1;
      if (nextRetries >= MAX_RETRIES) {
        await moveToDeadLetter({ ...item, retries: nextRetries, lastFailedAt: now });
        dead++;
      } else {
        await incrementRetry(item.id);
        failed++;
      }
    }
  }

  return { success, skipped, failed, dead };
}
