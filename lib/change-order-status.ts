/**
 * lib/change-order-status.ts — the ONE way a change order is written once it
 * exists: approve, reject, un-approve, an amount edit, a status picked on the
 * record page, the approvals inbox, the command-center flow, bulk edit.
 *
 * A change order's status is money. Approving one moves the job's contract
 * (projects.contract_amount / revised_contract_value), the prime contract's
 * approved_changes and the budget's approved_changes (its cost-code line or the
 * CO-UNALLOCATED line) — lib/change-order-cascade. Rejecting or un-approving an
 * approved CO takes all of that back off; editing the amount of an approved CO
 * moves it by the difference. The cascade recomputes from the approved COs on
 * the job, so running it twice changes nothing.
 *
 * What it used to be: /approve, /reject, PUT and PATCH ran the cascade, but the
 * record page's status picker (PATCH /api/items/change_orders/:id), the
 * catch-all's POST /api/change-orders/:id/approve and the command-center flow
 * each wrote `status` themselves and stopped there — the CO read Approved and
 * the contract never moved. Every one of them now calls writeChangeOrder().
 */
import { applyChangeOrderMoney } from './change-order-cascade';
import { isApprovedCoStatus } from './job-contract';
import { runInBackground } from './background';

type Row = Record<string, unknown>;

/** True when a write to `status` decides or reverses a decision — the Full-permission moves. */
export function isCoDecision(before: { status?: unknown } | null | undefined, nextStatus: unknown): boolean {
  if (typeof nextStatus !== 'string') return false;
  const next = nextStatus.toLowerCase();
  const prev = String(before?.status ?? '').toLowerCase();
  if (next === prev) return false;
  // Approving or rejecting, or moving a CO that was approved anywhere else (un-approving it).
  return isApprovedCoStatus(next) || next === 'rejected' || isApprovedCoStatus(prev);
}

export type CoWriteResult =
  | { ok: true; before: Row; after: Row; delta: number; newlyApproved: boolean }
  | { ok: false; status: 404; error: string };

/**
 * Write `patch` to change order `id` and apply what it does to the job's money.
 * Stamps approved_at/by on approval and rejected_at/by on rejection when the
 * caller did not. `select` is what comes back as `after` (default every column).
 */
export async function writeChangeOrder(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  tenantId: string,
  id: string,
  patch: Row,
  opts: { actorId?: string | null; select?: string; before?: Row | null; /** false: skip the owner email + notification (proof scripts). */ notify?: boolean } = {},
): Promise<CoWriteResult> {
  let before = opts.before ?? null;
  if (!before) {
    const { data, error } = await db.from('change_orders').select('*')
      .eq('id', id).eq('tenant_id', tenantId).maybeSingle();
    if (error) throw error;
    before = (data as Row | null) ?? null;
  }
  if (!before) return { ok: false, status: 404, error: 'Change order not found' };
  before = { ...before }; // the row as it stood — never the object a write may touch

  const write: Row = { ...patch };
  const prev = String(before.status ?? '').toLowerCase();
  if (typeof write.status === 'string') {
    write.status = write.status.toLowerCase();
    const next = write.status as string;
    const now = new Date().toISOString();
    if (next === 'approved' && prev !== 'approved') {
      if (write.approved_at === undefined) write.approved_at = now;
      if (write.approved_by === undefined && opts.actorId) write.approved_by = opts.actorId;
    }
    if (next === 'rejected' && prev !== 'rejected') {
      if (write.rejected_at === undefined) write.rejected_at = now;
      if (write.rejected_by === undefined && opts.actorId) write.rejected_by = opts.actorId;
    }
  }

  const { data: after, error } = await db.from('change_orders').update(write)
    .eq('id', id).eq('tenant_id', tenantId).select(opts.select || '*').maybeSingle();
  if (error) throw error;
  if (!after) return { ok: false, status: 404, error: 'Change order not found' };

  /* The money moves BEFORE the answer: the screen reloads the contract right
     after this returns, and a failure here is one the GC has to hear about.
     `after` may be a narrow select — the cascade needs status, amount and the
     bid package, so it is handed the full row merged over what was read. */
  const full = { ...before, ...write, ...(after as Row) };
  const { delta } = await applyChangeOrderMoney(db, tenantId, before as never, full as never);
  const newlyApproved = isApprovedCoStatus(String(full.status ?? '')) && !isApprovedCoStatus(prev);
  if (newlyApproved && opts.notify !== false) {
    // Owner email + notification; the money is already done (money: false).
    // Loaded on use: lib/triggers builds service clients at import, which a
    // route that never approves anything should not pay for.
    runInBackground(async () => {
      const { onChangeOrderApproved } = await import('./triggers');
      await onChangeOrderApproved(id, { money: false });
    }, 'onChangeOrderApproved');
  }
  return { ok: true, before, after: after as Row, delta, newlyApproved };
}
