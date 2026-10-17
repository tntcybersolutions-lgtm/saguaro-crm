/**
 * List tools — the pure half of the shared list kit (components/ui/kit.tsx
 * DataTable). Column order, value filters, saved-view shape and the bulk
 * runner live here so they can be tested without a browser.
 *
 * Bulk actions never write a table directly. Each one calls, row by row, the
 * SAME route the single-record edit on that screen calls, so the route's own
 * permission check, validation, status transitions and side effects (lien
 * waivers on a pay-app approval, budget lines on a change order) apply to
 * every row exactly as they would one at a time. A row the server refuses is
 * reported with the server's own reason and left untouched.
 */

/** Column filters: column key → the plain values a row may have (OR within a column, AND across columns). */
export type ListFilters = Record<string, string[]>;

export type ListViewState = {
  /** Every column key, in display order. */
  order: string[];
  hidden: string[];
  widths: Record<string, number>;
  filters: ListFilters;
  sort: { key: string; dir: 'asc' | 'desc' } | null;
  groupBy: string | null;
};

/** The saved_views row as the API returns it. */
export type SavedListView = {
  id: string;
  name: string;
  columns: string[] | null;
  column_widths?: Record<string, number> | null;
  filters?: { groupBy?: string | null; values?: ListFilters; order?: string[] } | null;
  sort_by: string | null;
  sort_direction: string | null;
  is_default?: boolean | null;
  is_shared?: boolean;
  mine?: boolean;
};

/**
 * Keeps a stored column order valid against the columns the table has today:
 * unknown keys drop out, new columns join at their natural position, and the
 * first column (the record's name) always stays first.
 */
export function mergeOrder(stored: readonly string[] | null | undefined, keys: readonly string[]): string[] {
  if (keys.length === 0) return [];
  const known = new Set(keys);
  const kept = (stored ?? []).filter((k, i, a) => known.has(k) && a.indexOf(k) === i);
  const missing = keys.filter((k) => !kept.includes(k));
  // Insert each new column after the column that precedes it in the default order.
  const out = [...kept];
  for (const k of missing) {
    const at = keys.indexOf(k);
    const prev = at > 0 ? keys[at - 1] : null;
    const idx = prev ? out.indexOf(prev) : -1;
    out.splice(idx + 1, 0, k);
  }
  const first = keys[0];
  return [first, ...out.filter((k) => k !== first)];
}

