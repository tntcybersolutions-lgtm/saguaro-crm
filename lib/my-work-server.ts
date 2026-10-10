/**
 * My Work — reading the tables (server only).
 *
 * One collector for the page (/api/my-work) and the tab badge
 * (/api/my-work/count), so the badge and the Today tab count the same rows.
 *
 * Whose work:
 *   • owners and admins (Admin: Full) see the company's work — every live job;
 *   • everyone else sees what is assigned to them: their own to-dos, RFIs,
 *     punch items and field issues anywhere, plus the job-level work (bids,
 *     COIs, pay apps, schedule, inspections, submittals) on the jobs a PM
 *     put them on (work_assignments, Project → Team). A viewer assignment
 *     never brings approvals. A superintendent or foreman also owes today's
 *     daily log on each job they run that has started.
 *
 * Every query is tenant-scoped. Each source is read on its own: one that
 * fails is named in `failures` ("Couldn't load RFIs · Retry") and the rest
 * still render. Projects and assignments are the frame everything hangs on,
 * so if they fail the whole read fails and the page says so.
 */
import {
  type BuildCtx, type MyWorkItem, type MyWorkSource, type Snooze,
  COI_NOW_DAYS, COI_WINDOW_DAYS, JOB_START_DAYS, REMIND_WITHIN_DAYS, SOURCE_LABEL,
  assistItems, bidItems, coiItems, dailyLogItems, followUpItems, inspectionItems, issueItems, jobStartItems,
  payAppItems, punchItems, rfiItems, scheduleItems, shortJob, submittalItems, tmItems, todoItems,
} from '@/lib/my-work';
import { addDays } from '@/lib/time-zone';
import { toDay } from '@/lib/calendar-day';
import { isClosedStatus } from '@/lib/project-lifecycle';

type Db = { from: (t: string) => any };
type Row = Record<string, any>;

export interface CollectArgs {
  db: Db;
  tenantId: string;
  userId: string;
  email: string;
  /** 'YYYY-MM-DD' in the person's zone (lib/time-zone requestDay). */
  today: string;
  zone: string;
  /** Owner / admin: the whole company's work. */
  companyWide: boolean;
  /** 'today' reads only what can land in Today — the tab badge's cheap path. */
  scope?: 'all' | 'today';
}

export interface Collected {
  items: MyWorkItem[];
  failures: MyWorkSource[];
  snoozes: Snooze[];
  /** False until the my_work_snoozes table exists — the page hides Snooze until then. */
  snoozeReady: boolean;
  /** Live jobs this person is assigned to. */
  assigned: number;
}

/** work_assignments roles that run a job in the field and owe its daily log. */
export const FIELD_ROLES = ['superintendent', 'foreman', 'field_engineer', 'field_supervisor', 'site_supervisor', 'crew_lead'];

const CAP = 500;
/** How far ahead job-wide dated work (inspections, schedule, submittals) is listed. */
const HORIZON_DAYS = 30;

const RFI_OPEN = ['open', 'submitted', 'under_review', 'pending', 'draft'];
const RFI_SWEEP = ['open', 'submitted', 'under_review', 'pending'];
const SUBMITTAL_DONE = ['approved', 'approved_as_noted', 'approved as noted', 'closed', 'void', 'voided', 'cancelled', 'canceled', 'complete', 'completed'];
const PUNCH_DONE = ['completed', 'complete', 'closed', 'voided', 'verified'];
const TODO_DONE = ['done', 'complete', 'completed', 'cancelled', 'canceled'];
const ISSUE_OPEN = ['open', 'in_progress'];

