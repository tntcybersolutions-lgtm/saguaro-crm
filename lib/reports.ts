/**
 * The Reports chart library — every tile's numbers, computed from raw rows.
 * Pure: no I/O. GET /api/reports/summary loads the rows (tenant-scoped) and
 * hands them here; the screen only draws what comes back.
 *
 * A tile with nothing to show is null, never a row of zeros — the screen hides
 * it. Money by month uses the job page's rules (lib/job-monthly) so the two
 * never disagree; budget lines go through lib/budget-line; contract and billed
 * to date use lib/job-picker and lib/home/flat.
 */
import { buildJobMonthly, type JobMonth } from './job-monthly';
import { lastMonths } from './home/finance';
import { billedByJob, type PayAppIn } from './home/flat';
import { contractOf } from './job-picker';
import { toBudgetLineView } from './budget-line';
import { dayKey, daysBetween } from './submittal-workflow';

export type ReportRange = '90d' | '12m' | 'all';
export const REPORT_RANGES: ReportRange[] = ['90d', '12m', 'all'];
export const parseRange = (v: unknown): ReportRange => (REPORT_RANGES.includes(v as ReportRange) ? (v as ReportRange) : '12m');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MAX_MONTHS = 60;
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const low = (v: unknown) => String(v ?? '').trim().toLowerCase();
const ym = (v: unknown) => { const d = dayKey(typeof v === 'string' ? v : null); return d ? d.slice(0, 7) : null; };
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

/** First day (YYYY-MM-DD) the range covers; null = all time. */
export function rangeStart(today: string, range: ReportRange): string | null {
  if (range === 'all') return null;
  const [y, m, d] = today.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d);
  const back = range === '90d' ? 89 : 364;
  return new Date(t - back * 86400000).toISOString().slice(0, 10);
}

/** Months a by-month chart shows, ending this month. "all" reaches back to the earliest dated row. */
export function monthCount(today: string, range: ReportRange, earliest: string | null): number {
  if (range === '90d') return 3;
  if (range === '12m' || !earliest) return 12;
  const [ty, tm] = today.split('-').map(Number);
  const [ey, em] = earliest.split('-').map(Number);
  const n = (ty - ey) * 12 + (tm - em) + 1;
  return Math.max(12, Math.min(MAX_MONTHS, n));
}

/** Month keys with short labels — the year shows on January and on the first bar. */
export function monthAxis(today: string, count: number): { month: string; label: string }[] {
  return lastMonths(today, count).map((k, i) => {
    const [y, m] = k.split('-').map(Number);
    return { month: k, label: m === 1 || i === 0 ? `${MONTHS[m - 1]} ${String(y).slice(2)}` : MONTHS[m - 1] };
  });
}

const inRange = (day: string | null, start: string | null, today: string) => !!day && (!start || day >= start) && day <= today;

/* ── Inputs ───────────────────────────────────────────────────────────── */

export type ProjectRow = { id: string; name?: string | null; revised_contract_value?: unknown; contract_amount?: unknown; contract_value?: unknown };
export type ReportInput = {
  today: string;
  range: ReportRange;
  projects: ProjectRow[];
  /** null = this person may not see that module; the tile stays null. */
  payApps?: (PayAppIn & { payment_received_at?: string | null })[] | null;
  bills?: { project_id?: string | null; total?: unknown; amount?: unknown; status?: string | null; due_date?: string | null; created_at?: string | null }[] | null;
  budgetLines?: Record<string, unknown>[] | null;
  changeOrders?: { project_id?: string | null; amount?: unknown; status?: string | null; approved_at?: string | null; created_at?: string | null }[] | null;
  rfis?: { status?: string | null; created_at?: string | null; submitted_at?: string | null; answered_at?: string | null; answered_date?: string | null; closed_at?: string | null }[] | null;
  submittals?: { status?: string | null; created_at?: string | null; submitted_at?: string | null; returned_at?: string | null; reviewed_at?: string | null; response_date?: string | null; days_to_review?: unknown }[] | null;
  punch?: { status?: string | null; trade?: string | null }[] | null;
  incidents?: { incident_date?: string | null; created_at?: string | null; near_miss?: boolean | null; incident_type?: string | null; type?: string | null }[] | null;
  tasks?: { project_id?: string | null; status?: string | null; pct_complete?: unknown; end_date?: string | null; baseline_end?: string | null }[] | null;
};

