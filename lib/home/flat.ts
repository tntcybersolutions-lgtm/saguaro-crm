/**
 * Flat Home — the rows and figures the list-first Home renders.
 *
 * Pure (no I/O): lib/home/flat-build.ts loads the records, this turns them into
 * Bidding / Jobs / Money rows, the COI count and the number strip, and
 * lib/home/flat.sanity.test.ts pins every rule. The words are built here, once,
 * so the page only lays them out.
 *
 * Rules kept:
 * - Nothing is invented. A package with no due date says "no due date"; a job
 *   with no contract value shows no money; a figure the caller may not see is
 *   null and the page says so.
 * - Dates are calendar days ('YYYY-MM-DD') compared with `today` from the
 *   request's time zone (lib/time-zone), never the server's.
 */
import { addDays, daysBetween, fmtMoneyShort, type Metric } from './rank';
import { isClosedStatus, isDoneStatus, PLACEHOLDER_WAIVER_PREFIX } from '@/lib/project-lifecycle';
import { pickerSection } from '@/lib/job-picker';
import { isBiddingStatus } from '@/lib/bid-deadline';

/* ── Shared shapes ──────────────────────────────────────────────────────── */

/** A run of text; `b` = emphasised (bold in the brief, brighter in a meta line). */
export interface TextPart { t: string; b?: boolean; tone?: 'bad' | 'warn' | 'good' }
export type DotTone = 'red' | 'amber' | 'green' | 'blue' | 'gold' | 'grey';
export interface Link {
  label: string;
  href: string;
  /** Bid packages whose bid link this action switches on (POST
   *  /api/bid-packages/[id]/portal). The page does the switch; href is only
   *  where the action leads when it can't. */
  portalIds?: string[];
}
export type SectionState = 'ok' | 'empty' | 'restricted' | 'failed';

export interface StripFigure {
  key: string;
  /** Shown as is; null = not available to this person / failed (the page shows "—"). */
  value: string | null;
  label: string;
  tone?: 'bad' | 'warn' | 'good';
  /** Why a figure is missing, or what it counts. */
  note?: string;
}

/* ── Dates & names ──────────────────────────────────────────────────────── */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOWS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const ymdOf = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.slice(0, 10) : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

/** 'Oct 20' */
export function fmtMonDay(ymd: string): string {
  const [, m, d] = ymd.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

/** 'Tue Oct 20' */
export function fmtDowMonDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return `${DOWS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${fmtMonDay(ymd)}`;
}

/** The job's own name, without the scope suffix: "Copper Ridge Data Center Phase II — Critical…" → "Copper Ridge Data Center Phase II". */
export function jobTitle(name: string | null | undefined): string {
  const s = String(name || '').trim();
  const cut = s.split(/\s+[—–]\s+|\s+-\s+/)[0].trim();
  return cut || s || 'Untitled job';
}

const ACRONYM_TAIL = /^(Adult|Detention|Center|Centre|Medical|Hospital|Correctional|Facility|Elementary|Middle|High|School|Community|College|University|Regional|Municipal|Public|Safety|Building|Office|Data|Treatment|Plant|Water|Wastewater|District|County)$/;
const STOP = /^(of|the|and|at|for|&|in|on|a|an|to)$/i;

/**
 * A short name for a job inside a sentence or a meta line: the first two words,
 * plus an acronym of the words after them when they are a building type
 * ("Pima County Adult Detention Center" → "Pima County ADC"), and never ending
 * on "of" / "and". Short names stay whole.
 */
export function shortJobName(name: string | null | undefined): string {
  const title = jobTitle(name);
  if (title.length <= 22) return title;
  const words = title.split(/\s+/);
  let n = 2;
  while (n < words.length && STOP.test(words[n - 1])) n++;
  const head = words.slice(0, n);
  const tail = words.slice(n);
  if (tail.length >= 2 && tail.length <= 4 && tail.every(w => ACRONYM_TAIL.test(w))) {
    return `${head.join(' ')} ${tail.map(w => w[0].toUpperCase()).join('')}`;
  }
  return head.join(' ');
}