/** Moves `key` one place up (-1) or down (+1). The first column never moves. */
export function moveColumn(order: readonly string[], key: string, delta: -1 | 1): string[] {
  const i = order.indexOf(key);
  const j = i + delta;
  if (i <= 0 || j <= 0 || j >= order.length) return [...order];
  const out = [...order];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** Drops `key` at the position of `target` (drag and drop). The first column never moves. */
export function dropColumn(order: readonly string[], key: string, target: string): string[] {
  if (key === target) return [...order];
  const from = order.indexOf(key);
  const to = order.indexOf(target);
  if (from <= 0 || to < 0) return [...order];
  const out = order.filter((k) => k !== key);
  out.splice(Math.max(1, to), 0, key);
  return out;
}

/** Plain text of a cell value for filtering, grouping and export. */
export function plainValue(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') return '';
  return String(v);
}

/** How a stored value reads in a chip or a filter list: in_review → In review. */
export function humanValue(v: string): string {
  if (v === '') return '(blank)';
  if (/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(v)) {
    const s = v.replace(/_/g, ' ');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  return v;
}

/** True when the row passes every column filter. */
export function rowMatches(filters: ListFilters, valueOf: (key: string) => unknown): boolean {
  for (const [key, allowed] of Object.entries(filters)) {
    if (!allowed || allowed.length === 0) continue;
    if (!allowed.includes(plainValue(valueOf(key)))) return false;
  }
  return true;
}

/** Removes empty or unknown filters. */
export function cleanFilters(f: ListFilters | null | undefined, keys: readonly string[]): ListFilters {
  const out: ListFilters = {};
  if (!f || typeof f !== 'object') return out;
  for (const [k, v] of Object.entries(f)) {
    if (!keys.includes(k) || !Array.isArray(v)) continue;
    const vals = v.filter((x): x is string => typeof x === 'string');
    if (vals.length) out[k] = Array.from(new Set(vals));
  }
  return out;
}

/** Distinct values of a column, most common first, for the filter picker. */
export function distinctValues(values: readonly unknown[], limit = 60): { value: string; count: number }[] {
  const m = new Map<string, number>();
  for (const v of values) {
    const p = plainValue(v);
    m.set(p, (m.get(p) ?? 0) + 1);
  }
  return Array.from(m.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, limit);
}

/** The body POST/PATCH /api/saved-views takes for a view state. */
export function viewPayload(s: ListViewState) {
  const visible = s.order.filter((k) => !s.hidden.includes(k));
  return {
    columns: visible,
    column_widths: s.widths,
    sort_by: s.sort?.key ?? null,
    sort_direction: s.sort?.dir ?? 'asc',
    filters: { groupBy: s.groupBy, values: s.filters, order: s.order },
  };
}

/** A saved view turned back into a state for a table with these column keys. */
export function stateFromView(v: SavedListView, keys: readonly string[]): ListViewState {
  const order = mergeOrder(v.filters?.order ?? v.columns ?? null, keys);
  const visible = Array.isArray(v.columns) && v.columns.length ? new Set(v.columns) : null;
  const widths: Record<string, number> = {};
  for (const [k, w] of Object.entries(v.column_widths ?? {})) {
    if (keys.includes(k) && typeof w === 'number' && Number.isFinite(w)) widths[k] = Math.max(60, Math.min(800, Math.round(w)));
  }
  return {
    order,
    hidden: visible ? keys.filter((k, i) => i !== 0 && !visible.has(k)) : [],
    widths,
    filters: cleanFilters(v.filters?.values, keys),
    sort: v.sort_by && keys.includes(v.sort_by) ? { key: v.sort_by, dir: v.sort_direction === 'desc' ? 'desc' : 'asc' } : null,
    groupBy: v.filters?.groupBy && keys.includes(v.filters.groupBy) ? v.filters.groupBy : null,
  };
}

// ─── Bulk ────────────────────────────────────────────────────────────────────

export type BulkOutcome = {
  done: number;
  failed: number;
  /** The first reason the server gave for a refusal, in its own words. */
  firstError: string | null;
  /** True when every failure was a permission refusal (401/403). */
  refused: boolean;
};

/**
 * Runs one request per row — never a single blanket UPDATE — a few at a time.
 * `run` returns the Response of the same route the single-record edit uses.
 */
export async function runBulk<T>(rows: readonly T[], run: (row: T) => Promise<Response>, concurrency = 4): Promise<BulkOutcome> {
  let done = 0;
  let failed = 0;
  let firstError: string | null = null;
  let refusals = 0;
  let i = 0;
  const worker = async () => {
    while (i < rows.length) {
      const row = rows[i++];
      try {
        const res = await run(row);
        if (res.ok) { done++; continue; }
        failed++;
        if (res.status === 401 || res.status === 403) refusals++;
        if (!firstError) {
          const j = (await res.json().catch(() => null)) as { error?: unknown } | null;
          firstError = typeof j?.error === 'string' && j.error ? j.error : `The server said no (${res.status}).`;
        }
      } catch (e) {
        failed++;
        if (!firstError) firstError = e instanceof Error && /fetch|network/i.test(e.message) ? 'No connection.' : 'The request did not finish.';
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, rows.length)) }, worker));
  return { done, failed, firstError, refused: failed > 0 && refusals === failed };
}

/** One sentence for the result of a bulk action. */
export function bulkSummary(o: BulkOutcome, noun: string, verb: string): string {
  const n = o.done + o.failed;
  const plural = (k: number) => `${k} ${noun}${k === 1 ? '' : 's'}`;
  if (o.failed === 0) return `${plural(o.done)} ${verb}.`;
  if (o.done === 0) return `No ${noun}s ${verb}. ${o.firstError ?? ''}`.trim();
  return `${o.done} of ${n} ${verb}. ${o.failed} didn't: ${o.firstError ?? 'try them again.'}`;
}

/**
 * A JSON request to a record route (the same call the single-record editor
 * makes), signed in the same two ways the screens are: the session cookie and
 * the Bearer token.
 */
export async function jsonRequest(url: string, method: 'PATCH' | 'PUT' | 'POST' | 'DELETE', body?: unknown): Promise<Response> {
  const { getAuthHeaders } = await import('@/lib/supabase-browser');
  const auth = await getAuthHeaders();
  return fetch(url, {
    method,
    credentials: 'include',
    headers: { ...auth, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
