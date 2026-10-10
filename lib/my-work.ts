/**
 * My Work — the GC's to-do list, as data.
 *
 * Pure and client-safe: no I/O and no clock. Every function that needs "today"
 * takes it as 'YYYY-MM-DD', already computed in the person's own zone
 * (lib/time-zone: the device's zone, else the company's — never a home zone).
 * The server (lib/my-work-server) reads the tables and calls the builders here;
 * the page and the tab badge (/api/my-work/count) bucket and rank with the
 * same functions, so the badge and the Today tab can never disagree.
 *
 * An item is one thing to do, verb first ("Turn on the bid link", "Answer
 * RFI 14"), with the record it is about in its meta line, the day it is due
 * (or null), whether it needs doing now whatever the day, how loud it is
 * (tone), and one action: a write that really does it, or the screen where
 * it gets done.
 *
 *   Today      needs action now + overdue + due today
 *   This week  due in the next 7 days
 *   Later      the rest (further out, or undated)
 *
 *   Do first   the red and amber items of Today — money or a deadline at risk
 */
import { addDays, dayIn } from '@/lib/time-zone';
import { daysUntilDay, toDay } from '@/lib/calendar-day';
import { inviteState } from '@/lib/bid-invite-state';
import { bidDueDay, isBiddingStatus } from '@/lib/bid-deadline';
import { inspectionOutcome } from '@/lib/inspection-result';

/* ── Shape ─────────────────────────────────────────────────────────────── */

export type MyWorkSource =
  | 'bids' | 'rfis' | 'submittals' | 'punch' | 'todos' | 'issues' | 'inspections' | 'schedule'
  | 'daily_logs' | 'cois' | 'pay_apps' | 'tm' | 'assists' | 'followups' | 'jobs';

/** What the page says when one source could not be read: "Couldn't load RFIs". */
export const SOURCE_LABEL: Record<MyWorkSource, string> = {
  bids: 'bid packages', rfis: 'RFIs', submittals: 'submittals', punch: 'punch items', todos: 'to-dos',
  issues: 'field issues', inspections: 'inspections', schedule: 'schedule tasks', daily_logs: 'daily logs',
  cois: 'insurance certificates', pay_apps: 'pay apps', tm: 'T&M tickets', assists: 'radio assists',
  followups: 'sales follow-ups', jobs: 'job start dates',
};

/**
 * red    a deadline already missed, or money / a bid blocked right now
 * amber  due today, or at risk soon
 * grey   a chore with nothing at risk yet
 * gold   something happening on a day (bids due, a job starts, an inspection)
 */
export type Tone = 'red' | 'amber' | 'grey' | 'gold';

export type ItemAction =
  /** POST /api/bid-packages/[id]/portal { enabled: true } */
  | { kind: 'portal'; packageId: string; label: string }
  /** POST /api/bid-packages/[id]/remind { inviteId } — once per silent bidder. */
  | { kind: 'remind'; packageId: string; label: string; invites: Array<{ id: string; name: string }> }
  /** POST /api/sub-portal/compliance { subId, docs: ['insurance'] } — "Ask for it". */
  | { kind: 'ask_coi'; subId: string; label: string }
  /** A button that opens the screen where the work is done. */
  | { kind: 'link'; label: string; href: string };

/** Only records with a real "done" get a Done action. */
export type DoneKind = 'punch' | 'todo' | 'task';

export interface MyWorkItem {
  /** Stable per thing-to-do (`bid-link:<package id>`): what a snooze is stored against. */
  key: string;
  source: MyWorkSource;
  title: string;
  meta: string;
  /** 'YYYY-MM-DD' it is due or happens, or null. */
  day: string | null;
  /** Needs doing now, whatever the day (a dead bid link, a pay app waiting on approval). */
  now: boolean;
  tone: Tone;
  /** Money at stake, for ranking (a package's low bid, a pay app's amount). */
  amount: number | null;
  /** The screen the row opens. */
  href: string;
  action: ItemAction | null;
  done: { kind: DoneKind; id: string } | null;
  projectId: string | null;
  /** The bid package an item is about — turning its link on updates its siblings. */
  packageId?: string | null;
  /** Remind rows: whether the package's bid link is on (a reminder carries the link). */
  portalOn?: boolean;
}

export interface Snooze { item_key: string; until: string }

export interface BuildCtx {
  /** 'YYYY-MM-DD' in the person's zone. */
  today: string;
  /** The zone `today` was computed in — for turning a timestamp into that person's day. */
  zone: string;
  /** Short job name for a project id, or null. */
  job: (projectId: string | null | undefined) => string | null;
}