const plural = (n: number, w: string, pl = `${w}s`) => `${n} ${n === 1 ? w : pl}`;
const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/* ── Bidding ────────────────────────────────────────────────────────────── */

/** Packages still out with subs (lib/status-system bid_packages: Out for bid, Sent, Leveling). */
export const OPEN_BID_STATUSES = ['open', 'sent', 'leveling'];
const DEAD_INVITE = ['revoked', 'withdrawn', 'cancelled', 'canceled'];

export interface BidPackageIn {
  id: string; project_id: string; name?: string | null; trade?: string | null; status?: string | null;
  due_date?: string | null; bid_due_date?: string | null; sub_portal_enabled?: boolean | null;
  budget_estimate?: number | string | null; estimated_value?: number | string | null;
}
export interface InviteIn { bid_package_id: string | null; status?: string | null; response_status?: string | null }
export interface SubmissionIn {
  id: string; bid_package_id: string | null; status?: string | null;
  amount?: number | string | null; base_amount?: number | string | null; base_bid?: number | string | null;
  sub_id?: string | null; sub_email?: string | null; company_name?: string | null;
}

export interface BidRow {
  id: string;
  projectId: string;
  title: string;
  job: string | null;
  invited: number;
  bids: number;
  low: number | null;
  budget: number | null;
  /** Low bid against budget in whole percent; negative = under budget. */
  vsBudgetPct: number | null;
  due: string | null;
  daysLeft: number | null;
  /** Invited subs can't bid online: the package is taking bids but its portal isn't on
   *  (lib/bid-deadline bidRefusal — only `true` is on; sending the jacket turns it on). */
  portalOff: boolean;
  dot: DotTone;
  meta: TextPart[];
  right: string | null;
  rightSub: string | null;
  href: string;
  /** The jacket — where Issue turns the bid link back on. */
  jacketHref: string;
  action: Link | null;
}

