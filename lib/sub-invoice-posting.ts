/**
 * A sub's portal invoice reaches the job's money when the GC acts on it.
 *
 *   approve           the invoice's gross (work billed this period, retainage
 *                     included) is added to the sub's subcontract "billed to
 *                     date" and to the budget line's actual cost
 *   send back after   the same amount comes off again (an approved invoice can
 *   approving         still be sent back — lib/sub-invoice-status)
 *   mark paid         the net paid is added to the subcontract's paid
 *
 * Until this, approving only changed the invoice's status: the commitment kept
 * showing the old billed figure and the budget never saw the cost.
 *
 * Which commitment: the job's one live subcontract with this sub — a
 * `commitments` row naming the sub, else the subcontract (`contracts`) whose
 * company is the sub's company. Two or more and it can't be told apart, so
 * nothing is guessed: the invoice is approved and the GC is told it was not
 * posted. Which budget line: the commitment's own line, else its bid award's
 * cost code, else the one line whose description names the sub.
 *
 * The choosing and the arithmetic are pure (and tested); postSubInvoice does
 * the reads and writes, every one pinned to the tenant.
 */
import { budgetLineFinder } from './budget-line';
import { awardPackageOf } from './commitments';
import type { SubInvoiceStatus } from './sub-invoice-status';

type Rec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const DEAD = new Set(['void', 'voided', 'cancelled', 'canceled', 'rejected', 'terminated']);
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const str = (v: unknown) => (v == null ? '' : String(v)).trim();
const norm = (v: unknown) => str(v).toLowerCase().replace(/[.,]/g, '').replace(/\s+/g, ' ');
const round = (n: number) => Math.round(n * 100) / 100;
const isPrime = (t: unknown) => /prime|owner/i.test(str(t));

export type SubCommitment = {
  source: 'contracts' | 'commitments';
  id: string;
  number: string | null;
  vendor: string;
  title: string;
  revised: number;
  billed: number;
  paid: number;
  /** The `commitments` twin of a bid-award subcontract, if there is one. */
  twin: Rec | null;
  row: Rec;
};

const vendorOf = (c: Rec) => str(c.party_company) || str(c.party_name) || str(c.vendor_name) || str(c.counterparty_name);

/** The job's one live subcontract with this sub, or null when there is none or more than one. */
export function pickSubCommitment(input: { subId: string; subName: string; contracts: Rec[]; legacy: Rec[] }): SubCommitment | null {
  const want = norm(input.subName);
  const live = (r: Rec) => !DEAD.has(norm(r.status));
  const legacyById = input.legacy.filter((c) => live(c) && str(c.subcontractor_id) === input.subId);
  const legacyByName = input.legacy.filter((c) => live(c) && want && norm(c.vendor_name) === want);
  const legacyMine = legacyById.length ? legacyById : legacyByName;
  const contracts = input.contracts.filter((c) => live(c) && !isPrime(c.contract_type) && want && norm(vendorOf(c)) === want);

  if (contracts.length === 1) {
    const c = contracts[0];
    const twin = c.bid_package_id ? input.legacy.find((l) => str(l.bid_package_id) === str(c.bid_package_id)) ?? null : null;
    const original = num(c.amount ?? c.contract_amount) || num(c.original_amount) || num(twin?.original_amount);
    return {
      source: 'contracts', id: str(c.id), number: str(c.contract_number) || str(twin?.commitment_number) || null,
      vendor: vendorOf(c), title: str(c.title) || str(c.trade) || str(twin?.description),
      revised: round(original + (num(c.approved_changes) || num(twin?.approved_changes))),
      billed: round(num(c.invoiced_amount) || num(twin?.invoiced_to_date)), paid: round(num(c.paid_amount)),
      twin, row: c,
    };
  }
  if (contracts.length === 0 && legacyMine.length === 1) {
    const c = legacyMine[0];
    return {
      source: 'commitments', id: str(c.id), number: str(c.commitment_number) || null,
      vendor: str(c.vendor_name) || input.subName, title: str(c.description) || str(c.scope_of_work),
      revised: round(num(c.current_amount) || num(c.original_amount) + num(c.approved_changes)),
      billed: round(num(c.invoiced_to_date)), paid: 0, twin: null, row: c,
    };
  }
  return null;
}

/** What one status move posts: + on approve, − when an approved invoice is sent back, paid on paid. */
export function postingFor(from: SubInvoiceStatus, to: SubInvoiceStatus, inv: Rec): { billed: number; paid: number } {
  const gross = inv.amount != null ? num(inv.amount) : num(inv.net_amount) + num(inv.retainage);
  if (to === 'approved' && from !== 'approved') return { billed: round(gross), paid: 0 };
  if (to === 'rejected' && from === 'approved') return { billed: round(-gross), paid: 0 };
  if (to === 'paid' && from === 'approved') return { billed: 0, paid: round(num(inv.net_amount ?? inv.amount)) };
  return { billed: 0, paid: 0 };
}

