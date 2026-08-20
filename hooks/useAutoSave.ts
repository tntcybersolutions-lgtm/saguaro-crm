'use client';
/**
 * Saguaro Field — Auto-Save Hook
 *
 * Saves form state to IndexedDB every 2 seconds.
 * On mount, restores draft if found. On submit, clears draft.
 * Prevents data loss from browser crashes, accidental navigation, etc.
 */
import { useState, useEffect, useRef, useCallback } from 'react';

const DB_NAME = 'saguaro-field';
const DB_VERSION = 3; // bumped from 2 to add drafts store
const DRAFTS_STORE = 'drafts';

function openDraftsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      // Ensure existing stores survive the upgrade
      if (!db.objectStoreNames.contains('queue')) {
        const store = db.createObjectStore('queue', { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains('dead_queue')) {
        const dead = db.createObjectStore('dead_queue', { keyPath: 'id' });
        dead.createIndex('createdAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains(DRAFTS_STORE)) {
        db.createObjectStore(DRAFTS_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveDraft(key: string, data: unknown): Promise<void> {
  const db = await openDraftsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DRAFTS_STORE, 'readwrite');
    tx.objectStore(DRAFTS_STORE).put({ key, data, updatedAt: Date.now() });
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function loadDraft(key: string): Promise<{ data: unknown; updatedAt: number } | null> {
  const db = await openDraftsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DRAFTS_STORE, 'readonly');
    const req = tx.objectStore(DRAFTS_STORE).get(key);
    req.onsuccess = () => { db.close(); resolve(req.result || null); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

async function clearDraftFromDb(key: string): Promise<void> {
  const db = await openDraftsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DRAFTS_STORE, 'readwrite');
    tx.objectStore(DRAFTS_STORE).delete(key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

interface AutoSaveOptions {
  debounceMs?: number;
}

interface AutoSaveResult {
  /** True if a draft was found and restored on mount */
  restored: boolean;
  /** Timestamp of last draft save */
  lastSaved: Date | null;
  /** Call after successful form submission to clear the draft */
  clearDraft: () => void;
  /** Call to discard restored draft without submitting */
  discardDraft: () => void;
  /** How long ago the draft was saved (human-readable) */
  restoredAgo: string;
}

export function useAutoSave<T>(
  key: string,
  formState: T,
  options: AutoSaveOptions = {},
): AutoSaveResult {
  const { debounceMs = 2000 } = options;
  const [restored, setRestored] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [restoredAt, setRestoredAt] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);
  const restoringRef = useRef(false);

  // Attempt to load draft on mount
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;

    loadDraft(key).then(draft => {
      if (draft && draft.data) {
        // Don't restore drafts older than 72 hours
        if (Date.now() - draft.updatedAt > 72 * 60 * 60 * 1000) {
          clearDraftFromDb(key).catch(() => {});
          return;
        }
        restoringRef.current = true;
        setRestored(true);
        setRestoredAt(draft.updatedAt);
        // The parent component should check `restored` and use the data
        // We expose it via the formState being updated by the parent
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced save on state change
  useEffect(() => {
    if (!mountedRef.current) return;
    // Skip saving during initial restore
    if (restoringRef.current) {
      restoringRef.current = false;
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      saveDraft(key, formState).then(() => {
        setLastSaved(new Date());
      }).catch(() => {});
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [key, formState, debounceMs]);

  const clearDraft = useCallback(() => {
    clearDraftFromDb(key).catch(() => {});
    setRestored(false);
    setLastSaved(null);
  }, [key]);

  const discardDraft = useCallback(() => {
    clearDraftFromDb(key).catch(() => {});
    setRestored(false);
  }, [key]);

  const restoredAgo = restoredAt
    ? formatTimeAgo(restoredAt)
    : '';

  return { restored, lastSaved, clearDraft, discardDraft, restoredAgo };
}

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Load a draft directly (for use outside the hook pattern).
 */
export async function getDraft<T>(key: string): Promise<T | null> {
  try {
    const draft = await loadDraft(key);
    if (!draft || !draft.data) return null;
    if (Date.now() - draft.updatedAt > 72 * 60 * 60 * 1000) {
      await clearDraftFromDb(key);
      return null;
    }
    return draft.data as T;
  } catch {
    return null;
  }
}