/** The bid package rows: open packages, soonest due first. */
export function bidRows(input: {
  packages: BidPackageIn[];
  invites: InviteIn[];
  submissions: SubmissionIn[];
  jobNames: Map<string, string>;
  today: string;
  showMoney: boolean;
}): BidRow[] {
  const invited = new Map<string, number>();
  for (const i of input.invites) {
    if (!i.bid_package_id || DEAD_INVITE.includes(String(i.status || '').toLowerCase())) continue;
    invited.set(i.bid_package_id, (invited.get(i.bid_package_id) || 0) + 1);
  }
  // One bid per bidder: a re-submitted number replaces the first, it is not a second bidder.
  const bidders = new Map<string, Set<string>>();
  const lows = new Map<string, number>();
  for (const s of input.submissions) {
    if (!s.bid_package_id || String(s.status || '').toLowerCase() === 'withdrawn') continue;
    const who = String(s.sub_id || s.sub_email || s.company_name || s.id).toLowerCase();
    const set = bidders.get(s.bid_package_id) || new Set<string>();
    set.add(who);
    bidders.set(s.bid_package_id, set);
    const amt = num(s.amount ?? s.base_amount ?? s.base_bid);
    if (amt > 0 && (!lows.has(s.bid_package_id) || amt < lows.get(s.bid_package_id)!)) lows.set(s.bid_package_id, amt);
  }

  const rows = input.packages
    .filter(p => OPEN_BID_STATUSES.includes(String(p.status || '').toLowerCase()))
    .map((p): BidRow => {
      const base = `/app/projects/${p.project_id}/bid-packages/${p.id}`;
      const inv = invited.get(p.id) || 0;
      const bids = bidders.get(p.id)?.size || 0;
      const low = lows.get(p.id) ?? null;
      const budgetRaw = num(p.budget_estimate) || num(p.estimated_value);
      const budget = budgetRaw > 0 ? budgetRaw : null;
      const vs = low != null && budget ? Math.round(((low - budget) / budget) * 100) : null;
      const due = ymdOf(p.bid_due_date) || ymdOf(p.due_date);
      const daysLeft = due ? daysBetween(input.today, due) : null;
      const portalOff = inv > 0 && isBiddingStatus(p.status) && p.sub_portal_enabled !== true;
      const job = input.jobNames.get(p.project_id) ?? null;

      const meta: TextPart[] = [];
      if (job) meta.push({ t: shortJobName(job) });
      if (portalOff) meta.push({ t: 'link off', tone: 'bad' });
      if (inv === 0) meta.push({ t: bids ? `${plural(bids, 'bid')}, no one invited` : 'no bidders invited' });
      else meta.push({ t: `${bids} of ${Math.max(inv, bids)} bids`, b: true });
      if (low != null && input.showMoney) {
        const vsTxt = vs == null ? '' : vs === 0 ? ', on budget' : vs < 0 ? `, ${-vs}% under budget` : `, ${vs}% over budget`;
        meta.push({ t: `low ${fmtMoneyShort(low)}${vsTxt}` });
      } else if (inv > 0 && bids === 0) meta.push({ t: 'no bids yet' });
      if (!due) meta.push({ t: 'no due date' });

      const missing = Math.max(0, inv - bids);
      const dot: DotTone = portalOff || inv === 0 ? 'red'
        : missing > 0 && daysLeft != null && daysLeft <= 14 ? 'amber'
        : missing === 0 ? 'green'
        : 'grey';

      let right: string | null = null;
      let rightSub: string | null = null;
      if (due && daysLeft != null) {
        right = daysLeft > 0 ? `${daysLeft}d` : daysLeft === 0 ? 'Today' : `${-daysLeft}d ago`;
        rightSub = fmtMonDay(due);
      }
      return {
        id: p.id, projectId: p.project_id, title: p.name || p.trade || 'Bid package', job,
        invited: inv, bids, low: input.showMoney ? low : null, budget: input.showMoney ? budget : null, vsBudgetPct: input.showMoney ? vs : null,
        due, daysLeft, portalOff, dot, meta,
        right: inv === 0 ? null : right, rightSub: inv === 0 ? null : rightSub,
        href: base, jacketHref: `${base}/jacket`,
        action: inv === 0 ? { label: 'Invite', href: base } : null,
      };
    });

  // Soonest due first; on the same day the bigger package leads.
  return rows.sort((a, b) =>
    (a.due || '9999-12-31').localeCompare(b.due || '9999-12-31')
    || (b.budget || 0) - (a.budget || 0)
    || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
}

/* ── Pay apps ───────────────────────────────────────────────────────────── */

export interface PayAppIn {
  id: string; project_id: string | null; app_number?: number | null; status?: string | null;
  total_completed_stored?: number | string | null; current_payment_due?: number | string | null;
  payment_amount?: number | string | null; submitted_at?: string | null; application_date?: string | null;
  payment_received_at?: string | null;
  /** G702 retainage held to date on this app (Home finance). */
  total_retainage?: number | string | null;
}

/** Statuses a G702 carries once it has gone to the owner. */
export const BILLED_STATUSES = ['submitted', 'approved', 'certified', 'paid'];
const WAITING_STATUSES = ['submitted', 'approved', 'certified'];
const isPaid = (p: PayAppIn) => String(p.status || '').toLowerCase() === 'paid' || !!p.payment_received_at;
const sentDay = (p: PayAppIn) => ymdOf(p.submitted_at) || ymdOf(p.application_date);

/** Days from sending a pay app to being paid, for every paid app that has both dates. */
export function daysToPay(apps: PayAppIn[]): number[] {
  const out: number[] = [];
  for (const p of apps) {
    const sent = sentDay(p);
    const paid = ymdOf(p.payment_received_at);
    if (!sent || !paid || !isPaid(p)) continue;
    out.push(Math.max(0, daysBetween(sent, paid)));
  }
  return out;
}

export const avg = (l: number[]): number | null => (l.length ? Math.round(l.reduce((s, v) => s + v, 0) / l.length) : null);

/** Billed to date per job: the highest cumulative "completed and stored" on a sent app (G702 line 4). */
export function billedByJob(apps: PayAppIn[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of apps) {
    if (!p.project_id || !BILLED_STATUSES.includes(String(p.status || '').toLowerCase())) continue;
    const v = num(p.total_completed_stored);
    if (v > (m.get(p.project_id) || 0)) m.set(p.project_id, v);
  }
  return m;
}

export interface MoneyRow {
  id: string;
  projectId: string | null;
  kind: 'waiting' | 'paid';
  /** Waiting longer than the company usually waits to be paid. */
  late: boolean;
  /** 'Pay app #3' */
  label: string;
  /** The job's short name, for a sentence. */
  job: string | null;
  title: string;
  meta: TextPart[];
  amount: number;
  right: string;
  rightSub: string;
  dot: DotTone;
  href: string;
  /** Waiting: days since it went out. Paid: days it took. */
  days: number | null;
  sent: string | null;
}

export interface MoneySummary {
  rows: MoneyRow[];
  /** The company's usual days from sending a pay app to being paid; null with under 2 paid apps to go on. */
  usualDays: number | null;
  paidCount: number;
}

/** Pay apps waiting on the owner, and the ones paid in the last 30 days. */
export function moneyRows(input: { apps: PayAppIn[]; jobNames: Map<string, string>; today: string }): MoneySummary {
  const spans = daysToPay(input.apps);
  const usual = spans.length >= 2 ? avg(spans) : null;
  const rows: MoneyRow[] = [];
  for (const p of input.apps) {
    const st = String(p.status || '').toLowerCase();
    const jobName = p.project_id ? input.jobNames.get(p.project_id) ?? null : null;
    const job = jobName ? shortJobName(jobName) : null;
    const label = `Pay app${p.app_number ? ` #${p.app_number}` : ''}`;
    const title = `${label}${job ? ` · ${job}` : ''}`;
    const href = p.project_id ? `/app/projects/${p.project_id}/pay-apps` : '/app/projects';
    const sent = sentDay(p);
    if (isPaid(p)) {
      const paid = ymdOf(p.payment_received_at);
      if (!paid || daysBetween(paid, input.today) > 30) continue;
      const took = sent ? Math.max(0, daysBetween(sent, paid)) : null;
      const amount = num(p.payment_amount) || num(p.current_payment_due);
      rows.push({
        id: p.id, projectId: p.project_id, kind: 'paid', late: false, label, job, title,
        meta: [{ t: `paid ${fmtMonDay(paid)}` }, ...(took != null ? [{ t: `${plural(took, 'day')} after sending` }] : [])],
        amount, right: fmtMoneyShort(amount), rightSub: 'paid', dot: 'green', href, days: took, sent,
      });
    } else if (WAITING_STATUSES.includes(st)) {
      const age = sent ? Math.max(0, daysBetween(sent, input.today)) : null;
      const late = usual != null && age != null && age > usual;
      const amount = num(p.current_payment_due);
      const meta: TextPart[] = [];
      if (sent) meta.push({ t: `sent ${fmtMonDay(sent)}` });
      if (age != null) meta.push({ t: `waiting ${plural(age, 'day')}`, b: true, tone: late ? 'bad' : undefined });
      if (usual != null) meta.push({ t: `usually paid in ${usual}` });
      rows.push({
        id: p.id, projectId: p.project_id, kind: 'waiting', late, label, job, title, meta,
        amount, right: fmtMoneyShort(amount), rightSub: 'due', dot: late ? 'red' : 'amber', href, days: age, sent,
      });
    }
  }
  rows.sort((a, b) => {
    const rank = (r: MoneyRow) => (r.kind === 'waiting' ? (r.late ? 0 : 1) : 2);
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (a.kind === 'waiting') return (b.days ?? 0) - (a.days ?? 0) || a.id.localeCompare(b.id);
    return (b.sent || '').localeCompare(a.sent || '') || a.id.localeCompare(b.id);
  });
  return { rows, usualDays: usual, paidCount: spans.length };
}

/* ── Jobs ───────────────────────────────────────────────────────────────── */

export interface JobIn {
  id: string; name: string; status: string; phase: string | null; city: string | null;
  start: string | null; finish: string | null; actualFinish: string | null;
  contract: number; archived: boolean;
}

export interface JobRow {
  id: string;
  title: string;
  stage: 'Bidding' | 'Building' | 'Closeout' | 'Complete';
  /** Why the job is at risk (overdue RFIs, late tasks, failed inspection…), or null. */
  risk: string | null;
  /** Red when at risk; otherwise no dot. */
  dot: DotTone | null;
  meta: TextPart[];
  /** Billed of contract, 0–100; null when there is no contract or no right to see money. */
  billedPct: number | null;
  billed: number | null;
  contract: number | null;
  right: string | null;
  rightSub: string | null;
  href: string;
}

/** Finished jobs stay on Home this long, so the last pay app's money is still in view. */
export const RECENT_DONE_DAYS = 60;

/**
 * Jobs for Home: every active job, plus jobs completed in the last 60 days.
 * Building first, then closeout, recently complete, and bidding; biggest
 * contract first within each.
 */
export function jobRows(input: {
  jobs: JobIn[];
  apps: PayAppIn[];
  bids: BidRow[];
  today: string;
  showMoney: boolean;
  showBilling: boolean;
  /** Jobs at risk → their reasons (lib/home/build). */
  risk?: Map<string, string[]>;
}): JobRow[] {
  const billed = billedByJob(input.apps);
  const byJob = new Map<string, PayAppIn[]>();
  for (const p of input.apps) if (p.project_id) byJob.set(p.project_id, [...(byJob.get(p.project_id) || []), p]);
  const lastPaid = new Map<string, string>();
  for (const p of input.apps) {
    const d = ymdOf(p.payment_received_at);
    if (p.project_id && d && d > (lastPaid.get(p.project_id) || '')) lastPaid.set(p.project_id, d);
  }
  const nextBid = new Map<string, string>();
  for (const b of input.bids) if (b.due && b.due >= input.today && (!nextBid.has(b.projectId) || b.due < nextBid.get(b.projectId)!)) nextBid.set(b.projectId, b.due);
  const since = addDays(input.today, -RECENT_DONE_DAYS);

  // Work in hand first, then what just finished (its money is still moving), then what's being chased.
  const ORDER = { Building: 0, Closeout: 1, Complete: 2, Bidding: 3 } as const;
  const out: Array<JobRow & { _o: number }> = [];
  for (const j of input.jobs) {
    if (j.archived) continue;
    let stage: JobRow['stage'];
    if (isClosedStatus(j.status)) {
      if (!isDoneStatus(j.status)) continue; // cancelled / lost: not work in hand
      const ended = [j.actualFinish, j.finish, lastPaid.get(j.id) || null].filter(Boolean).sort().pop() || null;
      if (!ended || ended < since) continue;
      stage = 'Complete';
    } else {
      const sec = pickerSection({ status: j.status, phase: j.phase });
      stage = sec === 'building' ? 'Building' : sec === 'closeout' ? 'Closeout' : 'Bidding';
    }

    const contract = j.contract > 0 ? j.contract : null;
    const b = billed.get(j.id) ?? 0;
    const pct = contract && input.showBilling && stage !== 'Bidding' ? Math.max(0, Math.min(100, Math.round((b / contract) * 100))) : null;
    const apps = (byJob.get(j.id) || []).filter(p => BILLED_STATUSES.includes(String(p.status || '').toLowerCase()));
    const paid = apps.filter(isPaid);

    const meta: TextPart[] = [{ t: stage }];
    const risk = stage === 'Complete' ? null : input.risk?.get(j.id)?.[0] || null;
    if (risk) meta.push({ t: risk, tone: 'bad' });
    if (stage === 'Complete') {
      if (input.showBilling && apps.length) {
        meta.push({ t: `${paid.length} of ${plural(apps.length, 'pay app')} paid` });
        const a = avg(daysToPay(paid));
        if (a != null) meta.push({ t: `avg ${plural(a, 'day')}` });
      } else {
        const ended = j.actualFinish || j.finish;
        if (ended) meta.push({ t: `finished ${fmtMonDay(ended)}` });
      }
    } else if (stage === 'Bidding') {
      const nb = nextBid.get(j.id);
      meta.push({ t: nb ? `bids due ${fmtMonDay(nb)}` : 'no bids due' });
    } else {
      if (j.start && j.start > input.today) meta.push({ t: `starts ${fmtMonDay(j.start)}` });
      else if (j.finish && j.finish >= input.today) meta.push({ t: `finishes ${fmtMonDay(j.finish)}` });
      else if (j.finish) meta.push({ t: `${plural(daysBetween(j.finish, input.today), 'day')} past finish`, tone: 'warn' });
      else meta.push({ t: 'no dates set' });
      if (pct != null) meta.push({ t: `${pct}% billed` });
    }

    out.push({
      id: j.id, title: jobTitle(j.name), stage, risk, dot: risk ? 'red' : null, meta,
      billedPct: pct, billed: input.showBilling && contract ? b : null,
      contract: input.showMoney ? contract : null,
      right: input.showMoney && contract ? fmtMoneyShort(contract) : null,
      rightSub: j.city || null,
      href: `/app/projects/${j.id}/overview`,
      _o: ORDER[stage],
    });
  }
  return out
    .sort((a, b) => a._o - b._o || (b.contract || 0) - (a.contract || 0) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id))
    .map(({ _o, ...r }) => r); // eslint-disable-line @typescript-eslint/no-unused-vars
}

