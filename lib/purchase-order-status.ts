/**
 * lib/purchase-order-status.ts — the ONE set of moves a purchase order can make.
 *
 *   draft → (pending_approval → approved →) sent → acknowledged → partially_received → received → closed
 *   void from anything that is not closed (or already void)
 *
 * `sent` is the stored word for "issued to the vendor" (the PO screen, the
 * status badges and the KPI tiles all read `sent`); `issued` is accepted as the
 * same step. A PO sent for approval in the approvals inbox comes back to draft
 * when it is rejected.
 *
 * What it used to be: PATCH /api/purchase-orders/:id/status wrote whatever
 * string it was given — a closed PO could go back to draft, a void PO to
 * received, a typo became a status no screen could show. The status route,
 * the record page, the editors, the approvals inbox and bulk edit now all
 * call transitionPoStatus().
 */

export const PO_STATUSES = [
  'draft', 'pending_approval', 'approved', 'sent', 'acknowledged', 'partially_received', 'received', 'closed', 'void',
] as const;
export type PoStatus = (typeof PO_STATUSES)[number];

/** Words other screens and older rows use for the same step. */
const ALIASES: Record<string, PoStatus> = {
  issued: 'sent',
  pending: 'pending_approval',
  submitted: 'pending_approval',
  under_review: 'pending_approval',
  'partially received': 'partially_received',
  partial: 'partially_received',
  delivered: 'received',
  cancelled: 'void',
  canceled: 'void',
  voided: 'void',
};

/** Where each status may go next. Same-status is a no-op, not a move. */
export const PO_TRANSITIONS: Record<PoStatus, readonly PoStatus[]> = {
  draft:              ['pending_approval', 'approved', 'sent', 'void'],
  pending_approval:   ['approved', 'draft', 'void'],
  approved:           ['sent', 'void'],
  sent:               ['acknowledged', 'partially_received', 'received', 'void'],
  acknowledged:       ['partially_received', 'received', 'void'],
  partially_received: ['received', 'void'],
  received:           ['closed', 'void'],
  closed:             [],
  void:               [],
};

/** A status word as the canonical status, or null when it is not one. */
export function normalizePoStatus(s: unknown): PoStatus | null {
  if (typeof s !== 'string') return null;
  const k = s.trim().toLowerCase().replace(/-/g, '_');
  if ((PO_STATUSES as readonly string[]).includes(k)) return k as PoStatus;
  return ALIASES[k] ?? ALIASES[k.replace(/_/g, ' ')] ?? null;
}

const label = (s: string) => s.replace(/_/g, ' ');

/** null when `from → to` is allowed (or a no-op); otherwise the reason, written for the GC. */
export function poTransitionError(from: unknown, to: unknown): string | null {
  const t = normalizePoStatus(to);
  if (!t) return `"${String(to)}" is not a purchase-order status. Use one of: ${PO_STATUSES.map(label).join(', ')}.`;
  const f = normalizePoStatus(from) ?? 'draft';
  if (f === t) return null;
  if (PO_TRANSITIONS[f].includes(t)) return null;
  if (f === 'closed' || f === 'void') return `This purchase order is ${label(f)} — it can't be moved to ${label(t)}.`;
  const next = PO_TRANSITIONS[f].map(label).join(' or ');
  return `A ${label(f)} purchase order can't go to ${label(t)}. Next it can be: ${next}.`;
}

/** The stamps a move carries (only the columns that exist on purchase_orders). */
export function poStamps(before: Record<string, unknown>, to: PoStatus, actorId?: string | null): Record<string, unknown> {
  const now = new Date().toISOString();
  const s: Record<string, unknown> = {};
  if (to === 'approved' && !before.approved_at) { s.approved_at = now; if (actorId) s.approved_by = actorId; }
  if (to === 'sent' && !before.issued_date) s.issued_date = now.slice(0, 10);
  if (to === 'received' && !before.delivered_at) s.delivered_at = now;
  return s;
}

export type PoTransitionResult =
  | { ok: true; before: Record<string, unknown>; after: Record<string, unknown>; changed: boolean }
  | { ok: false; status: 404 | 409 | 422; error: string };

/**
 * Move PO `id` to `to`, refusing a move the map does not allow. The write is
 * conditional on the status it read, so two clicks racing cannot both land.
 * `extra` is written with the move (an editor saving other fields too).
 */
export async function transitionPoStatus(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  tenantId: string,
  id: string,
  to: unknown,
  opts: { actorId?: string | null; extra?: Record<string, unknown>; before?: Record<string, unknown> | null } = {},
): Promise<PoTransitionResult> {
  let before = opts.before ?? null;
  if (!before) {
    const { data, error } = await db.from('purchase_orders').select('*').eq('id', id).eq('tenant_id', tenantId).maybeSingle();
    if (error) throw error;
    before = (data as Record<string, unknown> | null) ?? null;
  }
  if (!before) return { ok: false, status: 404, error: 'Purchase order not found' };
  const err = poTransitionError(before.status, to);
  if (err) return { ok: false, status: normalizePoStatus(to) ? 409 : 422, error: err };
  const target = normalizePoStatus(to)!;
  const from = before.status == null ? null : String(before.status);
  const changed = normalizePoStatus(from) !== target || from !== target;
  const write: Record<string, unknown> = { ...(opts.extra || {}), status: target, ...(changed ? poStamps(before, target, opts.actorId) : {}) };
  let q = db.from('purchase_orders').update(write).eq('id', id).eq('tenant_id', tenantId);
  q = from == null ? q.is('status', null) : q.eq('status', from);
  const { data: after, error } = await q.select('*').maybeSingle();
  if (error) throw error;
  if (!after) return { ok: false, status: 409, error: 'This purchase order changed while you were working on it. Reload it and try again.' };
  return { ok: true, before, after: after as Record<string, unknown>, changed };
}