/* ── Days and words ────────────────────────────────────────────────────── */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parts(day: string) {
  const [y, m, d] = day.split('-').map(Number);
  return { y, m, d, wd: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

/** 'Oct 20' — a day as a day; no zone can move it. */
export function fmtDay(day: string): string {
  const p = parts(day);
  return `${MONTHS[p.m - 1]} ${p.d}`;
}

/** 'TUE OCT 20' — the small label over a day's rows. */
export function dayLabel(day: string): string {
  const p = parts(day);
  return `${WEEKDAYS[p.wd]} ${MONTHS[p.m - 1]} ${p.d}`.toUpperCase();
}

/** 'due today', 'due tomorrow', 'due Oct 20', '3 days late'. */
export function dueText(day: string | null, today: string): string {
  if (!day) return 'no due date';
  const n = daysUntilDay(day, today);
  if (n == null) return '';
  if (n < 0) return `${-n} day${n === -1 ? '' : 's'} late`;
  if (n === 0) return 'due today';
  if (n === 1) return 'due tomorrow';
  return `due ${fmtDay(day)}`;
}

/** Overdue is red, due today is amber, later is `later`. */
export function dueTone(day: string | null, today: string, later: Tone = 'grey'): Tone {
  if (!day) return later;
  if (day < today) return 'red';
  if (day === today) return 'amber';
  return later;
}

/**
 * The person's day for a stored value: a DATE ('2026-10-20', or a timestamp
 * written at midnight UTC from a date picker) is that day; any other
 * timestamp is the day it was in `zone`.
 */
export function dayOfValue(v: unknown, zone: string): string | null {
  if (typeof v !== 'string' || !v) return null;
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return toDay(s);
  if (/^\d{4}-\d{2}-\d{2}[T ]00:00(:00(\.0+)?)?(Z|\+00(:?00)?)?$/.test(s)) return toDay(s);
  const t = Date.parse(s);
  return Number.isFinite(t) ? dayIn(zone, new Date(t)) : toDay(s);
}

/** "Copper Ridge Data Center Phase II — Critical Environment Controls" → "Copper Ridge Data Center Phase II". */
export function shortJob(name: unknown): string | null {
  const s = String(name ?? '').trim();
  if (!s) return null;
  return s.split(/\s+[—–]\s+/)[0].trim() || s;
}

/** '$2.79M', '$412K', '$950'. */
export function money(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v) || v === 0) return '$0';
  const a = Math.abs(v);
  if (a >= 1_000_000) return `$${(v / 1_000_000).toFixed(a >= 10_000_000 ? 1 : 2).replace(/\.?0+$/, '')}M`;
  if (a >= 10_000) return `$${Math.round(v / 1000)}K`;
  return `$${Math.round(v).toLocaleString('en-US')}`;
}

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : null;
};
const lower = (v: unknown) => String(v ?? '').trim().toLowerCase();
const join = (...bits: Array<string | null | undefined | false>) => bits.filter(Boolean).join(' · ');

/* ── Builders: rows from one table → items ─────────────────────────────── */

export interface PackageRow {
  id: string; project_id: string | null; name: string | null; status: string | null;
  due_date?: string | null; bid_due_date?: string | null; sub_portal_enabled?: boolean | null;
  budget_estimate?: number | string | null; low_bid_amount?: number | string | null;
}
export interface InviteRow {
  id: string; bid_package_id: string; status?: string | null; response_status?: string | null;
  company_name?: string | null; sub_name?: string | null; contact_name?: string | null;
}

/** How close a bid due date has to be before silent bidders are worth a reminder. */
export const REMIND_WITHIN_DAYS = 14;

/**
 * Bid packages: a dead bid link, bidders who haven't answered, nobody invited,
 * no due date, bidding closed and waiting on a decision — plus "Bids due"
 * on each due day (packages due the same day share one row).
 */
