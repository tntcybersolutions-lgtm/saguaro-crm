/**
 * lib/cash-flow-projection.ts — a job's forward cash flow, month by month.
 *
 * Only money that is really still coming or going is projected:
 *
 *   Money in   = sent pay apps not yet paid (by expected pay date)
 *              + owner invoices not yet paid (by due date)
 *              + contract still to bill (revised − billed), net of retainage,
 *                spread evenly from this month to the job's end month
 *              + retainage held (plus retainage on the future billing),
 *                released in the end month
 *   Money out  = vendor bills not yet paid (by due date)
 *              + committed costs not yet billed, spread to the end month
 *
 * A closed / completed / archived job has no run-rate at all: only the open
 * items it still carries (unpaid bills, unpaid pay apps, retainage held, due
 * now). Nothing is ever spread past the job's end date, and a job with
 * nothing left projects $0.
 *
 * Why this exists: the old route divided the TOTAL of every subcontract by
 * six and booked it as a payable in every month, whether or not a dollar of
 * it was still owed — a finished, fully paid job showed $218,333.33 going out
 * every month for six months. Pure; tested in cash-flow-projection.sanity.test.ts.
 */

export type CashFlowLineItem = { type: 'receivable' | 'payable' | 'retainage'; label: string; amount: number };

export type CashFlowPeriod = {
  month: string;
  start: string;
  end: string;
  receivables: number;
  payables: number;
  retainage_release: number;
  net: number;
  running_balance: number;
  line_items: CashFlowLineItem[];
};

export type CashFlowInput = {
  /** Company calendar day, YYYY-MM-DD. */
  today: string;
  status: string | null | undefined;
  /** Contract end date (projects.end_date). */
  endDate?: string | null;
  /** End dates of schedule tasks not yet complete — a slipped schedule pushes the end out. */
  openTaskEndDates?: Array<string | null | undefined>;
  /** Revised contract (original + approved COs), dollars. */
  revisedContract: number;
  /** Total completed & stored to date on the latest pay app, dollars. */
  billedToDate: number;
  /** Retainage held on the latest pay app, dollars. */
  retainageHeld: number;
  /** Retainage %, 0–100. */
  retainagePct: number;
  /** Pay apps sent to the owner and not yet paid. */
  unpaidPayApps: Array<{ label: string; amount: number; expectedDate: string | null }>;
  /** Owner invoices (money in) not yet paid. */
  unpaidReceivables: Array<{ label: string; amount: number; dueDate: string | null }>;
  /** Vendor bills / payable invoices (money out) not yet paid. */
  unpaidPayables: Array<{ label: string; amount: number; dueDate: string | null }>;
  /** Committed cost not yet billed (commitments remaining / budget cost to complete), dollars. */
  committedUnbilled: number;
  months?: number;
};

export type CashFlowProjection = {
  closed: boolean;
  endMonth: string | null;
  remainingToBill: number;
  periods: CashFlowPeriod[];
  summary: {
    total_receivables: number;
    total_payables: number;
    net_cash_flow: number;
    retainage_due: number;
    danger_zone: boolean;
  };
};

const CLOSED = new Set(['completed', 'complete', 'closed', 'cancelled', 'canceled', 'archived', 'lost']);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const cents = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) : 0; };
const dollars = (c: number) => c / 100;
const pad = (n: number) => String(n).padStart(2, '0');
const ym = (d: string | null | undefined) => {
  const m = /^(\d{4})-(\d{2})/.exec(String(d ?? ''));
  return m ? Number(m[1]) * 12 + (Number(m[2]) - 1) : null;
};

/** Split `total` cents into `n` parts that add back to exactly `total`. */
function spread(total: number, n: number): number[] {
  if (n <= 0 || total <= 0) return Array(Math.max(0, n)).fill(0);
  const base = Math.floor(total / n);
  const out = Array(n).fill(base);
  for (let i = 0; i < total - base * n; i++) out[i] += 1;
  return out;
}