/** A value inside a PostgREST .or() is positional: a comma, paren or quote would splice the grammar. */
function orSafe(v: string): string {
  return String(v || '').replace(/[,()"\\]/g, '');
}

async function rows(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<Row[]> {
  const { data, error } = await q;
  if (error) throw error;
  return (data as Row[] | null) || [];
}

/** True when PostgREST says the table is not there (the migration has not been applied). */
function isMissingTable(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  return !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|could not find the table/i.test(e.message || ''));
}

const lower = (v: unknown) => String(v ?? '').trim().toLowerCase();

export async function collectMyWork(a: CollectArgs): Promise<Collected> {
  const { db, tenantId: t, userId: uid, email, today, zone, companyWide } = a;
  const todayOnly = a.scope === 'today';

  // The frame: jobs and this person's assignments. A failure here fails the read.
  const [projects, assignments] = await Promise.all([
    rows(db.from('projects').select('id, name, status, start_date, is_archived').eq('tenant_id', t).is('deleted_at', null).limit(2000)),
    rows(db.from('work_assignments').select('project_id, role').eq('tenant_id', t).eq('assignee_user_id', uid).eq('status', 'active').limit(200)),
  ]);

  const live = new Map<string, Row>();
  for (const p of projects) if (!isClosedStatus(p.status) && p.is_archived !== true) live.set(p.id, p);
  const names = new Map<string, string>(projects.map((p) => [p.id, shortJob(p.name) || 'Job']));
  const isLive = (pid: unknown) => !pid || live.has(String(pid));

  /* One hat per job: the strongest non-viewer role wins. */
  const roleOf = new Map<string, string>();
  for (const x of assignments) {
    if (!x.project_id || !live.has(x.project_id)) continue;
    const cur = roleOf.get(x.project_id);
    if (!cur || (cur === 'viewer' && x.role && x.role !== 'viewer')) roleOf.set(x.project_id, lower(x.role) || 'project_manager');
  }
  const liveIds = [...live.keys()];
  const assignedIds = [...roleOf.keys()];
  const workIds = assignedIds.filter((pid) => roleOf.get(pid) !== 'viewer');
  /** Jobs whose job-level work is this person's: every live job for an owner, else their non-viewer assignments. */
  const scopeIds = companyWide ? liveIds : workIds;
  const fieldIds = assignedIds.filter((pid) => FIELD_ROLES.includes(roleOf.get(pid) || '') && (!toDay(live.get(pid)?.start_date) || toDay(live.get(pid)?.start_date)! <= today));

  const ctx: BuildCtx = { today, zone, job: (pid) => (pid ? names.get(pid) ?? null : null) };
  const me = { id: uid, email };
  const safeId = orSafe(uid);
  const safeEmail = orSafe(email);
  const mineOr = (cols: string[]) => cols.flatMap((c) => [safeId, safeEmail].filter(Boolean).map((v) => `${c}.eq.${v}`)).join(',');

  const failures: MyWorkSource[] = [];
  const items: MyWorkItem[] = [];
  const safe = async (source: MyWorkSource, fn: () => Promise<MyWorkItem[]>) => {
    try {
      items.push(...(await fn()));
    } catch (e) {
      // Logged with the source; the page names it and offers Retry.
      console.error(`[my-work] ${source} failed`, e);
      failures.push(source);
    }
  };
  /** A job-level query, scoped to this person's jobs (or the whole company). Null = nothing to ask. */
  const scoped = <Q extends { in: (c: string, v: string[]) => Q }>(q: Q): Q | null => {
    if (companyWide) return q;
    return scopeIds.length ? q.in('project_id', scopeIds) : null;
  };
  const horizon = todayOnly ? today : addDays(today, HORIZON_DAYS);

  let snoozes: Snooze[] = [];
  let snoozeReady = true;

  await Promise.all([
    // Bid packages and their invitations.
    safe('bids', async () => {
      let q = db.from('bid_packages')
        .select('id, project_id, name, status, due_date, bid_due_date, sub_portal_enabled, budget_estimate, low_bid_amount, created_by')
        .eq('tenant_id', t).is('deleted_at', null).in('status', ['open', 'sent']).limit(CAP);
      if (!companyWide) q = scopeIds.length ? q.or(`project_id.in.(${scopeIds.join(',')}),created_by.eq.${safeId}`) : q.eq('created_by', uid);
      // A package's own status says whether it is taking bids — an open package
      // on a finished job (an add-on scope) is still live bidding work.
      const pkgs = await rows(q);
      if (!pkgs.length) return [];
      const invites = await rows(
        db.from('bid_package_invites')
          .select('id, bid_package_id, status, response_status, company_name, sub_name, contact_name')
          .eq('tenant_id', t).in('bid_package_id', pkgs.map((p) => p.id)).limit(5000),
      );
      const out = bidItems(pkgs as never, invites as never, ctx);
      // The badge never needs future "Bids due" days.
      return todayOnly ? out.filter((it) => it.now || (it.day && it.day <= today)) : out;
    }),

    // RFIs: every open one assigned to me, plus the jobs' overdue / due-soon ones.
    safe('rfis', async () => {
      const cols = 'id, project_id, rfi_number, subject, status, due_date, response_due_date, ball_in_court, assigned_to, assigned_to_email';
      const mineQ = db.from('rfis').select(cols).eq('tenant_id', t).is('deleted_at', null).in('status', RFI_OPEN)
        .or(mineOr(['assigned_to', 'assigned_to_email'])).limit(CAP);
      const sweepQ = scoped(db.from('rfis').select(cols).eq('tenant_id', t).is('deleted_at', null).in('status', RFI_SWEEP).limit(CAP));
      const [mine, sweep] = await Promise.all([rows(mineQ), sweepQ ? rows(sweepQ) : Promise.resolve([] as Row[])]);
      const soon = addDays(today, todayOnly ? 0 : REMIND_WITHIN_DAYS);
      const byId = new Map<string, Row>();
      for (const r of mine) byId.set(r.id, r);
      for (const r of sweep) {
        const day = toDay(r.response_due_date) ?? toDay(r.due_date);
        if (day && day <= soon && !byId.has(r.id)) byId.set(r.id, r);
      }
      return rfiItems([...byId.values()].filter((r) => isLive(r.project_id)) as never, ctx, me);
    }),

    safe('submittals', async () => {
      const q = scoped(db.from('submittals')
        .select('id, project_id, submittal_number, title, status, due_date, ball_in_court, subcontractor')
        .eq('tenant_id', t).is('deleted_at', null).not('due_date', 'is', null).lte('due_date', horizon).limit(CAP));
      if (!q) return [];
      return submittalItems((await rows(q)).filter((r) => isLive(r.project_id) && !SUBMITTAL_DONE.includes(lower(r.status))) as never, ctx);
    }),

    // Punch — assigned_to is legacy TEXT (a name or an email), assigned_to_id the person.
    safe('punch', async () => {
      const r = await rows(db.from('punch_list')
        .select('id, project_id, title, description, status, due_date, location')
        .eq('tenant_id', t).is('deleted_at', null)
        .or([`assigned_to_id.eq.${safeId}`, ...[safeId, safeEmail].filter(Boolean).map((v) => `assigned_to.eq.${v}`)].join(','))
        .limit(CAP));
      return punchItems(r.filter((x) => !PUNCH_DONE.includes(lower(x.status)) && isLive(x.project_id)) as never, ctx);
    }),

    // To-dos — assigned_to / assigned_to_id are TEXT holding a uuid OR an email.
    // Done is matched without case: the complete route writes 'Complete'.
    safe('todos', async () => {
      const r = await rows(db.from('project_todos')
        .select('id, project_id, title, description, status, due_date, priority')
        .eq('tenant_id', t).or(mineOr(['assigned_to', 'assigned_to_id'])).limit(CAP));
      return todoItems(r.filter((x) => !TODO_DONE.includes(lower(x.status)) && isLive(x.project_id)) as never, ctx);
    }),

    safe('issues', async () => {
      const r = await rows(db.from('field_issues')
        .select('id, project_id, title, issue_number, status, due_date')
        .eq('tenant_id', t).eq('assigned_to', uid).in('status', ISSUE_OPEN).is('deleted_at', null).limit(CAP));
      return issueItems(r.filter((x) => isLive(x.project_id)) as never, ctx);
    }),

    safe('inspections', async () => {
      const q = scoped(db.from('inspections')
        .select('id, project_id, inspection_type, status, result, scheduled_date, re_inspection_date, inspector_name, inspector, agency')
        .eq('tenant_id', t).gte('scheduled_date', addDays(today, -30)).lte('scheduled_date', `${addDays(horizon, 1)}T00:00:00Z`).limit(CAP));
      if (!q) return [];
      return inspectionItems((await rows(q)).filter((x) => isLive(x.project_id)) as never, ctx, todayOnly ? 0 : HORIZON_DAYS);
    }),

    safe('schedule', async () => {
      const ids = scopeIds.filter((pid) => live.has(pid));
      if (!ids.length) return [];
      const r = await rows(db.from('schedule_tasks')
        .select('id, project_id, name, start_date, end_date, status, trade')
        .eq('tenant_id', t).in('project_id', ids).or(`start_date.lte.${horizon},end_date.lte.${horizon}`).limit(2000));
      return scheduleItems(r as never, ctx, todayOnly ? 0 : HORIZON_DAYS);
    }),

    safe('daily_logs', async () => {
      if (!fieldIds.length) return [];
      const r = await rows(db.from('daily_logs').select('project_id').eq('tenant_id', t).eq('log_date', today).in('project_id', fieldIds).is('deleted_at', null).limit(CAP));
      return dailyLogItems(fieldIds, new Set(r.map((x) => String(x.project_id))), ctx);
    }),

    safe('cois', async () => {
      const q = scoped(db.from('insurance_certificates')
        .select('id, project_id, sub_id, sub_name, vendor_name, insured_name, policy_type, expiry_date')
        .eq('tenant_id', t).not('expiry_date', 'is', null)
        .lte('expiry_date', addDays(today, todayOnly ? COI_NOW_DAYS : COI_WINDOW_DAYS)).gte('expiry_date', addDays(today, -90)).limit(CAP));
      if (!q) return [];
      return coiItems((await rows(q)).filter((x) => isLive(x.project_id)) as never, ctx);
    }),

    safe('pay_apps', async () => {
      const q = scoped(db.from('pay_applications')
        .select('id, project_id, app_number, status, submitted_at, approved_at, certified_at, current_payment_due, net_payment_due, payment_received_at')
        .eq('tenant_id', t).is('deleted_at', null).in('status', ['submitted', 'under_review', 'approved', 'certified']).is('payment_received_at', null).limit(CAP));
      if (!q) return [];
      return payAppItems((await rows(q)).filter((x) => isLive(x.project_id)) as never, ctx);
    }),

    // Submitted T&M waits on whoever runs the job — a viewer never approves.
    safe('tm', async () => {
      const ids = companyWide ? null : workIds;
      if (ids && !ids.length) return [];
      let q = db.from('tm_tickets').select('id, project_id, ticket_number, description, status, total').eq('tenant_id', t).eq('status', 'submitted').limit(CAP);
      if (ids) q = q.in('project_id', ids);
      return tmItems((await rows(q)).filter((x) => isLive(x.project_id)) as never, ctx);
    }),

    safe('assists', async () => {
      const ids = companyWide ? null : assignedIds;
      if (ids && !ids.length) return [];
      let q = db.from('radio_assists').select('id, project_id, note, status, requester_name, channel_id').eq('tenant_id', t).neq('status', 'resolved').limit(CAP);
      if (ids) q = q.in('project_id', ids);
      return assistItems((await rows(q)).filter((x) => isLive(x.project_id)) as never, ctx);
    }),

    // Sales follow-ups hang off a lead, not a job: mine and unassigned ones.
    // Won and Lost owe nobody a call. The queue looks two weeks ahead.
    safe('followups', async () => {
      const r = await rows(db.from('lead_pipeline')
        .select('id, company_name, contact_name, next_action, next_action_date, stage, estimated_value')
        .eq('tenant_id', t).not('next_action_date', 'is', null).not('stage', 'in', '(Won,Lost)')
        .lte('next_action_date', todayOnly ? today : addDays(today, 14))
        .or(`assigned_to.eq.${safeId},assigned_to.is.null`).order('next_action_date', { ascending: true }).limit(CAP));
      return followUpItems(r as never, ctx);
    }),

    // Jobs starting in the next month, and whether they have a schedule yet.
    todayOnly ? Promise.resolve() : safe('jobs', async () => {
      const ids = new Set(companyWide ? liveIds : assignedIds);
      const starting = [...live.values()].filter((p) => ids.has(p.id) && (() => { const d = toDay(p.start_date); return !!d && d >= today && d <= addDays(today, JOB_START_DAYS); })());
      if (!starting.length) return [];
      const tasks = await rows(db.from('schedule_tasks').select('project_id').eq('tenant_id', t).in('project_id', starting.map((p) => p.id)).limit(5000));
      const count = new Map<string, number>();
      for (const x of tasks) count.set(x.project_id, (count.get(x.project_id) || 0) + 1);
      return jobStartItems(starting as never, count, ctx);
    }),

    // What this person snoozed. Until the table exists, nothing is snoozed and Snooze is hidden.
    (async () => {
      const { data, error } = await db.from('my_work_snoozes').select('item_key, until').eq('tenant_id', t).eq('user_id', uid).gt('until', today).limit(1000);
      if (error) {
        snoozeReady = false;
        if (!isMissingTable(error)) console.error('[my-work] snoozes failed', error);
        return;
      }
      snoozes = ((data as Snooze[] | null) || []).map((s) => ({ item_key: s.item_key, until: String(s.until).slice(0, 10) }));
    })(),
  ]);

  // Failures in a fixed order, so the page names them the same way every time.
  const order = Object.keys(SOURCE_LABEL);
  failures.sort((x, y) => order.indexOf(x) - order.indexOf(y));

  // One row per thing to do, whichever query found it.
  const seen = new Set<string>();
  const unique = items.filter((it) => (seen.has(it.key) ? false : (seen.add(it.key), true)));
  return { items: unique, failures, snoozes, snoozeReady, assigned: assignedIds.length };
}

export { isMissingTable };
