/**
 * Where a takeoff stands, read from what is in it — not from a flag alone.
 *
 * WHY. takeoffs.status is written by whoever saves the header. The Pima job's
 * takeoff (and Copper Ridge's) carried status 'complete', a priced total and
 * 118 pages, with no drawing stored and not one measured item — no
 * takeoff_materials row, no takeoff_line_items row. Every screen that trusted
 * the flag called it Complete: the Takeoff Studio list, the job's journey
 * ("Measure the drawings" ticked off), the estimate seeding, the stalled-export
 * nudge. A takeoff with nothing measured is not complete.
 *
 * THE RULE. 'complete' holds only with at least one measured item (an AI
 * material line or a measured line item). A stored 'complete' with none reads
 * 'empty'. Every other status reads as stored. Saving a takeoff as complete
 * with no lines is refused (canSaveComplete).
 *
 * Pure; takeoffItemCounts takes the caller's server client.
 */

export type TakeoffStatus = 'pending' | 'uploaded' | 'analyzing' | 'complete' | 'failed';
export type TakeoffState = TakeoffStatus | 'empty';

const KNOWN: readonly TakeoffStatus[] = ['pending', 'uploaded', 'analyzing', 'complete', 'failed'];

/** The takeoff's real state: a stored 'complete' with no measured items is 'empty'. */
export function takeoffState(status: unknown, itemCount: number | null | undefined): TakeoffState {
  const s = String(status ?? '').trim().toLowerCase();
  const known = (KNOWN as readonly string[]).includes(s) ? (s as TakeoffStatus) : 'pending';
  if (known === 'complete' && !(Number(itemCount) > 0)) return 'empty';
  return known;
}

/** True only for a takeoff that is complete AND has something measured in it. */
export function isTakeoffComplete(status: unknown, itemCount: number | null | undefined): boolean {
  return takeoffState(status, itemCount) === 'complete';
}

export const TAKEOFF_STATE_LABEL: Record<TakeoffState, string> = {
  pending: 'Not analyzed', uploaded: 'Not analyzed', analyzing: 'Analyzing', complete: 'Complete', failed: 'Failed', empty: 'Nothing measured',
};

/** Whether a takeoff may be saved as complete with this many lines, and why not. */
export function canSaveComplete(lineCount: number): { ok: true } | { ok: false; message: string } {
  return lineCount > 0 ? { ok: true } : { ok: false, message: 'Measure at least one item before saving — a takeoff with nothing in it can’t be complete.' };
}

/* ── server ──────────────────────────────────────────────────────────── */

type Db = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Measured items per takeoff (AI materials + measured line items), from the
 * takeoff_item_counts view (supabase/migrations/20261017z_takeoff_item_counts.sql).
 * Ids with nothing measured are 0.
 */
export async function takeoffItemCounts(db: Db, tenantId: string, ids: readonly string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const want = Array.from(new Set(ids.filter(Boolean)));
  for (const id of want) out[id] = 0;
  if (!want.length) return out;
  const { data, error } = await db.from('takeoff_item_counts').select('takeoff_id, items').eq('tenant_id', tenantId).in('takeoff_id', want);
  if (error) throw error;
  for (const r of (data || []) as Array<{ takeoff_id: string; items: number | string | null }>) out[r.takeoff_id] = Number(r.items) || 0;
  return out;
}

/** Rows with `status` replaced by their real state and the measured count attached. */
export async function withTakeoffState<T extends Record<string, unknown>>(db: Db, tenantId: string, rows: T[]): Promise<Array<T & { status: TakeoffState; stored_status: unknown; item_count: number }>> {
  const counts = await takeoffItemCounts(db, tenantId, rows.map((r) => String(r.id ?? '')));
  return rows.map((r) => {
    const n = counts[String(r.id ?? '')] ?? 0;
    return { ...r, stored_status: r.status, item_count: n, status: takeoffState(r.status, n) };
  });
}
