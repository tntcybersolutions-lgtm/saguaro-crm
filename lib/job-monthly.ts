/**
 * A job's money by month, last 12 months: what was billed to the owner
 * (pay apps sent, G702 line 8), what came in (payments received), what it
 * cost (bills, by due date or entry date; void/rejected/draft left out), and
 * change orders approved. Same billed/paid rules as Home finance, so the two
 * never disagree. Pure — no I/O.
 */
import { BILLED_STATUSES, type PayAppIn } from './home/flat';
import { lastMonths } from './home/finance';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const ym = (v: unknown) => { const s = typeof v === 'string' ? v.slice(0, 7) : ''; return /^\d{4}-\d{2}$/.test(s) ? s : null; };
const BILL_DEAD = new Set(['void', 'voided', 'cancelled', 'canceled', 'rejected', 'draft']);

export type JobMonth = { month: string; label: string; billed: number; collected: number; costs: number; changes: number };
export type JobMonthly = { months: JobMonth[]; totals: { billed: number; collected: number; costs: number; changes: number } };

export function buildJobMonthly(input: {
  today: string;
  apps: (PayAppIn & { payment_received_at?: string | null })[];
  bills: { total?: unknown; amount?: unknown; status?: string | null; due_date?: string | null; created_at?: string | null }[];
  changeOrders: { amount?: unknown; status?: string | null; approved_at?: string | null }[];
}): JobMonthly {
  const keys = lastMonths(input.today, 12);
  const by = new Map(keys.map((k) => [k, { billed: 0, collected: 0, costs: 0, changes: 0 }]));
  for (const p of input.apps) {
    const st = String(p.status || '').toLowerCase();
    if (!BILLED_STATUSES.includes(st)) continue;
    const sent = ym(p.submitted_at) || ym(p.application_date);
    if (sent && by.has(sent)) by.get(sent)!.billed += num(p.current_payment_due);
    const paid = ym(p.payment_received_at);
    if (paid && by.has(paid) && (st === 'paid' || p.payment_received_at)) by.get(paid)!.collected += num(p.payment_amount) || num(p.current_payment_due);
  }
  for (const b of input.bills) {
    if (BILL_DEAD.has(String(b.status || '').toLowerCase())) continue;
    const k = ym(b.due_date) || ym(b.created_at);
    if (k && by.has(k)) by.get(k)!.costs += num(b.total) || num(b.amount);
  }
  for (const c of input.changeOrders) {
    if (String(c.status || '').toLowerCase() !== 'approved') continue;
    const k = ym(c.approved_at);
    if (k && by.has(k)) by.get(k)!.changes += num(c.amount);
  }
  const months = keys.map((k, i) => {
    const [y, m] = k.split('-').map(Number);
    const v = by.get(k)!;
    return { month: k, label: m === 1 || i === 0 ? `${MONTHS[m - 1]} ${String(y).slice(2)}` : MONTHS[m - 1], billed: Math.round(v.billed), collected: Math.round(v.collected), costs: Math.round(v.costs), changes: Math.round(v.changes) };
  });
  const totals = months.reduce((t, m) => ({ billed: t.billed + m.billed, collected: t.collected + m.collected, costs: t.costs + m.costs, changes: t.changes + m.changes }), { billed: 0, collected: 0, costs: 0, changes: 0 });
  return { months, totals };
}
