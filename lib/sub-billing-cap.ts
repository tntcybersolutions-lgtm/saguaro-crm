/**
 * How much more a sub can bill on their subcontract — one answer for the sub
 * portal (before and when they send an invoice) and the GC (when approving one).
 *
 * WHY. A sub could file a portal invoice for any amount: the form checked each
 * line against the line's own scheduled value, which the sub types in, and the
 * server checked nothing. A $612,000 subcontract that was already fully billed
 * would still take another invoice, and the GC could approve it.
 *
 * THE RULE.
 *   contract value  = the sub's live subcontracts on this job, revised
 *                     (original + approved changes) — lib/commitments, the same
 *                     rows the Commitments screen shows
 *   already billed  = what the GC has on record as billed on those subcontracts
 *                     (or the approved / paid portal invoices, if that is more —
 *                     an approved invoice is posted to the subcontract, so the
 *                     larger figure is the one that includes it), plus every
 *                     portal invoice still waiting on review
 *   remaining       = contract value − already billed, never below zero
 *
 * Retainage: billing is measured GROSS — the work billed this period, retainage
 * included. Retainage is money held back from payment, not work the sub can
 * bill twice, so a net-only check would let an invoice run past the contract by
 * exactly the retainage. The remaining figure is also given net of the
 * contract's retainage, so the sub sees what would actually be paid.
 *
 * Pure: the I/O lives in loadBillingRoom at the bottom, every read pinned to
 * the tenant.
 */
import { buildCommitments, isLiveCommitment } from './commitments';

type Rec = Record<string, unknown>;

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const str = (v: unknown) => (v == null ? '' : String(v)).trim();
const norm = (v: unknown) => str(v).toLowerCase().replace(/[.,]/g, '').replace(/\s+/g, ' ');
const cents = (n: number) => Math.round(n * 100);
const dollars = (c: number) => c / 100;

export type PortalInvoiceLike = { id?: unknown; status?: unknown; amount?: unknown; net_amount?: unknown; retainage?: unknown };

/** Statuses an invoice can still be approved from — it adds to billing on top of the record. */
const WAITING = new Set(['submitted', 'under_review', '', 'pending']);
const POSTED = new Set(['approved', 'paid']);

/** The gross an invoice bills (work this period, retainage included). */
export function invoiceGross(inv: PortalInvoiceLike): number {
  if (inv.amount != null && str(inv.amount) !== '') return num(inv.amount);
  return num(inv.net_amount) + num(inv.retainage);
}

export type BillingRoom = {
  /** Revised value of the sub's live subcontracts on this job. */
  contract: number;
  /** Already billed, counting invoices still waiting on review. */
  billed: number;
  /** What is left to bill, gross. Never negative. */
  remaining: number;
  /** Retainage % on the subcontract (null when none is set). */
  retainagePct: number | null;
  /** `remaining` less retainage — what would actually be paid on it. */
  remainingNet: number;
  /** How many subcontracts this was summed from. */
  contracts: number;
};

/**
 * Room left on the contract. `excludeInvoiceId` leaves one invoice out of the
 * waiting pile — the one being approved, which is checked against the rest.
 */
export function billingRoom(input: {
  contracts: Array<{ revised: number; billed: number; retainage_pct?: number | null }>;
  invoices: PortalInvoiceLike[];
  excludeInvoiceId?: string | null;
}): BillingRoom | null {
  if (!input.contracts.length) return null;
  const contractC = input.contracts.reduce((s, c) => s + cents(num(c.revised)), 0);
  const recordedC = input.contracts.reduce((s, c) => s + cents(num(c.billed)), 0);
  let postedC = 0;
  let waitingC = 0;
  for (const inv of input.invoices) {
    if (input.excludeInvoiceId && str(inv.id) === input.excludeInvoiceId) continue;
    const st = str(inv.status).toLowerCase().replace(/[\s-]+/g, '_');
    const g = cents(invoiceGross(inv));
    if (POSTED.has(st)) postedC += g;
    else if (WAITING.has(st)) waitingC += g;
  }
  const billedC = Math.max(recordedC, postedC) + waitingC;
  const remainingC = Math.max(0, contractC - billedC);
  const pcts = input.contracts.map((c) => (c.retainage_pct == null ? null : num(c.retainage_pct))).filter((p): p is number => p != null && p > 0);
  const retainagePct = pcts.length ? Math.max(...pcts) : null;
  const remainingNetC = remainingC - Math.round((remainingC * (retainagePct ?? 0)) / 100);
  return {
    contract: dollars(contractC), billed: dollars(billedC), remaining: dollars(remainingC),
    retainagePct, remainingNet: dollars(remainingNetC), contracts: input.contracts.length,
  };
}