/* ── Insurance ──────────────────────────────────────────────────────────── */

export interface CertIn { id: string; sub_name?: string | null; vendor_name?: string | null; status?: string | null; expiry_date?: string | null; project_id?: string | null }

export interface CoiSummary {
  /** Certificates on file (placeholders for an award not yet made are not certificates). */
  total: number;
  current: number;
  expired: Array<{ name: string; date: string }>;
  expiring: Array<{ name: string; date: string }>;
}

export function coiSummary(certs: CertIn[], today: string): CoiSummary {
  const live = certs.filter(c =>
    !String(c.sub_name || '').startsWith(PLACEHOLDER_WAIVER_PREFIX) &&
    !['replaced', 'archived', 'superseded'].includes(String(c.status || '').toLowerCase()));
  const name = (c: CertIn) => String(c.sub_name || c.vendor_name || 'A sub').trim();
  const dated = live.map(c => ({ c, d: ymdOf(c.expiry_date) }));
  const horizon = addDays(today, 30);
  const byDate = (a: { date: string; name: string }, b: { date: string; name: string }) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name);
  return {
    total: live.length,
    current: dated.filter(x => x.d && x.d >= today).length,
    expired: dated.filter(x => x.d && x.d < today).map(x => ({ name: name(x.c), date: x.d! })).sort(byDate),
    expiring: dated.filter(x => x.d && x.d >= today && x.d <= horizon).map(x => ({ name: name(x.c), date: x.d! })).sort(byDate),
  };
}