export function bidItems(packages: PackageRow[], invites: InviteRow[], ctx: BuildCtx): MyWorkItem[] {
  const { today } = ctx;
  const out: MyWorkItem[] = [];
  const byPkg = new Map<string, InviteRow[]>();
  for (const iv of invites) {
    const l = byPkg.get(iv.bid_package_id) || [];
    l.push(iv);
    byPkg.set(iv.bid_package_id, l);
  }
  const dueEvents = new Map<string, Array<{ p: PackageRow; bids: number; live: number }>>();

  for (const p of packages) {
    if (!isBiddingStatus(p.status)) continue;
    const name = p.name || 'Bid package';
    const job = ctx.job(p.project_id);
    const href = p.project_id ? `/app/projects/${p.project_id}/bid-packages/${p.id}` : '/app/bids';
    const live = (byPkg.get(p.id) || []).filter((iv) => inviteState(iv) !== 'revoked');
    const pending = live.filter((iv) => { const s = inviteState(iv); return s === 'invited' || s === 'viewed'; });
    const bids = live.filter((iv) => inviteState(iv) === 'submitted').length;
    const due = bidDueDay(p);
    const days = due ? daysUntilDay(due, today) : null;
    const amount = num(p.low_bid_amount) ?? num(p.budget_estimate);
    const portalOn = p.sub_portal_enabled === true;
    const base = { source: 'bids' as const, projectId: p.project_id, packageId: p.id, amount, done: null };

    if (days != null && days < 0) {
      // The due day is over in the person's zone: bidding is closed and the
      // package is waiting on the GC.
      out.push(bids > 0
        ? { ...base, key: `bid-closed:${p.id}`, title: 'Level the bids and award', meta: join(name, `${bids} bid${bids === 1 ? '' : 's'} in`, `closed ${fmtDay(due!)}`), day: due, now: true, tone: 'amber', href, action: null }
        : { ...base, key: `bid-closed:${p.id}`, title: 'Extend the due date or re-bid', meta: join(name, 'no bids came in', `closed ${fmtDay(due!)}`), day: due, now: true, tone: 'red', href: `${href}?edit=details#package-details`, action: null });
      continue;
    }

    if (live.length > 0 && !portalOn) {
      out.push({ ...base, key: `bid-link:${p.id}`, title: 'Turn on the bid link', meta: join(name, "bidders can't open it"), day: due, now: true, tone: 'red', href, action: { kind: 'portal', packageId: p.id, label: 'Turn on' } });
    }
    if (live.length === 0) {
      out.push({ ...base, key: `bid-invite:${p.id}`, title: 'Invite bidders', meta: join(name, job), day: due, now: true, tone: 'grey', href, action: { kind: 'link', label: 'Invite', href } });
    }
    if (!due) {
      out.push({ ...base, key: `bid-due-date:${p.id}`, title: 'Set a bid due date', meta: join(name, job), day: null, now: true, tone: 'grey', href: `${href}?edit=details#package-details`, action: null });
    }
    if (pending.length > 0 && days != null && days <= REMIND_WITHIN_DAYS) {
      const names = pending.map((iv) => iv.company_name || iv.sub_name || iv.contact_name || 'Bidder');
      out.push({
        ...base, key: `bid-remind:${p.id}`,
        title: `${pending.length} bidder${pending.length === 1 ? " hasn't" : "s haven't"} answered`,
        meta: join(names.join(', '), name, dueText(due, today)),
        day: due, now: true, tone: days <= 2 ? 'red' : 'amber', href, portalOn,
        action: { kind: 'remind', packageId: p.id, label: 'Remind', invites: pending.map((iv, i) => ({ id: iv.id, name: names[i] })) },
      });
    }
    if (due) {
      const l = dueEvents.get(due) || [];
      l.push({ p, bids, live: live.length });
      dueEvents.set(due, l);
    }
  }

  for (const [day, list] of dueEvents) {
    // The package with the most money in it leads the row.
    const at = (e: { p: PackageRow }) => num(e.p.low_bid_amount) ?? num(e.p.budget_estimate) ?? 0;
    list.sort((a, b) => at(b) - at(a) || String(a.p.name || '').localeCompare(String(b.p.name || '')));
    const first = list[0].p;
    const oneJob = list.every((e) => e.p.project_id === first.project_id) ? first.project_id : null;
    const href = list.length === 1
      ? (first.project_id ? `/app/projects/${first.project_id}/bid-packages/${first.id}` : '/app/bids')
      : oneJob ? `/app/projects/${oneJob}/bid-packages` : '/app/bids';
    const isToday = day === today;
    out.push({
      key: `bids-due:${day}`, source: 'bids', projectId: oneJob, packageId: list.length === 1 ? first.id : null,
      title: list.length === 1 ? `Bids due${isToday ? ' today' : ''} · ${first.name || 'Bid package'}` : `Bids due${isToday ? ' today' : ''} · ${list.length} packages`,
      meta: list.length === 1
        ? join(ctx.job(first.project_id), `${list[0].bids} of ${list[0].live} bid${list[0].live === 1 ? '' : 's'} in`)
        : list.map((e) => e.p.name || 'Bid package').join(' · '),
      day, now: false, tone: isToday ? 'amber' : 'gold', amount: list.reduce((s, e) => s + (num(e.p.low_bid_amount) ?? num(e.p.budget_estimate) ?? 0), 0) || null,
      href, action: null, done: null,
    });
  }
  return out;
}