const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });

/** The sentence the sub sees about what is left (also used as the cap error). */
export function remainingSentence(room: BillingRoom): string {
  if (room.remaining <= 0) return `This contract is fully billed — ${usd(room.contract)} of ${usd(room.contract)}. Ask your GC for a change order to bill more.`;
  return `You can bill up to ${usd(room.remaining)} more on this contract.`;
}

export type CapCheck = { ok: true } | { ok: false; message: string; over: number; room: BillingRoom };

/** Does an invoice billing `gross` this period fit in the room? A cent of rounding is allowed. */
export function checkBillingCap(room: BillingRoom | null, gross: number): CapCheck {
  if (!room) return { ok: true };
  const overC = cents(gross) - cents(room.remaining);
  if (overC <= 0) return { ok: true };
  return { ok: false, message: remainingSentence(room), over: dollars(overC), room };
}

/** The GC's wording when an approval would run the sub past their contract. */
export function approvalCapMessage(subName: string, cap: Extract<CapCheck, { ok: false }>): string {
  const who = subName || 'This sub';
  return cap.room.remaining <= 0
    ? `Approving this bills ${who} ${usd(cap.over)} past their ${usd(cap.room.contract)} contract, which is already fully billed. Send it back or approve a change order first.`
    : `Approving this bills ${who} ${usd(cap.over)} past their ${usd(cap.room.contract)} contract — only ${usd(cap.room.remaining)} is left to bill. Send it back or approve a change order first.`;
}

/** The sub's subcontracts on the job, from the commitments list, by company name. */
export function subContracts(rows: ReturnType<typeof buildCommitments>, subName: string) {
  const want = norm(subName);
  if (!want) return [];
  return rows.filter((r) => r.kind === 'Subcontract' && isLiveCommitment(r) && norm(r.vendor) === want);
}

/* ── I/O ─────────────────────────────────────────────────────────────── */

type Db = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Room left for one sub on one job. Null when the sub holds no subcontract on
 * the job — nothing to measure against, so nothing is capped.
 */
export async function loadBillingRoom(db: Db, tenantId: string, projectId: string, subId: string, opts?: { subName?: string | null; excludeInvoiceId?: string | null }): Promise<BillingRoom | null> {
  let subName = str(opts?.subName);
  if (!subName) {
    const { data, error } = await db.from('subcontractors').select('company_name').eq('tenant_id', tenantId).eq('id', subId).maybeSingle();
    if (error) throw error;
    subName = str((data as Rec | null)?.company_name);
  }
  if (!subName) return null;
  const [c, p, l, b, inv] = await Promise.all([
    db.from('contracts').select('id, contract_number, contract_type, title, trade, scope_summary, party_name, party_company, vendor_name, counterparty_name, status, amount, contract_amount, original_amount, approved_changes, invoiced_amount, paid_amount, retainage_pct, executed_date, executed_at, bid_package_id').eq('tenant_id', tenantId).eq('project_id', projectId),
    db.from('purchase_orders').select('id, po_number, purchase_order, vendor_name, description, cost_code, status, total, subtotal, tax, shipping, line_items, issued_date, notes').eq('tenant_id', tenantId).eq('project_id', projectId),
    db.from('commitments').select('id, commitment_number, commitment_type, vendor_name, description, scope_of_work, status, original_amount, approved_changes, invoiced_to_date, retainage_held, contract_date, bid_package_id').eq('tenant_id', tenantId).eq('project_id', projectId),
    db.from('bills').select('vendor_name, total, amount, paid_amount, status').eq('tenant_id', tenantId).eq('project_id', projectId),
    db.from('portal_sub_pay_apps').select('id, status, amount, net_amount, retainage').eq('tenant_id', tenantId).eq('project_id', projectId).eq('sub_id', subId),
  ]);
  for (const r of [c, p, l, b, inv]) if (r.error) throw r.error;
  const rows = buildCommitments({ projectId, contracts: (c.data || []) as Rec[], purchaseOrders: (p.data || []) as Rec[], legacy: (l.data || []) as Rec[], bills: (b.data || []) as Rec[] });
  const mine = subContracts(rows, subName);
  return billingRoom({ contracts: mine, invoices: (inv.data || []) as PortalInvoiceLike[], excludeInvoiceId: opts?.excludeInvoiceId ?? null });
}