export function projectCashFlow(input: CashFlowInput): CashFlowProjection {
  const count = input.months ?? 6;
  const closed = CLOSED.has(String(input.status ?? '').toLowerCase().trim());
  const now = ym(input.today) ?? 0;

  // End month: the later of the contract end date and any open schedule task.
  const ends = [input.endDate, ...(input.openTaskEndDates ?? [])].map(ym).filter((x): x is number => x != null);
  const endAbs = ends.length ? Math.max(...ends) : null;
  // Index of the end month in the window (0 = this month). Past end → this month.
  // No end date → the remaining work is spread over the whole window.
  const endIdx = closed ? 0 : endAbs == null ? count - 1 : Math.max(0, endAbs - now);

  // Index of a dated item in the window; overdue lands this month, beyond → null.
  const slot = (d: string | null | undefined) => {
    const a = ym(d);
    const i = a == null ? 0 : Math.max(0, a - now);
    return i < count ? i : null;
  };

  const rec: number[] = Array(count).fill(0);
  const pay: number[] = Array(count).fill(0);
  const ret: number[] = Array(count).fill(0);
  const items: CashFlowLineItem[][] = Array.from({ length: count }, () => []);

  for (const p of input.unpaidPayApps) {
    const c = cents(p.amount); const i = slot(p.expectedDate);
    if (c <= 0 || i == null) continue;
    rec[i] += c; items[i].push({ type: 'receivable', label: p.label, amount: dollars(c) });
  }
  for (const r of input.unpaidReceivables) {
    const c = cents(r.amount); const i = slot(r.dueDate);
    if (c <= 0 || i == null) continue;
    rec[i] += c; items[i].push({ type: 'receivable', label: r.label, amount: dollars(c) });
  }
  for (const b of input.unpaidPayables) {
    const c = cents(b.amount); const i = slot(b.dueDate);
    if (c <= 0 || i == null) continue;
    pay[i] += c; items[i].push({ type: 'payable', label: b.label, amount: -dollars(c) });
  }

  const remainingToBillC = Math.max(0, cents(input.revisedContract) - cents(input.billedToDate));
  const pct = Math.min(100, Math.max(0, Number(input.retainagePct) || 0));
  let retainageReleaseC = Math.max(0, cents(input.retainageHeld));

  if (!closed) {
    // Contract still to bill, spread from now to the end month. Retainage is
    // held back from each billing and comes in with the release at the end.
    const span = endIdx + 1;
    const futureRetC = Math.round((remainingToBillC * pct) / 100);
    const billing = spread(remainingToBillC - futureRetC, span);
    const costs = spread(Math.max(0, cents(input.committedUnbilled)), span);
    retainageReleaseC += endIdx < count ? futureRetC : 0;
    for (let i = 0; i < Math.min(span, count); i++) {
      if (billing[i] > 0) { rec[i] += billing[i]; items[i].push({ type: 'receivable', label: 'Remaining contract billing', amount: dollars(billing[i]) }); }
      if (costs[i] > 0) { pay[i] += costs[i]; items[i].push({ type: 'payable', label: 'Committed costs still to bill', amount: -dollars(costs[i]) }); }
    }
  }
  // Retainage held comes in at closeout: the end month, or now on a closed job.
  if (retainageReleaseC > 0 && endIdx < count) {
    ret[endIdx] += retainageReleaseC;
    items[endIdx].push({ type: 'retainage', label: 'Retainage release', amount: dollars(retainageReleaseC) });
  }

  const periods: CashFlowPeriod[] = [];
  let running = 0, totRec = 0, totPay = 0, totNet = 0, dipped = false;
  for (let i = 0; i < count; i++) {
    const abs = now + i;
    const y = Math.floor(abs / 12), m = abs % 12;
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const net = rec[i] - pay[i] + ret[i];
    running += net; totRec += rec[i]; totPay += pay[i]; totNet += net;
    if (running < 0) dipped = true;
    periods.push({
      month: `${MONTHS[m]} ${y}`,
      start: `${y}-${pad(m + 1)}-01`,
      end: `${y}-${pad(m + 1)}-${pad(last)}`,
      receivables: dollars(rec[i]),
      payables: dollars(pay[i]),
      retainage_release: dollars(ret[i]),
      net: dollars(net),
      running_balance: dollars(running),
      line_items: items[i],
    });
  }

  return {
    closed,
    endMonth: endAbs == null ? null : `${Math.floor(endAbs / 12)}-${pad((endAbs % 12) + 1)}`,
    remainingToBill: dollars(remainingToBillC),
    periods,
    summary: {
      total_receivables: dollars(totRec),
      total_payables: dollars(totPay),
      net_cash_flow: dollars(totNet),
      retainage_due: dollars(Math.max(0, cents(input.retainageHeld))),
      danger_zone: dipped,
    },
  };
}