export interface RfiRow {
  id: string; project_id: string | null; rfi_number?: string | null; subject?: string | null; status?: string | null;
  due_date?: string | null; response_due_date?: string | null; ball_in_court?: string | null;
  assigned_to?: string | null; assigned_to_email?: string | null;
}

/** 'RFI-014' stays; '14' → 'RFI 14'; nothing → 'the RFI'. */
export function rfiLabel(n: unknown): string {
  const s = String(n ?? '').trim();
  if (!s) return 'the RFI';
  return /^rfi/i.test(s) ? s.toUpperCase().replace(/^RFI[\s#-]*0*(\d)/, 'RFI $1') : `RFI ${s.replace(/^#/, '').replace(/^0+(\d)/, '$1')}`;
}

const OURS = ['', 'gc', 'contractor', 'general contractor', 'us'];

/** Open RFIs: "Answer RFI 14" when the ball is in our court, else "Get an answer on RFI 14"; a draft is "Send RFI 14". */
export function rfiItems(rows: RfiRow[], ctx: BuildCtx, me: { id: string; email: string }): MyWorkItem[] {
  return rows.map((r) => {
    const day = toDay(r.response_due_date) ?? toDay(r.due_date);
    const mine = [r.assigned_to, r.assigned_to_email].some((v) => v && (v === me.id || (me.email && lower(v) === lower(me.email))));
    const ours = mine || OURS.includes(lower(r.ball_in_court));
    const label = rfiLabel(r.rfi_number);
    return {
      key: `rfi:${r.id}`, source: 'rfis' as const, projectId: r.project_id,
      title: lower(r.status) === 'draft' ? `Send ${label}` : ours ? `Answer ${label}` : `Get an answer on ${label}`,
      meta: join(r.subject || null, ctx.job(r.project_id), day ? dueText(day, ctx.today) : null),
      day, now: false, tone: dueTone(day, ctx.today), amount: null,
      href: r.project_id ? `/app/projects/${r.project_id}/rfis` : '/app/rfis', action: null, done: null,
    };
  });
}

export interface SubmittalRow {
  id: string; project_id: string | null; submittal_number?: string | null; title?: string | null; status?: string | null;
  due_date?: string | null; ball_in_court?: string | null; subcontractor?: string | null;
}

/** Submittals with a due date that are not approved yet. */
export function submittalItems(rows: SubmittalRow[], ctx: BuildCtx): MyWorkItem[] {
  return rows.map((r) => {
    const day = toDay(r.due_date);
    const n = String(r.submittal_number ?? '').trim();
    const label = n ? `submittal ${n.replace(/^submittal\s*/i, '')}` : 'the submittal';
    const bic = lower(r.ball_in_court);
    const st = lower(r.status);
    const title = /revise|resubmit|reject/.test(st) ? `Get ${label} resubmitted`
      : bic === 'subcontractor' || bic === 'sub' ? `Get ${label} from ${r.subcontractor || 'the sub'}`
        : bic && !OURS.includes(bic) ? `Get ${label} back from the ${bic}`
          : `Review ${label}`;
    return {
      key: `submittal:${r.id}`, source: 'submittals' as const, projectId: r.project_id,
      title, meta: join(r.title || null, ctx.job(r.project_id), dueText(day, ctx.today)),
      day, now: false, tone: dueTone(day, ctx.today), amount: null,
      href: r.project_id ? `/app/projects/${r.project_id}/submittals` : '/app/submittals', action: null, done: null,
    };
  });
}

export interface PunchRow { id: string; project_id: string | null; title?: string | null; description?: string | null; location?: string | null; due_date?: string | null }

/** Punch items assigned to this person — Done really closes them. */
export function punchItems(rows: PunchRow[], ctx: BuildCtx): MyWorkItem[] {
  return rows.map((r) => {
    const day = toDay(r.due_date);
    return {
      key: `punch:${r.id}`, source: 'punch' as const, projectId: r.project_id,
      title: r.title || r.description || 'Punch item',
      meta: join('Punch', r.location || null, ctx.job(r.project_id), day ? dueText(day, ctx.today) : null),
      day, now: false, tone: dueTone(day, ctx.today), amount: null,
      href: r.project_id ? `/app/projects/${r.project_id}/punch-list` : '/app/punch-list', action: null,
      done: { kind: 'punch' as const, id: r.id },
    };
  });
}

export interface TodoRow { id: string; project_id: string | null; title?: string | null; description?: string | null; due_date?: string | null; priority?: string | null }

/** To-dos assigned to this person — Done really completes them. */
export function todoItems(rows: TodoRow[], ctx: BuildCtx): MyWorkItem[] {
  return rows.map((r) => {
    const day = toDay(r.due_date);
    const high = /high|urgent|critical/i.test(String(r.priority || ''));
    return {
      key: `todo:${r.id}`, source: 'todos' as const, projectId: r.project_id,
      title: r.title || r.description || 'To-do',
      meta: join('To-do', ctx.job(r.project_id), high ? 'high priority' : null, day ? dueText(day, ctx.today) : null),
      day, now: false, tone: dueTone(day, ctx.today, high ? 'amber' : 'grey'), amount: null,
      href: r.project_id ? `/app/projects/${r.project_id}/todos` : '/app/todos', action: null,
      done: { kind: 'todo' as const, id: r.id },
    };
  });
}

export interface IssueRow { id: string; project_id: string | null; title?: string | null; issue_number?: string | null; due_date?: string | null }

export function issueItems(rows: IssueRow[], ctx: BuildCtx): MyWorkItem[] {
  return rows.map((r) => {
    const day = toDay(r.due_date);
    return {
      key: `issue:${r.id}`, source: 'issues' as const, projectId: r.project_id,
      title: r.title || 'Field issue',
      meta: join(r.issue_number ? `Field issue ${r.issue_number}` : 'Field issue', ctx.job(r.project_id), day ? dueText(day, ctx.today) : null),
      day, now: false, tone: dueTone(day, ctx.today), amount: null,
      href: r.project_id ? `/app/projects/${r.project_id}/safety` : '/app/safety', action: null, done: null,
    };
  });
}

export interface InspectionRow {
  id: string; project_id: string | null; inspection_type?: string | null; status?: string | null; result?: string | null;
  scheduled_date?: string | null; re_inspection_date?: string | null; inspector_name?: string | null; inspector?: string | null; agency?: string | null;
}

const INSPECTION_DONE = ['passed', 'completed', 'complete', 'approved', 'closed', 'cancelled', 'canceled'];

/** Inspections: today's, the next few days', ones nobody recorded, and failed ones needing a re-inspection. */
export function inspectionItems(rows: InspectionRow[], ctx: BuildCtx, horizonDays = 7): MyWorkItem[] {
  const { today } = ctx;
  const out: MyWorkItem[] = [];
  for (const r of rows) {
    const type = (r.inspection_type || 'Inspection').replace(/\s+inspection$/i, '');
    const who = r.inspector_name || r.inspector || r.agency || null;
    const base = { source: 'inspections' as const, projectId: r.project_id, amount: null, action: null, done: null };
    const href = r.project_id ? `/app/projects/${r.project_id}/inspections?inspection=${r.id}` : '/app/inspections';
    const outcome = inspectionOutcome(r);
    if (outcome === 'failed') {
      const re = toDay(r.re_inspection_date);
      if (!re) out.push({ ...base, key: `inspection:${r.id}`, title: `Book the ${type} re-inspection`, meta: join('Failed', who, ctx.job(r.project_id)), day: null, now: true, tone: 'red', href });
      else if (re <= addDays(today, horizonDays)) out.push({ ...base, key: `inspection:${r.id}`, title: re === today ? `Host the ${type} re-inspection` : `Prep for the ${type} re-inspection`, meta: join(who, ctx.job(r.project_id)), day: re, now: false, tone: dueTone(re, today, 'gold'), href });
      continue;
    }
    if (outcome !== 'pending' || INSPECTION_DONE.includes(lower(r.status))) continue;
    const day = dayOfValue(r.scheduled_date, ctx.zone);
    if (!day || day > addDays(today, horizonDays)) continue;
    if (day < today) out.push({ ...base, key: `inspection:${r.id}`, title: `Record the ${type} inspection result`, meta: join(`Held ${fmtDay(day)}`, who, ctx.job(r.project_id)), day, now: false, tone: 'red', href: `${href}&record=1` });
    else out.push({ ...base, key: `inspection:${r.id}`, title: day === today ? `Host the ${type} inspection` : `Prep for the ${type} inspection`, meta: join(who, ctx.job(r.project_id)), day, now: false, tone: day === today ? 'amber' : 'gold', href });
  }
  return out;
}

export interface TaskRow { id: string; project_id: string | null; name?: string | null; start_date?: string | null; end_date?: string | null; status?: string | null; trade?: string | null }

const TASK_DONE = ['complete', 'completed', 'done', 'cancelled', 'canceled'];

/** Schedule tasks to start or finish soon (or late) — Done marks them complete. */
export function scheduleItems(rows: TaskRow[], ctx: BuildCtx, horizonDays = 7): MyWorkItem[] {
  const { today } = ctx;
  const limit = addDays(today, horizonDays);
  const out: MyWorkItem[] = [];
  for (const r of rows) {
    const st = lower(r.status);
    if (TASK_DONE.includes(st)) continue;
    const start = toDay(r.start_date);
    const end = toDay(r.end_date);
    const started = st === 'in_progress' || st === 'started' || st === 'active';
    let title: string | null = null;
    let day: string | null = null;
    if (!started && start && start <= limit) { title = `Start ${r.name || 'the task'}`; day = start; }
    else if (end && end <= limit) { title = `Finish ${r.name || 'the task'}`; day = end; }
    if (!title) continue;
    out.push({
      key: `task:${r.id}`, source: 'schedule', projectId: r.project_id, title,
      meta: join(ctx.job(r.project_id), r.trade || null, day && day < today ? dueText(day, today) : null),
      day, now: false, tone: dueTone(day, today), amount: null,
      href: r.project_id ? `/app/projects/${r.project_id}/schedule` : '/app/schedule', action: null,
      done: { kind: 'task', id: r.id },
    });
  }
  return out;
}

/** Field roles: today's daily log not filed yet on a job that has started. */
export function dailyLogItems(projectIds: string[], filedToday: Set<string>, ctx: BuildCtx): MyWorkItem[] {
  return projectIds.filter((pid) => !filedToday.has(pid)).map((pid) => {
    const href = `/app/projects/${pid}/daily-logs`;
    return {
      key: `daily-log:${pid}:${ctx.today}`, source: 'daily_logs' as const, projectId: pid,
      title: "File today's daily log", meta: join(ctx.job(pid), 'not filed yet'),
      day: ctx.today, now: true, tone: 'amber' as const, amount: null, href,
      action: { kind: 'link' as const, label: 'File', href }, done: null,
    };
  });
}

export interface CoiRow {
  id: string; project_id: string | null; sub_id?: string | null; sub_name?: string | null; vendor_name?: string | null;
  insured_name?: string | null; policy_type?: string | null; expiry_date?: string | null;
}

/** How far ahead an expiring certificate shows up at all. */
export const COI_WINDOW_DAYS = 30;
/** Inside this many days, asking for the renewal is today's work. */
export const COI_NOW_DAYS = 14;

/** COIs expired or expiring within 30 days — one row per sub, its soonest certificate. */
export function coiItems(rows: CoiRow[], ctx: BuildCtx): MyWorkItem[] {
  const { today } = ctx;
  const best = new Map<string, { r: CoiRow; day: string; days: number }>();
  for (const r of rows) {
    const day = toDay(r.expiry_date);
    if (!day) continue;
    const days = daysUntilDay(day, today);
    if (days == null || days > COI_WINDOW_DAYS) continue;
    const name = r.sub_name || r.vendor_name || r.insured_name || '';
    if (!r.sub_id && (!name || /^\[award pending\]/i.test(name))) continue;
    const who = r.sub_id || lower(name);
    const cur = best.get(who);
    if (!cur || day < cur.day) best.set(who, { r, day, days });
  }
  return [...best.values()].map(({ r, day, days }) => {
    const name = r.sub_name || r.vendor_name || r.insured_name || 'the sub';
    const when = days < 0 ? `Expired ${fmtDay(day)}` : days === 0 ? 'Expires today' : `Expires ${fmtDay(day)}`;
    const href = r.project_id ? `/app/projects/${r.project_id}/insurance` : '/app/compliance';
    return {
      key: `coi:${r.sub_id || r.id}`, source: 'cois' as const, projectId: r.project_id,
      title: `Request COI from ${name}`,
      meta: join(r.policy_type ? `${r.policy_type} ${when.toLowerCase()}` : when, ctx.job(r.project_id)),
      day, now: days <= COI_NOW_DAYS, tone: (days < 0 ? 'red' : days <= COI_NOW_DAYS ? 'amber' : 'grey') as Tone, amount: null, href,
      action: r.sub_id ? { kind: 'ask_coi' as const, subId: r.sub_id, label: 'Request' } : null,
      done: null,
    };
  });
}

export interface PayAppRow {
  id: string; project_id: string | null; app_number?: number | string | null; status?: string | null;
  submitted_at?: string | null; approved_at?: string | null; certified_at?: string | null;
  current_payment_due?: number | string | null; net_payment_due?: number | string | null; payment_received_at?: string | null;
}

/** Waiting this long on an owner turns a pay app red. */
export const PAY_APP_LATE_DAYS = 30;

/** Pay apps submitted and waiting on approval, or approved and waiting on payment. */
export function payAppItems(rows: PayAppRow[], ctx: BuildCtx): MyWorkItem[] {
  const out: MyWorkItem[] = [];
  for (const r of rows) {
    const st = lower(r.status);
    if (r.payment_received_at) continue;
    const n = r.app_number != null && String(r.app_number).trim() ? String(r.app_number).trim() : '';
    const amount = num(r.current_payment_due) ?? num(r.net_payment_due);
    const href = r.project_id ? `/app/projects/${r.project_id}/pay-apps/${r.id}` : '/app/pay-apps';
    const base = { key: `pay-app:${r.id}`, source: 'pay_apps' as const, projectId: r.project_id, amount, href, action: null, done: null, now: true };
    if (st === 'submitted' || st === 'under_review') {
      const since = dayOfValue(r.submitted_at, ctx.zone);
      const age = since ? -(daysUntilDay(since, ctx.today) ?? 0) : 0;
      out.push({ ...base, title: `Approve pay app ${n || ''}`.trim(), meta: join(ctx.job(r.project_id), amount ? money(amount) : null, since ? `submitted ${fmtDay(since)}` : null), day: since, tone: age > PAY_APP_LATE_DAYS ? 'red' : 'amber' });
    } else if (st === 'approved' || st === 'certified') {
      const since = dayOfValue(r.certified_at || r.approved_at, ctx.zone);
      const age = since ? -(daysUntilDay(since, ctx.today) ?? 0) : 0;
      out.push({ ...base, title: `Collect payment on pay app ${n || ''}`.trim(), meta: join(ctx.job(r.project_id), amount ? `${money(amount)} due` : null, since ? `approved ${fmtDay(since)}` : null), day: since, tone: age > PAY_APP_LATE_DAYS ? 'red' : 'amber' });
    }
  }
  return out;
}

export interface TmRow { id: string; project_id: string | null; ticket_number?: string | null; description?: string | null; total?: number | string | null }

export function tmItems(rows: TmRow[], ctx: BuildCtx): MyWorkItem[] {
  return rows.map((r) => ({
    key: `tm:${r.id}`, source: 'tm' as const, projectId: r.project_id,
    title: `Approve T&M ${r.ticket_number ? `ticket ${r.ticket_number}` : 'ticket'}`,
    meta: join(r.description || null, num(r.total) ? money(r.total) : null, ctx.job(r.project_id)),
    day: null, now: true, tone: 'amber' as const, amount: num(r.total),
    href: r.project_id ? `/app/projects/${r.project_id}/tm-tickets` : '/app/tm-tickets', action: null, done: null,
  }));
}

export interface AssistRow { id: string; project_id: string | null; note?: string | null; requester_name?: string | null; channel_id?: string | null }

export function assistItems(rows: AssistRow[], ctx: BuildCtx): MyWorkItem[] {
  return rows.map((r) => ({
    key: `assist:${r.id}`, source: 'assists' as const, projectId: r.project_id,
    title: `Help ${r.requester_name || 'a teammate'}`,
    meta: join(r.note || 'Asked for a hand on the radio', ctx.job(r.project_id)),
    day: null, now: true, tone: 'amber' as const, amount: null,
    href: r.channel_id ? `/app/radio?channel=${r.channel_id}` : '/app/radio', action: null, done: null,
  }));
}

export interface LeadRow { id: string; company_name?: string | null; contact_name?: string | null; next_action?: string | null; next_action_date?: string | null; stage?: string | null; estimated_value?: number | string | null }

/** Sales follow-ups: what you owe a lead, on the day you said you'd do it. */
export function followUpItems(rows: LeadRow[], ctx: BuildCtx): MyWorkItem[] {
  const out: MyWorkItem[] = [];
  for (const r of rows) {
    const day = toDay(r.next_action_date);
    if (!day) continue;
    out.push({
      key: `lead:${r.id}`, source: 'followups', projectId: null,
      title: r.next_action || 'Follow up',
      meta: join(r.company_name || 'Lead', r.contact_name || null, r.stage || null, num(r.estimated_value) ? money(r.estimated_value) : null),
      day, now: false, tone: dueTone(day, ctx.today), amount: num(r.estimated_value),
      href: `/app/leads/${r.id}`, action: null, done: null,
    });
  }
  return out;
}

export interface JobRow { id: string; name?: string | null; status?: string | null; start_date?: string | null }

/** How far ahead a job's start shows. */
export const JOB_START_DAYS = 30;

/** A job starting soon — and whether it has a schedule yet. */
export function jobStartItems(projects: JobRow[], taskCount: Map<string, number>, ctx: BuildCtx): MyWorkItem[] {
  const out: MyWorkItem[] = [];
  for (const p of projects) {
    const day = toDay(p.start_date);
    if (!day || day < ctx.today || day > addDays(ctx.today, JOB_START_DAYS)) continue;
    const n = taskCount.get(p.id) || 0;
    out.push({
      key: `job-start:${p.id}`, source: 'jobs', projectId: p.id,
      title: `${shortJob(p.name) || 'Job'} starts${day === ctx.today ? ' today' : ''}`,
      meta: n ? `${n} schedule task${n === 1 ? '' : 's'}` : 'No schedule tasks yet · add the first one',
      day, now: false, tone: day === ctx.today ? 'amber' : 'gold', amount: null,
      href: `/app/projects/${p.id}/schedule`, action: null, done: null,
    });
  }
  return out;
}

/* ── Snoozes, buckets, ranking ─────────────────────────────────────────── */

/** Drop items snoozed past today. A snooze until a day shows the item again ON that day. */
export function applySnoozes(items: MyWorkItem[], snoozes: Snooze[], today: string): MyWorkItem[] {
  const until = new Map<string, string>();
  for (const s of snoozes) {
    const d = toDay(s.until);
    if (d && d > today && (!until.has(s.item_key) || d > until.get(s.item_key)!)) until.set(s.item_key, d);
  }
  return until.size ? items.filter((it) => !until.has(it.key)) : items;
}

export type Bucket = 'today' | 'week' | 'later';

/** Today = now + overdue + due today; This week = the next 7 days; Later = the rest. */
export function bucketOf(it: Pick<MyWorkItem, 'now' | 'day'>, today: string): Bucket {
  if (it.now) return 'today';
  if (it.day && it.day <= today) return 'today';
  if (it.day && it.day <= addDays(today, 7)) return 'week';
  return 'later';
}

const TONE_RANK: Record<Tone, number> = { red: 0, amber: 1, grey: 2, gold: 3 };

/**
 * Loudest first: red, amber, then the rest. Within a tone, the earliest
 * deadline first (the oldest overdue at the top; undated last), then the most
 * money at stake, then the title — so the order never shuffles between loads.
 */
export function rankItems(items: MyWorkItem[]): MyWorkItem[] {
  return [...items].sort((a, b) =>
    TONE_RANK[a.tone] - TONE_RANK[b.tone]
    || (a.day ?? '9999-99-99').localeCompare(b.day ?? '9999-99-99')
    || (b.amount ?? 0) - (a.amount ?? 0)
    || a.title.localeCompare(b.title)
    || a.key.localeCompare(b.key));
}

/** By day, earliest first; for This week and Later. Undated items go last, under null. */
export function groupByDay(items: MyWorkItem[]): Array<{ day: string | null; items: MyWorkItem[] }> {
  const m = new Map<string | null, MyWorkItem[]>();
  for (const it of rankItems(items)) {
    const l = m.get(it.day) || [];
    l.push(it);
    m.set(it.day, l);
  }
  return [...m.entries()]
    .sort(([a], [b]) => (a ?? '9999-99-99').localeCompare(b ?? '9999-99-99'))
    .map(([day, list]) => ({ day, items: list }));
}

export interface MyWorkView {
  today: { doFirst: MyWorkItem[]; rest: MyWorkItem[] };
  week: MyWorkItem[];
  later: MyWorkItem[];
  counts: { today: number; week: number; later: number };
}

/** Everything the page renders: snoozes applied, bucketed, ranked. */
export function buildView(items: MyWorkItem[], snoozes: Snooze[], today: string): MyWorkView {
  const live = applySnoozes(items, snoozes, today);
  const t: MyWorkItem[] = [], w: MyWorkItem[] = [], l: MyWorkItem[] = [];
  for (const it of live) {
    const b = bucketOf(it, today);
    (b === 'today' ? t : b === 'week' ? w : l).push(it);
  }
  const ranked = rankItems(t);
  return {
    today: { doFirst: ranked.filter((it) => it.tone === 'red' || it.tone === 'amber'), rest: ranked.filter((it) => it.tone !== 'red' && it.tone !== 'amber') },
    week: rankItems(w),
    later: rankItems(l),
    counts: { today: t.length, week: w.length, later: l.length },
  };
}

/** The tab badge: how many Today items, after snoozes. */
export function todayCount(items: MyWorkItem[], snoozes: Snooze[], today: string): number {
  return applySnoozes(items, snoozes, today).filter((it) => bucketOf(it, today) === 'today').length;
}

/** A snooze key the API will store: `<kind>:<id…>`, short, no spaces. */
export function isItemKey(k: unknown): k is string {
  return typeof k === 'string' && k.length <= 160 && /^[a-z][a-z-]{1,30}:[A-Za-z0-9:_.-]{1,120}$/.test(k);
}