/* ── Tiles ────────────────────────────────────────────────────────────── */

export type MoneyTile = { months: JobMonth[]; totals: { billed: number; collected: number; costs: number; changes: number } };
export type ContractRow = { projectId: string; name: string; contract: number; billed: number; remaining: number };
export type ContractTile = { rows: ContractRow[]; totals: { contract: number; billed: number; remaining: number } };
export type BudgetRow = { projectId: string; name: string; budget: number; forecast: number; variance: number };
export type BudgetTile = { rows: BudgetRow[]; net: number; overCount: number };
export type RfiTile = { months: { month: string; label: string; opened: number; closed: number }[]; openNow: number; avgDays: number | null; answered: number };
export type SubmittalTile = { byStatus: { status: string; label: string; count: number }[]; total: number; avgReviewDays: number | null; reviewed: number };
export type PunchTile = { byTrade: { trade: string; count: number }[]; open: number };
export type ChangeOrderTile = { months: { month: string; label: string; approved: number }[]; approvedTotal: number; pendingTotal: number; pendingCount: number };
export type SafetyTile = { months: { month: string; label: string; incidents: number }[]; total: number; daysSinceLast: number | null; lastDate: string | null };
export type ScheduleRow = { projectId: string; name: string; onTime: number; late: number; total: number; pctOnTime: number };
export type ScheduleTile = { rows: ScheduleRow[]; pctOnTime: number; late: number; total: number };

export type ReportSummary = {
  today: string;
  range: ReportRange;
  start: string | null;
  money: MoneyTile | null;
  contract: ContractTile | null;
  budget: BudgetTile | null;
  rfis: RfiTile | null;
  submittals: SubmittalTile | null;
  punch: PunchTile | null;
  changeOrders: ChangeOrderTile | null;
  safety: SafetyTile | null;
  schedule: ScheduleTile | null;
};

const RFI_DONE = new Set(['closed', 'answered', 'void', 'voided', 'cancelled', 'canceled']);
const PUNCH_DONE = new Set(['closed', 'completed', 'complete', 'verified', 'done', 'resolved', 'void', 'cancelled', 'canceled']);
const TASK_DONE = new Set(['completed', 'complete', 'done', 'finished']);
const CO_PENDING = new Set(['pending', 'submitted', 'in_review', 'under_review', 'sent', 'pending_approval']);
const SUBMITTAL_LABEL: Record<string, string> = {
  pending: 'Pending', submitted: 'Submitted', under_review: 'Under review', in_review: 'Under review',
  approved: 'Approved', approved_as_noted: 'Approved as noted', revise_resubmit: 'Revise & resubmit',
  rejected: 'Rejected', closed: 'Closed', draft: 'Draft',
};
const titleCase = (s: string) => s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function earliestMonth(input: ReportInput): string | null {
  let e: string | null = null;
  const see = (v: unknown) => { const k = ym(v); if (k && (!e || k < e)) e = k; };
  for (const p of input.payApps ?? []) { see(p.submitted_at ?? p.application_date); see(p.payment_received_at); }
  for (const b of input.bills ?? []) see(b.due_date ?? b.created_at);
  for (const c of input.changeOrders ?? []) see(c.approved_at);
  for (const r of input.rfis ?? []) see(r.submitted_at ?? r.created_at);
  for (const i of input.incidents ?? []) see(i.incident_date ?? i.created_at);
  return e;
}

