/**
 * Saguaro Field — IndexedDB Offline Queue
 * Stores pending API calls when offline and replays them on reconnect.
 */

export interface QueuedRequest {
  id: string;
  url: string;
  method: string;
  body: string | null;
  contentType: string;
  createdAt: number;
  retries: number;
  isFormData: boolean;
  /** For multipart uploads stored as base64 blobs */
  formDataEntries?: Array<{ name: string; value: string; filename?: string; type?: string }>;
}

const DB_NAME = 'saguaro-field';
const DB_VERSION = 1;
const STORE = 'queue';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueue(item: Omit<QueuedRequest, 'id' | 'createdAt' | 'retries'>): Promise<string> {
  const db = await openDb();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const record: QueuedRequest = { ...item, id, createdAt: Date.now(), retries: 0 };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).put(record);
    req.onsuccess = () => resolve(id);
    req.onerror = () => reject(req.error);
  });
}

export async function dequeue(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getQueue(): Promise<QueuedRequest[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).index('createdAt').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function incrementRetry(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const item = getReq.result as QueuedRequest;
      if (!item) { resolve(); return; }
      item.retries += 1;
      const putReq = store.put(item);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function getQueueCount(): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Replay all queued requests. Returns { success, failed } counts. */
export async function replayQueue(): Promise<{ success: number; failed: number }> {
  const queue = await getQueue();
  let success = 0;
  let failed = 0;

  for (const item of queue) {
    try {
      let res: Response;
      if (item.isFormData && item.formDataEntries) {
        const fd = new FormData();
        for (const entry of item.formDataEntries) {
          if (entry.filename && entry.type) {
            // base64 → Blob
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
          body: item.body,
          headers: item.contentType ? { 'Content-Type': item.contentType } : undefined,
        });
      }

      if (res.ok) {
        await dequeue(item.id);
        success++;
      } else {
        await incrementRetry(item.id);
        failed++;
      }
    } catch {
      await incrementRetry(item.id);
      failed++;
    }
  }

  return { success, failed };
}