/** The budget line a sub's cost lands on, or null when no line is clearly theirs. */
export function budgetLineForCommitment(c: SubCommitment, lines: Rec[], purchaseOrders: Rec[]): Rec | null {
  const ids = new Set(lines.map((l) => str(l.id)));
  const own = str(c.row.budget_line_id) || str(c.twin?.budget_line_id);
  if (own && ids.has(own)) return lines.find((l) => str(l.id) === own) ?? null;
  const find = budgetLineFinder(lines as { id: string }[]);
  const pkg = str(c.row.bid_package_id);
  if (pkg) {
    const po = purchaseOrders.find((p) => awardPackageOf(p) === pkg && str(p.cost_code));
    const hit = po ? find(po.cost_code) : null;
    if (hit) return lines.find((l) => str(l.id) === hit) ?? null;
  }
  const div = str(c.row.csi_division) || str(c.twin?.csi_division);
  const named = lines.filter((l) => c.vendor && norm(l.description).includes(norm(c.vendor)));
  if (named.length === 1) return named[0];
  if (div) {
    const hit = find(div);
    if (hit) return lines.find((l) => str(l.id) === hit) ?? null;
  }
  return null;
}

/** Plain summary of where an invoice sits against its subcontract (for the inbox card). */
export function commitmentSummary(c: SubCommitment | null, inv: Rec, status: SubInvoiceStatus) {
  if (!c) return null;
  const gross = inv.amount != null ? num(inv.amount) : num(inv.net_amount) + num(inv.retainage);
  // An approved or paid invoice is already inside `billed`; a waiting one would add to it.
  const after = status === 'submitted' || status === 'under_review' ? round(c.billed + gross) : c.billed;
  return {
    source: c.source, id: c.id, number: c.number, vendor: c.vendor, title: c.title,
    revised: c.revised, billed: c.billed, billed_after: after,
    over_by: c.revised > 0 && after > c.revised ? round(after - c.revised) : 0,
  };
}

/* ── I/O ─────────────────────────────────────────────────────────────── */

type Db = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export type PostResult = {
  posted: boolean;
  commitment: { vendor: string; number: string | null; billed: number; revised: number } | null;
  budgetLine: { cost_code: string | null; description: string | null } | null;
  reason?: string;
};

/** The job's subcontract rows, award POs and the sub's company — what the choosing needs. */
export async function loadSubCommitments(db: Db, tenantId: string, projectId: string) {
  const [ct, cm, po] = await Promise.all([
    db.from('contracts').select('*').eq('tenant_id', tenantId).eq('project_id', projectId),
    db.from('commitments').select('*').eq('tenant_id', tenantId).eq('project_id', projectId),
    db.from('purchase_orders').select('id, cost_code, notes, status').eq('tenant_id', tenantId).eq('project_id', projectId),
  ]);
  for (const q of [ct, cm, po]) if (q.error) throw q.error;
  return { contracts: (ct.data || []) as Rec[], legacy: (cm.data || []) as Rec[], purchaseOrders: (po.data || []) as Rec[] };
}

export async function postSubInvoice(db: Db, tenantId: string, inv: Rec, from: SubInvoiceStatus, to: SubInvoiceStatus): Promise<PostResult> {
  const delta = postingFor(from, to, inv);
  if (!delta.billed && !delta.paid) return { posted: false, commitment: null, budgetLine: null };

  const { data: sub, error: subErr } = await db.from('subcontractors').select('company_name').eq('tenant_id', tenantId).eq('id', inv.sub_id).maybeSingle();
  if (subErr) throw subErr;
  const job = await loadSubCommitments(db, tenantId, inv.project_id);
  const c = pickSubCommitment({ subId: str(inv.sub_id), subName: str(sub?.company_name), contracts: job.contracts, legacy: job.legacy });
  if (!c) return { posted: false, commitment: null, budgetLine: null, reason: 'no single subcontract with this sub on the job' };

  const billed = round(c.billed + delta.billed);
  const paid = round(c.paid + delta.paid);
  if (c.source === 'contracts') {
    const { error } = await db.from('contracts').update({ invoiced_amount: billed, ...(delta.paid ? { paid_amount: paid } : {}), updated_at: new Date().toISOString() })
      .eq('id', c.id).eq('tenant_id', tenantId);
    if (error) throw error;
  }
  // The legacy row (on its own, or as an award's twin) keeps its own running figures too.
  const legacy = c.source === 'commitments' ? c.row : c.twin;
  if (legacy && delta.billed) {
    const inv2 = round(num(legacy.invoiced_to_date) + delta.billed);
    const ret = round(num(legacy.retainage_held) + (delta.billed > 0 ? num(inv.retainage) : -num(inv.retainage)));
    const current = num(legacy.current_amount) || num(legacy.original_amount) + num(legacy.approved_changes);
    const { error } = await db.from('commitments').update({ invoiced_to_date: inv2, retainage_held: Math.max(0, ret), balance_remaining: round(current - inv2), updated_at: new Date().toISOString() })
      .eq('id', legacy.id).eq('tenant_id', tenantId);
    if (error) throw error;
  }

  let budgetLine: PostResult['budgetLine'] = null;
  if (delta.billed) {
    const { data: lines, error: lErr } = await db.from('budget_lines').select('id, cost_code, description, division, actual').eq('tenant_id', tenantId).eq('project_id', inv.project_id);
    if (lErr) throw lErr;
    const line = budgetLineForCommitment(c, (lines || []) as Rec[], job.purchaseOrders);
    if (line) {
      const { error } = await db.from('budget_lines').update({ actual: round(num(line.actual) + delta.billed) }).eq('id', line.id).eq('tenant_id', tenantId);
      if (error) throw error;
      budgetLine = { cost_code: str(line.cost_code) || null, description: str(line.description) || null };
    }
  }
  return { posted: true, commitment: { vendor: c.vendor, number: c.number, billed, revised: c.revised }, budgetLine };
}
