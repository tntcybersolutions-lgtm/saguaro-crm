/**
 * One list of everything the job has committed to pay: subcontracts and
 * purchase orders. A job's subcontracts live in `contracts` (prime contracts
 * with the owner are left out), its POs in `purchase_orders`, and awarding a
 * bid package also writes a `commitments` row for the same deal — that row is
 * merged into its contract by bid package so nothing is counted twice.
 *
 * Billed to date comes from the job's bills matched by vendor name, but only
 * when that vendor holds a single commitment on the job — with two, a bill
 * can't be told apart, so the figure stored on the commitment is used.
 */

export type CommitmentKind = 'Subcontract' | 'Purchase order';

export type CommitmentRow = {
  id: string;
  source: 'contracts' | 'purchase_orders' | 'commitments';
  kind: CommitmentKind;
  number: string | null;
  vendor: string;
  title: string;
  status: string;
  original: number;
  approved_changes: number;
  revised: number;
  billed: number;
  billed_source: 'bills' | 'entered';
  paid: number;
  remaining: number;
  percent_billed: number;
  retainage_pct: number | null;
  retainage_held: number;
  executed_date: string | null;
  href: string;
};

type Rec = Record<string, unknown>;

const DEAD = new Set(['void', 'voided', 'cancelled', 'canceled', 'rejected']);
const BILL_DEAD = new Set(['void', 'voided', 'cancelled', 'canceled', 'rejected', 'draft']);

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const str = (v: unknown) => (v == null ? '' : String(v)).trim();
const norm = (v: unknown) => str(v).toLowerCase().replace(/\s+/g, ' ');
const round = (n: number) => Math.round(n * 100) / 100;
const isPrime = (t: unknown) => /prime|owner/i.test(str(t));