export function buildReportSummary(input: ReportInput): ReportSummary {
  const { today, range } = input;
  const start = rangeStart(today, range);
  const count = monthCount(today, range, earliestMonth(input));
  const axis = monthAxis(today, count);
  const names = new Map(input.projects.map((p) => [p.id, String(p.name || 'Untitled job')]));
  const nameOf = (id: string) => names.get(id) || 'Untitled job';

  /* 1. Money by month — the job page's rules, across every job in scope. */
  let money: MoneyTile | null = null;
  if (input.payApps && input.bills && input.changeOrders) {
    const m = buildJobMonthly({ today, count, apps: input.payApps, bills: input.bills, changeOrders: input.changeOrders });
    if (m.months.some((x) => x.billed || x.collected || x.costs)) money = m;
  }

  /* 2. Contract vs billed to date vs remaining, by job. */
  let contract: ContractTile | null = null;
  if (input.payApps) {
    const billed = billedByJob(input.payApps);
    const rows: ContractRow[] = [];
    for (const p of input.projects) {
      const c = contractOf(p as never);
      if (!c) continue;
      const b = Math.round(billed.get(p.id) || 0);
      rows.push({ projectId: p.id, name: nameOf(p.id), contract: Math.round(c), billed: b, remaining: Math.round(c) - b });
    }
    rows.sort((a, b) => b.contract - a.contract);
    if (rows.length) contract = { rows, totals: rows.reduce((t, r) => ({ contract: t.contract + r.contract, billed: t.billed + r.billed, remaining: t.remaining + r.remaining }), { contract: 0, billed: 0, remaining: 0 }) };
  }

  /* 3. Budget health — revised budget minus forecast at completion, by job. Positive = under. */
  let budget: BudgetTile | null = null;
  if (input.budgetLines) {
    const by = new Map<string, { budget: number; forecast: number }>();
    for (const row of input.budgetLines) {
      const id = String(row.project_id ?? '');
      if (!id) continue;
      const v = toBudgetLineView(row);
      const a = by.get(id) || { budget: 0, forecast: 0 };
      a.budget += v.revised_budget; a.forecast += v.forecast_cost;
      by.set(id, a);
    }
    const rows: BudgetRow[] = Array.from(by, ([id, a]) => ({ projectId: id, name: nameOf(id), budget: Math.round(a.budget), forecast: Math.round(a.forecast), variance: Math.round(a.budget - a.forecast) }))
      .filter((r) => r.budget || r.forecast)
      .sort((a, b) => a.variance - b.variance);
    if (rows.length) budget = { rows, net: rows.reduce((t, r) => t + r.variance, 0), overCount: rows.filter((r) => r.variance < 0).length };
  }

  /* 4. RFIs — opened and closed per month, open right now, average days to answer. */
  let rfis: RfiTile | null = null;
  if (input.rfis && input.rfis.length) {
    const by = new Map(axis.map((a) => [a.month, { opened: 0, closed: 0 }]));
    const days: number[] = [];
    let openNow = 0;
    for (const r of input.rfis) {
      const st = low(r.status);
      const asked = r.submitted_at || r.created_at || null;
      const doneAt = r.answered_at || r.answered_date || r.closed_at || null;
      const done = RFI_DONE.has(st);
      if (!done) openNow++;
      const o = ym(asked); if (o && by.has(o)) by.get(o)!.opened++;
      const c = done ? ym(doneAt) : null; if (c && by.has(c)) by.get(c)!.closed++;
      if (done && inRange(dayKey(doneAt), start, today)) { const d = daysBetween(asked, doneAt); if (d != null && d >= 0) days.push(d); }
    }
    rfis = { months: axis.map((a) => ({ ...a, ...by.get(a.month)! })), openNow, avgDays: avg(days), answered: days.length };
  }

  /* 5. Submittals — by status, and average days from submitted to returned. */
  let submittals: SubmittalTile | null = null;
  if (input.submittals) {
    const rows = input.submittals.filter((s) => !start || inRange(dayKey(s.submitted_at || s.created_at || null), start, today));
    if (rows.length) {
      const counts = new Map<string, number>();
      const days: number[] = [];
      for (const s of rows) {
        const st = low(s.status) || 'pending';
        counts.set(st, (counts.get(st) || 0) + 1);
        const back = s.returned_at || s.reviewed_at || s.response_date || null;
        const d = back ? daysBetween(s.submitted_at || s.created_at || null, back) : (num(s.days_to_review) > 0 && st !== 'pending' ? num(s.days_to_review) : null);
        if (d != null && d >= 0) days.push(d);
      }
      submittals = {
        byStatus: Array.from(counts, ([status, count]) => ({ status, label: SUBMITTAL_LABEL[status] || titleCase(status), count })).sort((a, b) => b.count - a.count),
        total: rows.length, avgReviewDays: avg(days), reviewed: days.length,
      };
    }
  }

  /* 6. Punch list — open items by trade (right now). */
  let punch: PunchTile | null = null;
  if (input.punch) {
    const counts = new Map<string, number>();
    for (const p of input.punch) {
      if (PUNCH_DONE.has(low(p.status))) continue;
      const t = String(p.trade || '').trim() || 'No trade';
      counts.set(t, (counts.get(t) || 0) + 1);
    }
    const byTrade = Array.from(counts, ([trade, count]) => ({ trade, count })).sort((a, b) => b.count - a.count);
    if (byTrade.length) punch = { byTrade, open: byTrade.reduce((t, r) => t + r.count, 0) };
  }

  /* 7. Change orders — approved dollars by month; pending dollars right now. */
  let changeOrders: ChangeOrderTile | null = null;
  if (input.changeOrders && input.changeOrders.length) {
    const by = new Map(axis.map((a) => [a.month, 0]));
    let pendingTotal = 0; let pendingCount = 0;
    for (const c of input.changeOrders) {
      const st = low(c.status);
      if (st === 'approved') { const k = ym(c.approved_at); if (k && by.has(k)) by.set(k, by.get(k)! + num(c.amount)); }
      else if (CO_PENDING.has(st)) { pendingTotal += num(c.amount); pendingCount++; }
    }
    const months = axis.map((a) => ({ ...a, approved: Math.round(by.get(a.month)!) }));
    const approvedTotal = months.reduce((t, m) => t + m.approved, 0);
    if (approvedTotal || pendingCount) changeOrders = { months, approvedTotal, pendingTotal: Math.round(pendingTotal), pendingCount };
  }

  /* 8. Safety — incidents by month (near misses left out), days since the last one. */
  let safety: SafetyTile | null = null;
  if (input.incidents) {
    const real = input.incidents.filter((i) => !i.near_miss && !/near[\s_-]?miss/.test(low(i.incident_type || i.type)));
    if (real.length) {
      const by = new Map(axis.map((a) => [a.month, 0]));
      let last: string | null = null;
      for (const i of real) {
        const d = dayKey(i.incident_date || i.created_at || null);
        if (!d || d > today) continue;
        if (!last || d > last) last = d;
        const k = d.slice(0, 7); if (by.has(k)) by.set(k, by.get(k)! + 1);
      }
      const months = axis.map((a) => ({ ...a, incidents: by.get(a.month)! }));
      safety = { months, total: months.reduce((t, m) => t + m.incidents, 0), daysSinceLast: last ? daysBetween(last, today) : null, lastDate: last };
    }
  }

  /* 9. Schedule — tasks on time vs late, by job. Late = past its finish and not done, or finishing after its baseline. */
  let schedule: ScheduleTile | null = null;
  if (input.tasks) {
    const by = new Map<string, { onTime: number; late: number }>();
    for (const t of input.tasks) {
      const id = String(t.project_id || '');
      const end = dayKey(t.end_date || null);
      if (!id || !end) continue;
      const done = TASK_DONE.has(low(t.status)) || num(t.pct_complete) >= 100;
      const base = dayKey(t.baseline_end || null);
      const late = (!done && end < today) || (!!base && end > base);
      const a = by.get(id) || { onTime: 0, late: 0 };
      if (late) a.late++; else a.onTime++;
      by.set(id, a);
    }
    const rows: ScheduleRow[] = Array.from(by, ([id, a]) => ({ projectId: id, name: nameOf(id), ...a, total: a.onTime + a.late, pctOnTime: Math.round((a.onTime / (a.onTime + a.late)) * 100) }))
      .sort((a, b) => a.pctOnTime - b.pctOnTime);
    if (rows.length) {
      const total = rows.reduce((t, r) => t + r.total, 0);
      const late = rows.reduce((t, r) => t + r.late, 0);
      schedule = { rows, total, late, pctOnTime: Math.round(((total - late) / total) * 100) };
    }
  }

  return { today, range, start, money, contract, budget, rfis, submittals, punch, changeOrders, safety, schedule };
}
