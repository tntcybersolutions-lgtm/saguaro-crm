/**
 * job-health — one number (0–100) that says how a job is doing, plus the parts
 * it is made of, so the Jobs list, the job page and Home can show a health
 * ring, a schedule bar and RFI / submittal / change-order dots from real data.
 *
 * Every point taken off has a reason the screen can show. Nothing is guessed:
 * a part with no data (no dates, no budget) takes nothing off and says so.
 *
 *   Schedule  up to −40  work done (billed % or % complete) behind time used;
 *                         −25 more once the finish date has passed unfinished
 *   Budget    up to −25  forecast cost over the revised budget
 *   RFIs      up to −15  −5 per overdue open RFI
 *   Submittals up to −15 −5 per overdue open submittal
 *   Change orders up to −10  −3 per change order pending over 14 days
 *
 * Bands: 70–100 on track (green), 50–69 at risk (yellow), 0–49 in trouble (red).
 */

export type HealthTone = 'good' | 'warn' | 'bad';
export type ItemState = 'none' | 'ok' | 'soon' | 'late';

export interface ItemSummary {
  open: number;
  dueSoon: number;
  overdue: number;
  state: ItemState;
}

export interface JobHealth {
  score: number;
  tone: HealthTone;
  reasons: string[];
  schedule: {
    /** Share of the planned duration already used, 0–100 (null without dates). */
    timePct: number | null;
    /** Share of the work done, 0–100 (null when unknown). */
    workPct: number | null;
    /** Days past the finish date while unfinished (0 when not late). */
    daysLate: number;
    /** True when work is behind the time used, or the finish date has passed. */
    behind: boolean;
  };
  budget: { revised: number; forecast: number; overPct: number | null };
  rfis: ItemSummary;
  submittals: ItemSummary;
  changeOrders: ItemSummary;
}

export interface HealthInput {
  stage: 'bidding' | 'building' | 'complete' | 'closed';
  today: string; // YYYY-MM-DD
  start?: string | null;
  finish?: string | null;
  /** 0–100 work complete, from pay apps (billed ÷ contract) or the job's own %. */
  workPct?: number | null;
  budgetRevised?: number;
  budgetForecast?: number;
  rfis?: { status: string | null; due: string | null }[];
  submittals?: { status: string | null; due: string | null }[];
  changeOrders?: { status: string | null; created: string | null }[];
}

const DAY = 86_400_000;
const toDay = (s?: string | null): number | null => {
  if (!s) return null;
  const t = Date.parse(String(s).slice(0, 10) + 'T00:00:00Z');
  return Number.isFinite(t) ? t : null;
};
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

const RFI_CLOSED = new Set(['answered', 'closed', 'void', 'voided', 'cancelled', 'canceled']);
const SUB_CLOSED = new Set(['approved', 'approved_as_noted', 'closed', 'void', 'voided', 'rejected', 'cancelled', 'canceled']);

function dueItems(rows: { status: string | null; due: string | null }[] | undefined, closed: Set<string>, today: number): ItemSummary {
  let open = 0, dueSoon = 0, overdue = 0;
  for (const r of rows || []) {
    if (closed.has(String(r.status || '').toLowerCase())) continue;
    open++;
    const d = toDay(r.due);
    if (d == null) continue;
    if (d < today) overdue++;
    else if (d - today <= 7 * DAY) dueSoon++;
  }
  const state: ItemState = open === 0 ? 'none' : overdue > 0 ? 'late' : dueSoon > 0 ? 'soon' : 'ok';
  return { open, dueSoon, overdue, state };
}

export function jobHealth(input: HealthInput): JobHealth {
  const today = toDay(input.today) ?? Date.now();
  const reasons: string[] = [];
  let score = 100;

  /* Schedule */
  const start = toDay(input.start);
  const finish = toDay(input.finish);
  const workPct = input.workPct == null || !Number.isFinite(input.workPct) ? null : clamp(Math.round(input.workPct), 0, 100);
  let timePct: number | null = null;
  let daysLate = 0;
  let behind = false;
  const active = input.stage === 'building';
  if (start != null && finish != null && finish > start) {
    timePct = clamp(Math.round(((today - start) / (finish - start)) * 100), 0, 100);
  }
  if (active) {
    if (timePct != null && workPct != null && timePct - workPct > 10) {
      const lag = timePct - workPct;
      const off = Math.min(40, Math.round(lag * 0.8));
      score -= off;
      behind = true;
      reasons.push(`Work ${workPct}% done with ${timePct}% of the schedule used (−${off})`);
    }
    if (finish != null && today > finish && (workPct == null || workPct < 100)) {
      daysLate = Math.round((today - finish) / DAY);
      score -= 25;
      behind = true;
      reasons.push(`${daysLate} day${daysLate === 1 ? '' : 's'} past the finish date (−25)`);
    }
  }

  /* Budget */
  const revised = Math.max(0, Number(input.budgetRevised) || 0);
  const forecast = Math.max(0, Number(input.budgetForecast) || 0);
  let overPct: number | null = null;
  if (revised > 0 && forecast > 0) {
    overPct = Math.round(((forecast - revised) / revised) * 1000) / 10;
    if (overPct > 0 && input.stage !== 'bidding') {
      const off = Math.min(25, Math.round(overPct * 2.5));
      if (off > 0) { score -= off; reasons.push(`Forecast ${overPct}% over budget (−${off})`); }
    }
  }

  /* RFIs and submittals */
  const rfis = dueItems(input.rfis, RFI_CLOSED, today);
  const submittals = dueItems(input.submittals, SUB_CLOSED, today);
  if (rfis.overdue > 0) { const off = Math.min(15, rfis.overdue * 5); score -= off; reasons.push(`${rfis.overdue} overdue RFI${rfis.overdue === 1 ? '' : 's'} (−${off})`); }
  if (submittals.overdue > 0) { const off = Math.min(15, submittals.overdue * 5); score -= off; reasons.push(`${submittals.overdue} overdue submittal${submittals.overdue === 1 ? '' : 's'} (−${off})`); }

  /* Change orders: pending is normal; pending for weeks is money waiting. */
  let coOpen = 0, coStale = 0, coSoon = 0;
  for (const c of input.changeOrders || []) {
    if (String(c.status || '').toLowerCase() !== 'pending') continue;
    coOpen++;
    const created = toDay(c.created);
    if (created == null) continue;
    const age = (today - created) / DAY;
    if (age > 14) coStale++;
    else if (age > 7) coSoon++;
  }
  if (coStale > 0) { const off = Math.min(10, coStale * 3); score -= off; reasons.push(`${coStale} change order${coStale === 1 ? '' : 's'} pending over 14 days (−${off})`); }
  const changeOrders: ItemSummary = { open: coOpen, dueSoon: coSoon, overdue: coStale, state: coOpen === 0 ? 'none' : coStale > 0 ? 'late' : coSoon > 0 ? 'soon' : 'ok' };

  score = clamp(Math.round(score), 0, 100);
  const tone: HealthTone = score >= 70 ? 'good' : score >= 50 ? 'warn' : 'bad';
  if (reasons.length === 0) reasons.push('Nothing overdue or over budget');

  return { score, tone, reasons, schedule: { timePct, workPct, daysLate, behind }, budget: { revised, forecast, overPct }, rfis, submittals, changeOrders };
}