export function buildCommitments(input: {
  projectId: string;
  contracts: Rec[];
  purchaseOrders: Rec[];
  legacy: Rec[];
  bills: Rec[];
}): CommitmentRow[] {
  const { projectId } = input;
  const base = `/app/projects/${projectId}`;
  const rows: CommitmentRow[] = [];

  const legacyByPackage = new Map<string, Rec>();
  for (const c of input.legacy) if (c.bid_package_id) legacyByPackage.set(String(c.bid_package_id), c);
  const usedLegacy = new Set<string>();

  for (const c of input.contracts) {
    if (isPrime(c.contract_type)) continue;
    const twin = c.bid_package_id ? legacyByPackage.get(String(c.bid_package_id)) : undefined;
    if (twin) usedLegacy.add(String(twin.id));
    const original = num(c.amount ?? c.contract_amount) || num(c.original_amount) || num(twin?.original_amount);
    const changes = num(c.approved_changes) || num(twin?.approved_changes);
    rows.push(row({
      id: String(c.id), source: 'contracts', kind: 'Subcontract',
      number: str(c.contract_number) || str(twin?.commitment_number) || null,
      vendor: str(c.party_company) || str(c.party_name) || str(c.vendor_name) || str(c.counterparty_name) || str(twin?.vendor_name),
      title: str(c.title) || str(c.trade) || str(c.scope_summary) || str(twin?.description),
      status: str(c.status) || 'draft',
      original, changes,
      billedEntered: num(c.invoiced_amount) || num(twin?.invoiced_to_date),
      paid: num(c.paid_amount),
      retainage_pct: c.retainage_pct == null ? null : num(c.retainage_pct),
      retainageHeld: num(twin?.retainage_held),
      executed: str(c.executed_date) || (c.executed_at ? str(c.executed_at).slice(0, 10) : '') || null,
      href: `${base}/items/contracts/${c.id}`,
    }));
  }

  for (const c of input.legacy) {
    if (usedLegacy.has(String(c.id))) continue;
    const isPo = /purchase|po/i.test(str(c.commitment_type));
    rows.push(row({
      id: String(c.id), source: 'commitments', kind: isPo ? 'Purchase order' : 'Subcontract',
      number: str(c.commitment_number) || null,
      vendor: str(c.vendor_name),
      title: str(c.description) || str(c.scope_of_work),
      status: str(c.status) || 'active',
      original: num(c.original_amount), changes: num(c.approved_changes),
      billedEntered: num(c.invoiced_to_date), paid: 0,
      retainage_pct: null, retainageHeld: num(c.retainage_held),
      executed: str(c.contract_date) || null,
      href: `${base}/contracts`,
    }));
  }

  for (const p of input.purchaseOrders) {
    const lineSum = Array.isArray(p.line_items) ? (p.line_items as Rec[]).reduce((s, l) => s + (num(l.total) || num(l.amount) || num(l.qty ?? l.quantity) * num(l.unit_price ?? l.rate)), 0) : 0;
    const total = num(p.total) || num(p.subtotal) + num(p.tax) + num(p.shipping) || lineSum;
    rows.push(row({
      id: String(p.id), source: 'purchase_orders', kind: 'Purchase order',
      number: str(p.po_number) || str(p.purchase_order) || null,
      vendor: str(p.vendor_name),
      title: str(p.description) || str(p.cost_code),
      status: str(p.status) || 'draft',
      original: total, changes: 0,
      billedEntered: 0, paid: 0,
      retainage_pct: null, retainageHeld: 0,
      executed: str(p.issued_date) || null,
      href: `${base}/items/purchase_orders/${p.id}`,
    }));
  }

  // Bills by vendor, applied only where the vendor holds exactly one live commitment.
  const live = rows.filter((r) => !DEAD.has(norm(r.status)));
  const perVendor = new Map<string, number>();
  for (const r of live) if (r.vendor) perVendor.set(norm(r.vendor), (perVendor.get(norm(r.vendor)) || 0) + 1);
  const billed = new Map<string, { total: number; paid: number }>();
  for (const b of input.bills) {
    if (BILL_DEAD.has(norm(b.status)) || !str(b.vendor_name)) continue;
    const k = norm(b.vendor_name);
    const cur = billed.get(k) || { total: 0, paid: 0 };
    cur.total += num(b.total) || num(b.amount);
    cur.paid += num(b.paid_amount) || (norm(b.status) === 'paid' ? num(b.total) || num(b.amount) : 0);
    billed.set(k, cur);
  }
  for (const r of live) {
    const k = norm(r.vendor);
    const b = billed.get(k);
    if (!b || perVendor.get(k) !== 1) continue;
    if (b.total > r.billed) {
      r.billed = round(b.total);
      r.billed_source = 'bills';
    }
    if (b.paid > r.paid) r.paid = round(b.paid);
    finish(r);
  }

  return rows.sort((a, b) => (a.number || '~').localeCompare(b.number || '~', undefined, { numeric: true }) || a.vendor.localeCompare(b.vendor));
}

function row(x: {
  id: string; source: CommitmentRow['source']; kind: CommitmentKind; number: string | null; vendor: string; title: string; status: string;
  original: number; changes: number; billedEntered: number; paid: number; retainage_pct: number | null; retainageHeld: number; executed: string | null; href: string;
}): CommitmentRow {
  const r: CommitmentRow = {
    id: x.id, source: x.source, kind: x.kind, number: x.number, vendor: x.vendor || 'No vendor named', title: x.title,
    status: x.status.toLowerCase(),
    original: round(x.original), approved_changes: round(x.changes), revised: round(x.original + x.changes),
    billed: round(x.billedEntered), billed_source: 'entered', paid: round(x.paid),
    remaining: 0, percent_billed: 0,
    retainage_pct: x.retainage_pct, retainage_held: round(x.retainageHeld),
    executed_date: x.executed, href: x.href,
  };
  if (x.retainageHeld > 0) storedRetainage.add(r);
  return finish(r);
}

/** Rows whose retainage was stored on the record (not worked out from billing). */
const storedRetainage = new WeakSet<CommitmentRow>();

function finish(r: CommitmentRow): CommitmentRow {
  r.remaining = round(r.revised - r.billed);
  r.percent_billed = r.revised > 0 ? Math.round((r.billed / r.revised) * 1000) / 10 : 0;
  if (!storedRetainage.has(r)) r.retainage_held = r.retainage_pct ? round((r.billed * r.retainage_pct) / 100) : 0;
  return r;
}

/** Commitments that count toward what the job owes (not voided or cancelled). */
export const isLiveCommitment = (r: CommitmentRow) => !DEAD.has(norm(r.status));