/* ── Number strip ───────────────────────────────────────────────────────── */

/** A strip figure fits a quarter of a phone: one decimal from $10M ($10.5M, not $10.49M). */
export function stripMoney(n: number): string {
  const a = Math.abs(n);
  if (a >= 9_950_000 && a < 99_950_000) return `$${parseFloat((n / 1e6).toFixed(1))}M`;
  return fmtMoneyShort(n);
}

/** Owner: under contract · billed % · open bids · COIs current. */
export function ownerStrip(input: {
  jobs: JobRow[];
  openBids: number | null;
  coi: CoiSummary | null;
  canBudget: boolean;
  canPayApps: boolean;
}): StripFigure[] {
  // Under contract = jobs that are won (not still being bid) and carry a contract value.
  const won = input.jobs.filter(j => j.stage !== 'Bidding' && j.contract);
  const total = won.reduce((s, j) => s + (j.contract || 0), 0);
  const billed = won.reduce((s, j) => s + (j.billed || 0), 0);
  const pct = total ? Math.round((billed / total) * 100) : 0;
  const coi = input.coi;
  return [
    input.canBudget
      ? { key: 'contract', value: stripMoney(total), label: 'Under contract', note: `${plural(won.length, 'job')} won, incl. finished in the last ${RECENT_DONE_DAYS} days` }
      : { key: 'contract', value: null, label: 'Under contract', note: 'Needs Budget access' },
    input.canPayApps && input.canBudget
      ? { key: 'billed', value: stripMoney(billed), label: `Billed · ${pct}%`, note: 'Latest pay app to date on each job, of the contract' }
      : { key: 'billed', value: null, label: 'Billed', note: 'Needs Pay Apps and Budget access' },
    input.openBids == null
      ? { key: 'bids', value: null, label: 'Open bids', note: 'Could not load bid packages' }
      : { key: 'bids', value: String(input.openBids), label: 'Open bids' },
    !coi
      ? { key: 'coi', value: null, label: 'COIs current', note: 'Could not load insurance certificates' }
      : coi.total === 0
        ? { key: 'coi', value: '0', label: 'COIs on file' }
        : { key: 'coi', value: `${coi.current}/${coi.total}`, label: 'COIs current', tone: coi.expired.length ? 'bad' : coi.expiring.length ? 'warn' : undefined },
  ];
}

