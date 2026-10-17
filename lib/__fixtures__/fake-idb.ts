/**
 * The slice of IndexedDB the offline outbox uses — open/upgrade, one object
 * store per transaction, put/get/getAll/delete, deleteDatabase — in memory,
 * for tests that run lib/offline/outbox.ts in Node.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
type Rec = Record<string, any>;

export function installFakeIndexedDb(): { reset: () => void } {
  const dbs = new Map<string, { version: number; stores: Map<string, { keyPath?: string; rows: Map<string, Rec> }> }>();
  const later = (f: () => void) => setTimeout(f, 0);

  function makeDb(name: string) {
    const d = dbs.get(name)!;
    return {
      objectStoreNames: { contains: (s: string) => d.stores.has(s) },
      createObjectStore: (s: string, o?: { keyPath?: string }) => { d.stores.set(s, { keyPath: o?.keyPath, rows: new Map() }); return {}; },
      close: () => undefined,
      transaction: (storeName: string) => {
        const st = d.stores.get(storeName);
        if (!st) throw new Error(`no store ${storeName}`);
        const t: Rec = { oncomplete: null, onerror: null, onabort: null, error: null };
        const req = (run: () => unknown) => {
          const r: Rec = { result: undefined };
          // Values are cloned on the way in and out, as IndexedDB does.
          r.result = structuredClone(run());
          later(() => t.oncomplete?.());
          return r;
        };
        t.objectStore = () => ({
          put: (v: Rec, key?: string) => req(() => { const k = key ?? v[st.keyPath!]; st.rows.set(String(k), structuredClone(v)); return k; }),
          get: (k: string) => req(() => st.rows.get(String(k))),
          getAll: () => req(() => [...st.rows.values()]),
          delete: (k: string) => req(() => { st.rows.delete(String(k)); return undefined; }),
        });
        return t;
      },
    };
  }

  (globalThis as any).indexedDB = {
    open(name: string, version = 1) {
      const r: Rec = { result: null, error: null };
      later(() => {
        let d = dbs.get(name);
        const upgrade = !d || d.version < version;
        if (!d) { d = { version, stores: new Map() }; dbs.set(name, d); }
        d.version = Math.max(d.version, version);
        r.result = makeDb(name);
        if (upgrade) r.onupgradeneeded?.();
        r.onsuccess?.();
      });
      return r;
    },
    deleteDatabase(name: string) {
      const r: Rec = {};
      later(() => { dbs.delete(name); r.onsuccess?.(); });
      return r;
    },
  };
  return { reset: () => dbs.clear() };
}
