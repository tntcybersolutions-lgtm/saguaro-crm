/**
 * The QuickBooks row's `settings` JSON — what is kept there and what may leave
 * the server. Pure.
 *
 * Tokens live in the access_token / refresh_token columns and never in
 * settings; older rows put them in settings, so every read that reaches a
 * browser goes through stripSecrets().
 */
import type { SyncCounts, SyncEntity } from './mapping';

/** Ids already resolved in ONE QuickBooks company. A different realm starts empty. */
export type QboCache = {
  realm: string;
  item: { id: string; name: string } | null;
  /** nameKey(owner name) → QuickBooks Customer.Id */
  customers: Record<string, string>;
};

export type QboHistoryEntry = {
  at: string;
  by: string;
  entities: SyncEntity[];
  counts: SyncCounts;
  /** First failures of the run, for the history list. */
  errors: { label: string; message: string }[];
  remaining: number;
};

export type QboSettings = {
  environment?: 'sandbox' | 'production';
  company_name?: string | null;
  /** 'YYYY-MM-DD' — pay apps dated before it are not sent. null = send all. */
  invoice_start_date?: string | null;
  qbo_cache?: QboCache;
  sync_history?: QboHistoryEntry[];
};

export const MAX_HISTORY = 25;

const SECRET_KEY = /token|secret|password|passwd|api[_-]?key|private[_-]?key|credential|authorization/i;

/** A copy with every secret-looking key removed, at any depth. */
export function stripSecrets(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripSecrets);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (SECRET_KEY.test(k)) continue;
      out[k] = stripSecrets(val);
    }
    return out;
  }
  return v;
}

export function asSettings(v: unknown): QboSettings {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as QboSettings) : {};
}

/** The id cache for this realm — empty when it was built against another company. */
export function cacheFor(settings: QboSettings, realmId: string): QboCache {
  const c = settings.qbo_cache;
  if (c && c.realm === realmId) {
    return { realm: realmId, item: c.item ?? null, customers: { ...(c.customers ?? {}) } };
  }
  return { realm: realmId, item: null, customers: {} };
}

/**
 * True when a new connection points at a different QuickBooks company (or a
 * different Intuit environment) than the ids Saguaro already stored. Those ids
 * mean nothing in the new company and must be forgotten, or every record synced
 * to sandbox would be skipped in production as "already in QuickBooks".
 */
export function companyChanged(previous: { realmId: string | null | undefined; environment: string | null | undefined }, next: { realmId: string; environment: string }): boolean {
  if (previous.realmId && previous.realmId !== next.realmId) return true;
  if (previous.environment && previous.environment !== next.environment) return true;
  return false;
}

export function pushHistory(history: unknown, entry: QboHistoryEntry): QboHistoryEntry[] {
  const list = Array.isArray(history) ? (history as QboHistoryEntry[]) : [];
  return [entry, ...list].slice(0, MAX_HISTORY);
}