/** Short strip labels for the other views' existing metrics. */
const STRIP_LABEL: Record<string, string> = {
  overdue: 'Overdue', risk: 'Jobs at risk', approvals: 'Approvals', billed: 'Unpaid bills', milestones: 'Milestones 14d',
  first: 'No contact yet', follow: 'Follow-ups late', bids: 'Bids due 7d', proposals: 'Proposals out',
  unassigned: 'Unassigned', today: 'Due today', sla: 'SLA breached', invoice: 'Done, not closed',
  jobs: 'My jobs', week: 'This week',
};
const BAD_WHEN_ANY = new Set(['overdue', 'follow', 'sla']);
const WARN_WHEN_ANY = new Set(['risk', 'unassigned']);

/** Operations / Sales / Service / Field: the view's four metrics as strip figures. */
export function stripFromMetrics(metrics: Metric[], view: string): StripFigure[] {
  return metrics.slice(0, 4).map(m => {
    const shown = m.state === 'ok' || m.state === 'empty';
    let value = shown ? m.value : null;
    // "$1,351,800" is wider than a quarter of a phone.
    if (value && /^\$[\d,]+(\.\d+)?$/.test(value)) {
      const n = Number(value.replace(/[$,]/g, ''));
      if (n >= 10_000) value = stripMoney(n);
    }
    const n = Number(value);
    const label = view === 'service' && m.key === 'today' ? 'Visits today' : STRIP_LABEL[m.key] || m.label;
    const tone = shown && Number.isFinite(n) && n > 0 ? (BAD_WHEN_ANY.has(m.key) ? 'bad' as const : WARN_WHEN_ANY.has(m.key) ? 'warn' as const : undefined) : undefined;
    return {
      key: m.key, value, label, tone,
      note: shown ? m.basis : m.note || (m.state === 'restricted' ? 'No access' : m.state === 'failed' ? 'Could not load' : 'Not available'),
    };
  });
}
