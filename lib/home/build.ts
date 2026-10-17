/**
 * Home dashboard aggregation — one builder per view, all from real records.
 *
 * Spec: docs/SPEC-dashboard-2026-10-03.md. Rules this file keeps:
 * - Every query is tenant-scoped (service-role client → manual tenant filter).
 * - Every section is gated server-side by the caller's effective permissions;
 *   switching views never widens access.
 * - A section that fails reports `failed` with a message. It is never a zero.
 * - Nothing is invented: no due date → "Deadline not set"; no SLA policy →
 *   the SLA metric is `unavailable`, not 0.
 */
import { createServerClient } from '@/lib/supabase-server';
import { hasPermission, type PermissionMap } from '@/lib/permissions';
import { ENTITY_META, itemLabel, type EntityType } from '@/lib/approvals';
import { CLOSED_PROJECT_STATUSES, PLACEHOLDER_WAIVER_PREFIX } from '@/lib/project-lifecycle';
import { OPEN_STAGES, normaliseStage } from '@/lib/lead-stages';
import { normalisePhase, PHASE_LABEL } from '@/lib/project-phase';
import { progressOf } from '@/lib/job-picker';
import {
  addDays, daysBetween, dueReason, fmtMoneyShort, isMine, rankQueue, summarisePortfolio, tierForDue,
  type DataState, type HomeView, type Metric, type QueueItem, type ScheduleEntry, type Tier,
} from './rank';
import { buildTicker, zonedMidnightIso, type ReviewGroup, type TickerItem, type TickerSummary } from './ticker';
import { inspectionOutcome } from '@/lib/inspection-result';
import { rfiLabel } from '@/lib/rfi';

type ServerDb = ReturnType<typeof createServerClient>;
/* The generated Database type makes some of these selects blow the TS
   instantiation depth (seen elsewhere as TS2589), and a few tables are not in
   it. A narrow structural view keeps this module type-checked without that. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = { from: (table: string) => any };
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export type Scope = 'mine' | 'team';
export type Window = 'today' | '7d';

export interface Me { id: string; email: string; name: string | null }

export interface BuildCtx {
  db: ServerDb;
  tenantId: string;
  me: Me;
  perms: PermissionMap;
  scope: Scope;
  projectId: string | null;
  today: string;
  window: Window;
  /** The user's IANA zone — "today" for created_at filters. */
  timeZone?: string;
}

export interface WorkTable {
  kind: 'jobs' | 'leads' | 'service' | 'my-jobs';
  title: string;
  columns: Array<{ key: string; label: string; align?: 'right' }>;
  rows: Array<Record<string, string | number | null> & { id: string; href: string }>;
  state: DataState;
  note?: string;
}

export interface HomeSections {
  metrics: Metric[];
  queue: { items: QueueItem[]; total: number; state: DataState; note?: string };
  schedule: { entries: ScheduleEntry[]; state: DataState; note?: string };
  workTable: WorkTable;
  errors: Record<string, string>;
  /** Owner view only: the alert ticker across the top of Home. */
  ticker?: { items: TickerItem[]; summary: TickerSummary; state: DataState };
  /** Server-only hand-off to lib/home/flat-build (the route strips it before answering). */
  internal?: HomeInternal;
}

/** What the flat Home needs from a builder that it would otherwise load twice. */
export interface HomeInternal {
  projects: Map<string, ProjectInfo>;
  /** Jobs at risk and why (operations / owner). */
  risk: Array<{ projectId: string; name: string; reasons: string[] }>;
  /** 'Mine' scope: the jobs this person is assigned to; null = every job. */
  mine: Set<string> | null;
}

const OPEN_RFI_EXCLUDE = ['closed', 'answered', 'void', 'voided', 'cancelled'];
const PUNCH_CLOSED = ['completed', 'complete', 'voided', 'closed'];
const TODO_CLOSED = ['done', 'completed', 'complete', 'cancelled'];
const ISSUE_CLOSED = ['resolved', 'closed', 'converted', 'cancelled'];
const INSPECTION_DONE = ['passed', 'completed', 'approved', 'closed', 'cancelled'];
const SCHEDULE_DONE = ['complete', 'completed', 'done'];
const TICKET_CLOSED = ['closed', 'resolved', 'cancelled', 'completed', 'archived'];
const CLAIM_CLOSED = ['resolved', 'closed', 'denied', 'cancelled'];

const loose = (db: ServerDb) => db as unknown as Loose;
const isClosedProject = (s: unknown) => (CLOSED_PROJECT_STATUSES as readonly string[]).includes(String(s || '').toLowerCase());
const fmtMoney = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

async function safe<T>(name: string, errors: Record<string, string>, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    console.error(`[home:${name}]`, e);
    errors[name] = 'Could not load this section.';
    return null;
  }
}

async function rows(q: Promise<{ data: Row[] | null; error: unknown }> | PromiseLike<{ data: Row[] | null; error: unknown }>): Promise<Row[]> {
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/* ── Shared loaders ─────────────────────────────────────────────────────── */

export interface ProjectInfo {
  id: string; name: string; status: string; phase: string; pm: string | null; address: string | null; contract: number; closed: boolean; bidDue: string | null; pct: number | null;
  /** The stored phase, before normalising (closeout / warranty read differently from building). */
  rawPhase: string | null;
  city: string | null;
  start: string | null;
  finish: string | null;
  actualFinish: string | null;
  archived: boolean;
}

const day = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

export async function loadProjects(ctx: BuildCtx): Promise<Map<string, ProjectInfo>> {
  const r = await rows(
    loose(ctx.db).from('projects')
      .select('id, name, status, phase, pm_name, project_manager, assigned_to_name, address, city, revised_contract_value, contract_amount, contract_value, is_archived, deleted_at, bid_due_date, percent_complete, start_date, actual_start_date, projected_start_date, end_date, target_finish_date, substantial_completion_date, projected_end_date, actual_end_date')
      .eq('tenant_id', ctx.tenantId)
      .is('deleted_at', null)
      .limit(1000),
  );
  const m = new Map<string, ProjectInfo>();
  for (const p of r) {
    m.set(p.id, {
      id: p.id,
      name: p.name || 'Untitled job',
      status: p.status || '',
      phase: normalisePhase(p.phase),
      pm: p.pm_name || p.project_manager || p.assigned_to_name || null,
      address: [p.address, p.city].filter(Boolean).join(', ') || null,
      contract: Number(p.revised_contract_value || p.contract_amount || p.contract_value || 0),
      closed: isClosedProject(p.status) || p.is_archived === true,
      bidDue: p.bid_due_date || null,
      // 0 is the column default, not a measurement: same rule as the job picker.
      pct: progressOf({ percent_complete: p.percent_complete }),
      rawPhase: p.phase ?? null,
      city: p.city || null,
      start: day(p.start_date) || day(p.actual_start_date) || day(p.projected_start_date),
      finish: day(p.end_date) || day(p.target_finish_date) || day(p.substantial_completion_date) || day(p.projected_end_date),
      actualFinish: day(p.actual_end_date),
      archived: p.is_archived === true,
    });
  }
  return m;
}

async function loadMyProjectIds(ctx: BuildCtx): Promise<Set<string>> {
  const r = await rows(
    loose(ctx.db).from('work_assignments')
      .select('project_id')
      .eq('tenant_id', ctx.tenantId)
      .eq('assignee_user_id', ctx.me.id)
      .eq('status', 'active')
      .limit(500),
  );
  return new Set(r.map(x => x.project_id).filter(Boolean));
}

async function loadPeople(ctx: BuildCtx): Promise<Map<string, string>> {
  const r = await rows(
    loose(ctx.db).from('profiles').select('id, full_name, email').eq('tenant_id', ctx.tenantId).limit(1000),
  );
  return new Map(r.map(p => [p.id, p.full_name || p.email || 'Teammate']));
}

/** Apply the job filter when the header has one selected. */
function scoped<Q extends { eq: (c: string, v: string) => Q }>(q: Q, ctx: BuildCtx): Q {
  return ctx.projectId ? q.eq('project_id', ctx.projectId) : q;
}

/* ── Operations sources ─────────────────────────────────────────────────── */

interface OpsData {
  items: QueueItem[];
  overdueWork: number;
  riskByProject: Map<string, string[]>;
  approvals: { count: number; oldestDays: number | null } | null;
  schedule: ScheduleEntry[];
  delayedByProject: Map<string, number>;
  tasksByProject: Map<string, number>;
  nextMilestone: Map<string, { title: string; date: string }>;
}

async function buildOps(ctx: BuildCtx, projects: Map<string, ProjectInfo>, people: Map<string, string>, errors: Record<string, string>): Promise<OpsData> {
  const db = loose(ctx.db);
  const t = ctx.tenantId;
  const today = ctx.today;
  const horizon = addDays(today, 7);
  const items: QueueItem[] = [];
  const riskByProject = new Map<string, string[]>();
  const addRisk = (pid: string | null, why: string) => {
    if (!pid) return;
    const l = riskByProject.get(pid) || [];
    if (!l.includes(why)) l.push(why);
    riskByProject.set(pid, l);
  };
  const live = (pid: string | null) => !pid || (projects.has(pid) && !projects.get(pid)!.closed);
  const pname = (pid: string | null) => (pid && projects.get(pid)?.name) || null;
  const mineOk = (fields: Array<string | null | undefined>) => ctx.scope === 'team' || isMine(fields, ctx.me);
  let overdueWork = 0;

  // RFIs
  await safe('rfis', errors, async () => {
    const r = await rows(scoped(db.from('rfis')
      .select('id, project_id, rfi_number, subject, status, due_date, response_due_date, assigned_to, assigned_to_email, assigned_to_name, ball_in_court, is_urgent, updated_at')
      .eq('tenant_id', t).is('deleted_at', null), ctx).limit(500));
    const overdueByProject = new Map<string, number>();
    for (const x of r) {
      if (OPEN_RFI_EXCLUDE.includes(String(x.status || '').toLowerCase())) continue;
      if (!live(x.project_id) || !mineOk([x.assigned_to, x.assigned_to_email, x.assigned_to_name])) continue;
      const due = x.response_due_date || x.due_date || null;
      const tier = tierForDue(due, today);
      if (tier === 2) { overdueWork++; overdueByProject.set(x.project_id, (overdueByProject.get(x.project_id) || 0) + 1); }
      items.push({
        id: `rfi:${x.id}`, sourceType: 'rfi', sourceId: x.id,
        title: `${rfiLabel(x.rfi_number)} ${x.subject || 'Untitled'}`,
        projectId: x.project_id, projectName: pname(x.project_id),
        owner: x.assigned_to_name || x.assigned_to_email || x.ball_in_court || null,
        dueAt: due, tier,
        reason: `Response ${dueReason(due, today).toLowerCase()}${x.ball_in_court ? ` · ball in court: ${x.ball_in_court}` : ''}`,
        actionLabel: 'Answer RFI', href: `/app/projects/${x.project_id}/rfis`, updatedAt: x.updated_at || null,
      });
    }
    overdueByProject.forEach((n, pid) => addRisk(pid, `${plural(n, 'RFI')} past response date`));
  });

  // Punch (deliveries are punch rows with trade='delivery' — they go to the schedule)
  const deliveries: ScheduleEntry[] = [];
  await safe('punch', errors, async () => {
    const r = await rows(scoped(db.from('punch_list')
      .select('id, project_id, title, description, status, priority, due_date, trade, assigned_to, assigned_to_id, assigned_to_name, assigned_sub_company, updated_at')
      .eq('tenant_id', t).is('deleted_at', null), ctx).limit(1000));
    for (const x of r) {
      if (PUNCH_CLOSED.includes(String(x.status || '').toLowerCase()) || !live(x.project_id)) continue;
      if (String(x.trade || '').toLowerCase() === 'delivery') {
        if (x.due_date && x.due_date >= today && x.due_date <= horizon) {
          deliveries.push({ id: `delivery:${x.id}`, kind: 'Delivery', title: x.title || x.description || 'Delivery', date: x.due_date, time: null, projectId: x.project_id, projectName: pname(x.project_id), who: x.assigned_sub_company || null, href: `/app/projects/${x.project_id}/punch-list` });
        }
        continue;
      }
      if (!mineOk([x.assigned_to_id, x.assigned_to, x.assigned_to_name])) continue;
      const tier = tierForDue(x.due_date, today);
      if (tier === 2) overdueWork++;
      items.push({
        id: `punch:${x.id}`, sourceType: 'punch', sourceId: x.id,
        title: x.title || x.description || 'Punch item',
        projectId: x.project_id, projectName: pname(x.project_id),
        owner: x.assigned_to_name || x.assigned_sub_company || null,
        dueAt: x.due_date || null, tier, reason: dueReason(x.due_date, today),
        actionLabel: 'Open Punch Item', href: `/app/projects/${x.project_id}/punch-list`, updatedAt: x.updated_at || null,
      });
    }
  });

  // To-dos
  await safe('todos', errors, async () => {
    const r = await rows(scoped(db.from('project_todos')
      .select('id, project_id, title, status, due_date, assigned_to, assigned_to_id, updated_at')
      .eq('tenant_id', t), ctx).limit(1000));
    for (const x of r) {
      if (TODO_CLOSED.includes(String(x.status || '').toLowerCase()) || !live(x.project_id)) continue;
      if (!mineOk([x.assigned_to_id, x.assigned_to])) continue;
      const tier = tierForDue(x.due_date, today);
      if (tier === 2) overdueWork++;
      const ownerName = (x.assigned_to_id && people.get(x.assigned_to_id)) || x.assigned_to || null;
      items.push({
        id: `todo:${x.id}`, sourceType: 'todo', sourceId: x.id, title: x.title || 'To-do',
        projectId: x.project_id, projectName: pname(x.project_id), owner: ownerName,
        dueAt: x.due_date || null, tier, reason: dueReason(x.due_date, today),
        actionLabel: 'Open To-Do', href: `/app/projects/${x.project_id}/todos`, updatedAt: x.updated_at || null,
      });
    }
  });

  // Field issues
  await safe('fieldIssues', errors, async () => {
    const r = await rows(scoped(db.from('field_issues')
      .select('id, project_id, title, status, priority, due_date, assigned_to, assigned_to_name, updated_at')
      .eq('tenant_id', t).is('deleted_at', null), ctx).limit(500));
    for (const x of r) {
      if (ISSUE_CLOSED.includes(String(x.status || '').toLowerCase()) || !live(x.project_id)) continue;
      if (!mineOk([x.assigned_to, x.assigned_to_name])) continue;
      const critical = ['critical', 'urgent', 'safety'].includes(String(x.priority || '').toLowerCase());
      const tier = tierForDue(x.due_date, today, { critical });
      if (tier === 2) overdueWork++;
      items.push({
        id: `issue:${x.id}`, sourceType: 'field_issue', sourceId: x.id, title: x.title || 'Field issue',
        projectId: x.project_id, projectName: pname(x.project_id),
        owner: x.assigned_to_name || (x.assigned_to && people.get(x.assigned_to)) || null,
        dueAt: x.due_date || null, tier,
        reason: critical ? `Marked ${String(x.priority).toLowerCase()} · ${dueReason(x.due_date, today).toLowerCase()}` : dueReason(x.due_date, today),
        actionLabel: 'Open in My Work', href: '/app/my-work', updatedAt: x.updated_at || null,
      });
    }
  });

  // Inspections — a scheduled inspection today that has not passed blocks today's work.
  const inspSchedule: ScheduleEntry[] = [];
  await safe('inspections', errors, async () => {
    const r = await rows(scoped(db.from('inspections')
      .select('id, project_id, inspection_type, status, result, scheduled_date, re_inspection_date, inspector_name, inspector, created_at')
      .eq('tenant_id', t), ctx).limit(500));
    for (const x of r) {
      if (!live(x.project_id)) continue;
      const status = String(x.status || '').toLowerCase();
      const date = (x.re_inspection_date || (x.scheduled_date ? String(x.scheduled_date).slice(0, 10) : null)) as string | null;
      const name = x.inspection_type || 'Inspection';
      if (date && date >= today && date <= horizon && !INSPECTION_DONE.includes(status)) {
        inspSchedule.push({ id: `insp-s:${x.id}`, kind: 'Inspection', title: name, date, time: x.scheduled_date && String(x.scheduled_date).length > 10 ? String(x.scheduled_date).slice(11, 16) : null, projectId: x.project_id, projectName: pname(x.project_id), who: x.inspector_name || x.inspector || null, href: `/app/projects/${x.project_id}/inspections?inspection=${x.id}` });
      }
      const failed = inspectionOutcome(x) === 'failed';
      if (INSPECTION_DONE.includes(status) && !failed) continue;
      if (failed) {
        addRisk(x.project_id, 'Failed inspection');
        items.push({ id: `insp:${x.id}`, sourceType: 'inspection', sourceId: x.id, title: `${name} failed`, projectId: x.project_id, projectName: pname(x.project_id), owner: x.inspector_name || null, dueAt: x.re_inspection_date || null, tier: 0, reason: x.re_inspection_date ? `Re-inspection ${dueReason(x.re_inspection_date, today).toLowerCase()}` : 'Failed — no re-inspection date set', actionLabel: 'Open Inspection', href: `/app/projects/${x.project_id}/inspections?inspection=${x.id}`, updatedAt: x.created_at || null });
        continue;
      }
      if (!date) continue;
      if (date === today) {
        items.push({ id: `insp:${x.id}`, sourceType: 'inspection', sourceId: x.id, title: `${name} today`, projectId: x.project_id, projectName: pname(x.project_id), owner: x.inspector_name || null, dueAt: date, tier: 1, reason: 'Scheduled today — result not recorded yet', actionLabel: 'Open Inspection', href: `/app/projects/${x.project_id}/inspections?inspection=${x.id}`, updatedAt: x.created_at || null });
      } else if (date < today) {
        overdueWork++;
        addRisk(x.project_id, 'Inspection date passed with no result');
        items.push({ id: `insp:${x.id}`, sourceType: 'inspection', sourceId: x.id, title: name, projectId: x.project_id, projectName: pname(x.project_id), owner: x.inspector_name || null, dueAt: date, tier: 2, reason: `Scheduled ${plural(daysBetween(date, today), 'day')} ago — no result recorded`, actionLabel: 'Record Result', href: `/app/projects/${x.project_id}/inspections?inspection=${x.id}&record=1`, updatedAt: x.created_at || null });
      } else if (date <= horizon) {
        items.push({ id: `insp:${x.id}`, sourceType: 'inspection', sourceId: x.id, title: name, projectId: x.project_id, projectName: pname(x.project_id), owner: x.inspector_name || null, dueAt: date, tier: 4, reason: dueReason(date, today), actionLabel: 'Open Inspection', href: `/app/projects/${x.project_id}/inspections?inspection=${x.id}`, updatedAt: x.created_at || null });
      }
    }
  });

  // Approvals — only the record types this user may see.
  let approvals: OpsData['approvals'] = null;
  await safe('approvals', errors, async () => {
    const allowed: EntityType[] = [];
    if (hasPermission(ctx.perms, 'Change Orders', 'View')) allowed.push('change_order');
    if (hasPermission(ctx.perms, 'Pay Apps', 'View')) allowed.push('pay_app');
    if (hasPermission(ctx.perms, 'Budget', 'View')) allowed.push('purchase_order', 'invoice');
    if (!allowed.length) return;
    const hrefFor: Record<EntityType, string> = { change_order: 'change-orders', pay_app: 'pay-apps', purchase_order: 'purchase-orders', invoice: 'invoices' };
    let count = 0;
    let oldest: number | null = null;
    for (const type of allowed) {
      const meta = ENTITY_META[type];
      const r = await rows(scoped(db.from(meta.table).select(meta.selectCols.join(', ')).eq('tenant_id', t).in('status', meta.awaiting), ctx).limit(200));
      for (const x of r) {
        if (!live(x.project_id)) continue;
        count++;
        const age = x.created_at ? Math.max(0, daysBetween(String(x.created_at).slice(0, 10), today)) : null;
        if (age != null) oldest = oldest == null ? age : Math.max(oldest, age);
        const stale = age != null && age > 14;
        if (type === 'change_order' && stale) addRisk(x.project_id, 'Change order waiting over 14 days');
        items.push({
          id: `${type}:${x.id}`, sourceType: type, sourceId: x.id,
          title: `${itemLabel(meta, x)} — decision needed`,
          projectId: x.project_id, projectName: pname(x.project_id), owner: null, dueAt: null,
          tier: stale ? 2 : 4,
          reason: age == null ? 'Waiting for a decision' : `Waiting ${plural(age, 'day')} for a decision${stale ? ' (over the 14-day threshold)' : ''}`,
          actionLabel: 'Review', href: x.project_id ? `/app/projects/${x.project_id}/${hrefFor[type]}` : '/app/approval-workflows',
          updatedAt: x.created_at || null,
        });
      }
    }
    approvals = { count, oldestDays: oldest };
  });

  // Compliance — grouped so dozens of reminders never bury today's work.
  await safe('compliance', errors, async () => {
    const coi = await rows(scoped(db.from('insurance_certificates').select('id, project_id, expiry_date, status').eq('tenant_id', t).not('expiry_date', 'is', null).lte('expiry_date', addDays(today, 30)), ctx).limit(1000));
    const coiLive = coi.filter(x => live(x.project_id) && !['replaced', 'archived'].includes(String(x.status || '').toLowerCase()));
    const expired = coiLive.filter(x => x.expiry_date < today);
    const expiring = coiLive.filter(x => x.expiry_date >= today);
    const earliest = (l: Row[]) => l.map(x => x.expiry_date).sort()[0] || null;
    if (expired.length) items.push({ id: 'group:coi-expired', sourceType: 'coi', sourceId: 'expired', title: `${plural(expired.length, 'insurance certificate')} expired`, projectId: null, projectName: null, owner: null, dueAt: earliest(expired), tier: 2, reason: 'Subs working on an expired COI is uninsured exposure', actionLabel: 'Open Compliance', href: '/app/compliance', updatedAt: null, count: expired.length });
    if (expiring.length) { const d = earliest(expiring); items.push({ id: 'group:coi-expiring', sourceType: 'coi', sourceId: 'expiring', title: `${plural(expiring.length, 'insurance certificate')} expire within 30 days`, projectId: null, projectName: null, owner: null, dueAt: d, tier: tierForDue(d, today) === 3 ? 3 : 4, reason: `First expires ${d}`, actionLabel: 'Request Renewals', href: '/app/compliance', updatedAt: null, count: expiring.length }); }

    const lw = await rows(scoped(db.from('lien_waivers').select('id, project_id, status, claimant_name, blocks_payment').eq('tenant_id', t).is('deleted_at', null).in('status', ['pending', 'sent', 'requested', 'viewed']), ctx).limit(1000));
    const lwReal = lw.filter(x => live(x.project_id) && !String(x.claimant_name || '').startsWith(PLACEHOLDER_WAIVER_PREFIX));
    if (lwReal.length) {
      const blocking = lwReal.filter(x => x.blocks_payment === true).length;
      items.push({ id: 'group:lien-waivers', sourceType: 'lien_waiver', sourceId: 'pending', title: `${plural(lwReal.length, 'lien waiver')} not signed yet`, projectId: null, projectName: null, owner: null, dueAt: null, tier: blocking ? 4 : 5, reason: blocking ? `${blocking} block${blocking === 1 ? 's' : ''} a payment` : 'Needed before final payment', actionLabel: 'Open Compliance', href: '/app/compliance', updatedAt: null, count: lwReal.length });
    }

    const w9 = await rows(scoped(db.from('w9_requests').select('id, project_id, status').eq('tenant_id', t).eq('status', 'pending'), ctx).limit(500));
    const w9Live = w9.filter(x => live(x.project_id));
    if (w9Live.length) items.push({ id: 'group:w9', sourceType: 'w9', sourceId: 'pending', title: `${plural(w9Live.length, 'W-9')} not returned`, projectId: null, projectName: null, owner: null, dueAt: null, tier: 5, reason: 'Needed before paying the vendor', actionLabel: 'Open Compliance', href: '/app/compliance', updatedAt: null, count: w9Live.length });
  });

  // Schedule: tasks, milestones, meetings, crews (+ inspections & deliveries above)
  const schedule: ScheduleEntry[] = [...inspSchedule, ...deliveries];
  const delayedByProject = new Map<string, number>();
  const tasksByProject = new Map<string, number>();
  const nextMilestone = new Map<string, { title: string; date: string }>();
  await safe('schedule', errors, async () => {
    const tasks = await rows(scoped(db.from('schedule_tasks').select('id, project_id, name, start_date, end_date, status').eq('tenant_id', t), ctx).limit(2000));
    for (const x of tasks) {
      if (!live(x.project_id)) continue;
      tasksByProject.set(x.project_id, (tasksByProject.get(x.project_id) || 0) + 1);
      const done = SCHEDULE_DONE.includes(String(x.status || '').toLowerCase());
      if (!done && x.end_date && x.end_date < today) delayedByProject.set(x.project_id, (delayedByProject.get(x.project_id) || 0) + 1);
      if (done) continue;
      if (x.start_date && x.start_date >= today && x.start_date <= horizon) schedule.push({ id: `task-s:${x.id}`, kind: 'Starts', title: x.name || 'Schedule task', date: x.start_date, time: null, projectId: x.project_id, projectName: pname(x.project_id), who: null, href: `/app/projects/${x.project_id}/schedule` });
      if (x.end_date && x.end_date >= today && x.end_date <= horizon) schedule.push({ id: `task-e:${x.id}`, kind: 'Finishes', title: x.name || 'Schedule task', date: x.end_date, time: null, projectId: x.project_id, projectName: pname(x.project_id), who: null, href: `/app/projects/${x.project_id}/schedule` });
      const nm = nextMilestone.get(x.project_id);
      if (x.end_date && x.end_date >= today && (!nm || x.end_date < nm.date)) nextMilestone.set(x.project_id, { title: x.name || 'Schedule task', date: x.end_date });
    }
    delayedByProject.forEach((n, pid) => addRisk(pid, `${plural(n, 'schedule task')} past finish date`));

    const ms = await rows(scoped(db.from('schedule_milestones').select('id, project_id, title, name, baseline_date, current_date, actual_date, status, responsible_name').eq('tenant_id', t).is('actual_date', null), ctx).limit(1000));
    for (const x of ms) {
      if (!live(x.project_id)) continue;
      const d = x.current_date || x.baseline_date;
      if (!d) continue;
      const title = x.title || x.name || 'Milestone';
      if (d >= today) {
        const nm = nextMilestone.get(x.project_id);
        if (!nm || d < nm.date) nextMilestone.set(x.project_id, { title, date: d });
      }
      if (d >= today && d <= horizon) schedule.push({ id: `ms:${x.id}`, kind: 'Milestone', title, date: d, time: null, projectId: x.project_id, projectName: pname(x.project_id), who: x.responsible_name || null, href: `/app/projects/${x.project_id}/schedule` });
    }

    const mt = await rows(scoped(db.from('meetings').select('id, project_id, title, meeting_type, meeting_date, start_time, location').eq('tenant_id', t).gte('meeting_date', today).lte('meeting_date', horizon), ctx).limit(200));
    for (const x of mt) if (live(x.project_id)) schedule.push({ id: `mtg:${x.id}`, kind: 'Meeting', title: x.title || x.meeting_type || 'Meeting', date: String(x.meeting_date).slice(0, 10), time: x.start_time ? String(x.start_time).slice(0, 5) : null, projectId: x.project_id, projectName: pname(x.project_id), who: x.location || null, href: `/app/projects/${x.project_id}/overview` });

    const crew = await rows(scoped(db.from('crew_assignments').select('id, project_id, task, trade, date, start_time, worker_id').eq('tenant_id', t).gte('date', today).lte('date', horizon), ctx).limit(500));
    for (const x of crew) if (live(x.project_id)) schedule.push({ id: `crew:${x.id}`, kind: 'Crew', title: x.task || x.trade || 'Crew assignment', date: x.date, time: x.start_time ? String(x.start_time).slice(0, 5) : null, projectId: x.project_id, projectName: pname(x.project_id), who: x.trade || null, href: `/app/projects/${x.project_id}/crews` });
  });

  return { items, overdueWork, riskByProject, approvals, schedule, delayedByProject, tasksByProject, nextMilestone };
}

function windowFilter(entries: ScheduleEntry[], ctx: BuildCtx): ScheduleEntry[] {
  const end = ctx.window === 'today' ? ctx.today : addDays(ctx.today, 7);
  return entries
    .filter(e => e.date >= ctx.today && e.date <= end)
    .sort((a, b) => (a.date + (a.time || '99')).localeCompare(b.date + (b.time || '99')));
}

async function billedNotPaid(ctx: BuildCtx, projects: Map<string, ProjectInfo>): Promise<Metric> {
  if (!hasPermission(ctx.perms, 'Pay Apps', 'View')) {
    return { key: 'billed', label: 'Billed, Not Paid', value: null, basis: '', href: null, state: 'restricted', note: 'Needs Pay Apps access' };
  }
  const r = await rows(scoped(loose(ctx.db).from('pay_applications').select('id, project_id, status, current_payment_due').eq('tenant_id', ctx.tenantId).is('deleted_at', null).in('status', ['approved', 'certified']), ctx).limit(1000));
  const live = r.filter(x => !x.project_id || (projects.has(x.project_id) && !projects.get(x.project_id)!.closed));
  const sum = live.reduce((s, x) => s + Number(x.current_payment_due || 0), 0);
  return {
    key: 'billed', label: 'Billed, Not Paid', value: fmtMoney(sum),
    basis: `${plural(live.length, 'approved/certified pay app')} not marked paid · pay apps carry no due date, so "overdue" can't be computed`,
    href: null, state: live.length ? 'ok' : 'empty',
  };
}

/** Portfolio under contract, and how much of it is billed. "Billed" is the
 *  latest submitted-or-later pay app's completed-and-stored to date per job
 *  (G702 line 4), counted only on jobs that carry a contract value — so
 *  "left to bill" never compares a bill against a missing contract. */
async function underContract(ctx: BuildCtx, jobs: ProjectInfo[]): Promise<Metric> {
  const base = { key: 'contract', label: 'Under Contract', href: '/app/projects' };
  if (!hasPermission(ctx.perms, 'Budget', 'View')) return { ...base, value: null, basis: '', href: null, state: 'restricted', note: 'Needs Budget access' };
  const priced = jobs.filter(j => j.contract > 0);
  const total = priced.reduce((s, j) => s + j.contract, 0);
  const jobsTxt = plural(jobs.length, 'active job');
  if (!total) return { ...base, value: fmtMoney(0), basis: `${jobsTxt} · no contract values entered yet`, state: 'empty' };
  if (!hasPermission(ctx.perms, 'Pay Apps', 'View')) return { ...base, value: fmtMoneyShort(total), basis: `${plural(priced.length, 'job')} with a contract value · ${jobsTxt}`, state: 'ok' };
  const r = await rows(
    loose(ctx.db).from('pay_applications').select('project_id, total_completed_stored')
      .eq('tenant_id', ctx.tenantId).is('deleted_at', null)
      .in('status', ['submitted', 'approved', 'certified', 'paid'])
      .in('project_id', priced.map(j => j.id)).limit(2000),
  );
  const { billed } = summarisePortfolio(priced, r.map(x => ({ project_id: x.project_id ?? null, total_completed_stored: x.total_completed_stored ?? null })));
  return {
    ...base, value: fmtMoneyShort(total), state: 'ok',
    basis: `${fmtMoneyShort(billed)} billed · ${fmtMoneyShort(Math.max(0, total - billed))} left to bill · ${jobsTxt}`,
    progress: Math.max(0, Math.min(1, billed / total)),
  };
}

/* ── View builders ──────────────────────────────────────────────────────── */

const emptyTable = (kind: WorkTable['kind'], title: string, note: string, state: DataState = 'empty'): WorkTable => ({ kind, title, columns: [], rows: [], state, note });

export async function buildOperations(ctx: BuildCtx, errors: Record<string, string>): Promise<HomeSections> {
  return (await operationsWithItems(ctx, errors)).sections;
}

/** buildOperations, plus every ranked queue item (the payload keeps only the top 50). */
async function operationsWithItems(ctx: BuildCtx, errors: Record<string, string>): Promise<{ sections: HomeSections; items: QueueItem[] }> {
  const [projects, people, myProjects] = await Promise.all([
    loadProjects(ctx), loadPeople(ctx).catch(() => new Map<string, string>()),
    ctx.scope === 'mine' ? loadMyProjectIds(ctx).catch(() => new Set<string>()) : Promise.resolve(null),
  ]);
  const ops = await buildOps(ctx, projects, people, errors);
  const queue = rankQueue(ops.items);

  const activeJobs = [...projects.values()].filter(p => !p.closed && (!ctx.projectId || p.id === ctx.projectId) && (!myProjects || myProjects.has(p.id)));
  const atRisk = activeJobs.filter(p => (ops.riskByProject.get(p.id) || []).length > 0);
  const scopeLabel = ctx.scope === 'mine' ? 'Mine' : 'Team';

  const metrics: Metric[] = [
    { key: 'overdue', label: 'Overdue Work', value: errors.rfis && errors.punch ? null : String(ops.overdueWork), basis: `${scopeLabel} · to-dos, punch, RFIs, field issues, inspections past due`, href: null, state: errors.rfis && errors.punch ? 'failed' : ops.overdueWork ? 'ok' : 'empty' },
    { key: 'risk', label: 'Jobs at Risk', value: String(atRisk.length), basis: `${plural(activeJobs.length, 'active job')} · overdue RFIs, late schedule tasks, failed/missed inspections, COs waiting 14+ days`, href: null, state: atRisk.length ? 'ok' : 'empty' },
    ops.approvals
      ? { key: 'approvals', label: 'Approvals Waiting', value: String(ops.approvals.count), basis: ops.approvals.oldestDays != null ? `Oldest waiting ${plural(ops.approvals.oldestDays, 'day')}` : 'Change orders, pay apps, POs, bills you can see', href: '/app/approval-workflows', state: ops.approvals.count ? 'ok' : 'empty' }
      : { key: 'approvals', label: 'Approvals Waiting', value: null, basis: '', href: null, state: errors.approvals ? 'failed' : 'restricted', note: errors.approvals || 'Needs Change Order, Pay App or Budget access' },
    hasPermission(ctx.perms, 'Pay Apps', 'View')
      ? await billedNotPaid(ctx, projects).catch(() => ({ key: 'billed', label: 'Billed, Not Paid', value: null, basis: '', href: null, state: 'failed' as DataState, note: 'Could not load pay apps.' }))
      : (() => {
          const in14 = [...ops.nextMilestone.entries()].filter(([pid, m]) => activeJobs.some(j => j.id === pid) && m.date <= addDays(ctx.today, 14)).length;
          return { key: 'milestones', label: 'Upcoming Milestones', value: String(in14), basis: 'Jobs with a milestone or task finish in the next 14 days', href: null, state: (in14 ? 'ok' : 'empty') as DataState };
        })(),
  ];

  const showMoney = hasPermission(ctx.perms, 'Budget', 'View');
  const topByProject = new Map<string, QueueItem>();
  for (const it of queue) if (it.projectId && !topByProject.has(it.projectId)) topByProject.set(it.projectId, it);
  const tableRows = activeJobs
    .map(p => {
      const delayed = ops.delayedByProject.get(p.id) || 0;
      const hasTasks = (ops.tasksByProject.get(p.id) || 0) > 0;
      const nm = ops.nextMilestone.get(p.id);
      const risk = ops.riskByProject.get(p.id) || [];
      return {
        id: p.id, href: `/app/projects/${p.id}/overview`,
        job: p.name, pm: p.pm || 'Unassigned', phase: PHASE_LABEL[p.phase as keyof typeof PHASE_LABEL] || p.phase,
        milestone: nm?.title || 'Not set', due: nm?.date || null,
        status: delayed ? `Behind (${delayed} late)` : hasTasks ? 'On track' : 'Unknown — no schedule',
        blocker: risk[0] || topByProject.get(p.id)?.title || 'None recorded',
        contract: showMoney ? (p.contract ? fmtMoney(p.contract) : '—') : null,
        progress: p.pct == null ? null : `${p.pct}%`,
        _risk: risk.length,
      };
    })
    .sort((a, b) => b._risk - a._risk || String(a.due || '9999').localeCompare(String(b.due || '9999')))
    .map(({ _risk, ...r }) => r); // eslint-disable-line @typescript-eslint/no-unused-vars

  const sections: HomeSections = {
    metrics,
    queue: { items: queue.slice(0, 50), total: queue.length, state: queue.length ? 'ok' : 'empty' },
    schedule: { entries: windowFilter(ops.schedule, ctx), state: errors.schedule ? 'failed' : 'ok' },
    workTable: {
      kind: 'jobs', title: 'Active Jobs', state: tableRows.length ? 'ok' : 'empty',
      note: tableRows.length ? undefined : ctx.scope === 'mine' ? 'No jobs are assigned to you. Switch to Team to see every job.' : 'No active jobs.',
      columns: [
        { key: 'job', label: 'Job' }, { key: 'pm', label: 'PM' }, { key: 'phase', label: 'Phase' },
        { key: 'milestone', label: 'Next Milestone' }, { key: 'due', label: 'Due' }, { key: 'status', label: 'Schedule' },
        { key: 'blocker', label: 'Main Blocker' }, ...(showMoney ? [{ key: 'contract', label: 'Contract', align: 'right' as const }] : []),
      ],
      rows: tableRows,
    },
    errors,
    internal: {
      projects,
      risk: activeJobs.map(p => ({ projectId: p.id, name: p.name, reasons: ops.riskByProject.get(p.id) || [] })).filter(r => r.reasons.length),
      mine: myProjects,
    },
  };
  return { sections, items: queue };
}

/**
 * Owner ticker sources beyond the queue: sub photos nobody has reviewed, and
 * what got done today. Counts only — never rows the owner can't already reach.
 */
async function ownerTickerExtras(ctx: BuildCtx, projects: Map<string, ProjectInfo>): Promise<{ review: ReviewGroup[]; done: { logs: number; photos: number; punchClosed: number } }> {
  const db = loose(ctx.db);
  const t = ctx.tenantId;
  const since = zonedMidnightIso(ctx.today, ctx.timeZone || 'UTC');
  const live = (pid: string | null) => !!pid && projects.has(pid) && !projects.get(pid)!.closed;
  const count = async (q: PromiseLike<{ count: number | null; error: unknown }>) => {
    const { count: n, error } = await q;
    if (error) throw error;
    return n || 0;
  };

  const [subRows, logs, photos, videos, punchClosed] = await Promise.all([
    rows(scoped(db.from('sub_media_submissions').select('project_id, sender_company, sender_name, kind, destination').eq('tenant_id', t).eq('status', 'new'), ctx).limit(1000)),
    count(scoped(db.from('daily_logs').select('id', { count: 'exact', head: true }).eq('tenant_id', t).eq('log_date', ctx.today).is('deleted_at', null), ctx)),
    count(scoped(db.from('photos').select('id', { count: 'exact', head: true }).eq('tenant_id', t).gte('created_at', since).is('deleted_at', null), ctx)),
    count(scoped(db.from('project_files').select('id', { count: 'exact', head: true }).eq('tenant_id', t).eq('kind', 'video').gte('created_at', since).is('deleted_at', null), ctx)),
    count(scoped(db.from('punch_list').select('id', { count: 'exact', head: true }).eq('tenant_id', t).gte('completed_at', since).is('deleted_at', null), ctx)),
  ]);

  const groups = new Map<string, ReviewGroup>();
  for (const r of subRows) {
    if (!live(r.project_id)) continue;
    const sender = String(r.sender_company || r.sender_name || 'A sub').trim();
    const key = `${r.project_id}|${sender}`;
    const g = groups.get(key) || { projectId: r.project_id, projectName: projects.get(r.project_id)?.name || null, sender, photos: 0, videos: 0, toGc: false };
    if (r.kind === 'video') g.videos++; else g.photos++;
    if (r.destination === 'gc') g.toGc = true;
    groups.set(key, g);
  }
  return { review: [...groups.values()], done: { logs, photos: photos + videos, punchClosed } };
}

export async function buildSales(ctx: BuildCtx, errors: Record<string, string>): Promise<HomeSections> {
  if (!hasPermission(ctx.perms, 'Sales', 'View')) {
    return { metrics: [], queue: { items: [], total: 0, state: 'restricted' }, schedule: { entries: [], state: 'restricted' }, workTable: emptyTable('leads', 'Open Leads', 'Needs Sales access', 'restricted'), errors };
  }
  const db = loose(ctx.db);
  const t = ctx.tenantId;
  const today = ctx.today;
  const [people, projects] = await Promise.all([loadPeople(ctx).catch(() => new Map<string, string>()), loadProjects(ctx)]);
  const items: QueueItem[] = [];
  const schedule: ScheduleEntry[] = [];
  let awaitingFirst = 0, followOverdue = 0, bidsDue = 0, proposalsWaiting = 0;
  const tableRows: WorkTable['rows'] = [];

  await safe('leads', errors, async () => {
    const leads = (await rows(db.from('lead_pipeline').select('id, company_name, contact_name, stage, estimated_value, next_action, next_action_date, assigned_to, created_at, updated_at').eq('tenant_id', t).limit(1000)))
      .filter(l => (OPEN_STAGES as readonly string[]).includes(normaliseStage(l.stage)))
      .filter(l => ctx.scope === 'team' || !l.assigned_to || isMine([l.assigned_to], ctx.me));
    const ids = leads.map(l => l.id);
    const acts = ids.length ? await rows(db.from('lead_activities').select('lead_id, activity_type, completed_at, scheduled_at, created_at, description').eq('tenant_id', t).in('lead_id', ids).limit(5000)) : [];
    const lastContact = new Map<string, string>();
    for (const a of acts) {
      const done = a.completed_at || (!a.scheduled_at ? a.created_at : null);
      if (done) { const prev = lastContact.get(a.lead_id); if (!prev || done > prev) lastContact.set(a.lead_id, done); }
      if (!a.completed_at && a.scheduled_at) {
        const d = String(a.scheduled_at).slice(0, 10);
        if (d >= today && d <= addDays(today, 7)) {
          const l = leads.find(x => x.id === a.lead_id);
          schedule.push({ id: `act:${a.lead_id}:${a.scheduled_at}`, kind: a.activity_type ? String(a.activity_type).replace(/_/g, ' ') : 'Activity', title: `${a.description || 'Scheduled activity'}${l ? ' — ' + (l.company_name || l.contact_name) : ''}`, date: d, time: String(a.scheduled_at).length > 10 ? String(a.scheduled_at).slice(11, 16) : null, projectId: null, projectName: null, who: null, href: `/app/leads/${a.lead_id}` });
        }
      }
    }
    for (const l of leads) {
      const who = l.company_name || l.contact_name || 'Lead';
      const owner = l.assigned_to ? (people.get(l.assigned_to) || l.assigned_to) : null;
      const last = lastContact.get(l.id) || null;
      const lastTxt = last ? `last contact ${Math.max(0, daysBetween(String(last).slice(0, 10), today))}d ago` : 'no contact recorded';
      const stage = normaliseStage(l.stage);
      if (!last && stage === 'New') {
        awaitingFirst++;
        const age = Math.max(0, daysBetween(String(l.created_at).slice(0, 10), today));
        items.push({ id: `lead-first:${l.id}`, sourceType: 'lead', sourceId: l.id, title: `First contact — ${who}`, projectId: null, projectName: null, owner, dueAt: null, tier: age > 2 ? 2 : 3, reason: `New lead added ${age === 0 ? 'today' : plural(age, 'day') + ' ago'} · no contact recorded yet`, actionLabel: 'Open Lead', href: `/app/leads/${l.id}`, updatedAt: l.created_at });
      }
      if (l.next_action_date) {
        const d = String(l.next_action_date).slice(0, 10);
        const tier = tierForDue(d, today);
        if (tier === 2) followOverdue++;
        items.push({ id: `lead-follow:${l.id}`, sourceType: 'follow_up', sourceId: l.id, title: `${l.next_action || 'Follow up'} — ${who}`, projectId: null, projectName: null, owner, dueAt: d, tier, reason: `${dueReason(d, today)} · ${lastTxt}`, actionLabel: 'Open Lead', href: `/app/leads/${l.id}`, updatedAt: l.updated_at });
        if (d >= today && d <= addDays(today, 7)) schedule.push({ id: `follow:${l.id}`, kind: 'Follow-up', title: `${l.next_action || 'Follow up'} — ${who}`, date: d, time: null, projectId: null, projectName: null, who: owner, href: `/app/leads/${l.id}` });
      } else if (last || stage !== 'New') {
        items.push({ id: `lead-nostep:${l.id}`, sourceType: 'lead', sourceId: l.id, title: `No next step — ${who}`, projectId: null, projectName: null, owner, dueAt: null, tier: 5, reason: `${stage} · ${lastTxt}`, actionLabel: 'Schedule Follow-Up', href: `/app/leads/${l.id}`, updatedAt: l.updated_at });
      }
      tableRows.push({ id: l.id, href: `/app/leads/${l.id}`, lead: who, contact: l.contact_name || '—', stage, value: l.estimated_value ? fmtMoney(Number(l.estimated_value)) : '—', owner: owner || 'Unassigned', last: last ? `${Math.max(0, daysBetween(String(last).slice(0, 10), today))}d ago` : 'Never', next: l.next_action || 'Not set', nextDate: l.next_action_date ? String(l.next_action_date).slice(0, 10) : null });
    }
  });

  await safe('proposals', errors, async () => {
    const pr = await rows(scoped(db.from('proposals').select('id, project_id, title, client_name, client_company, status, sent_at, valid_until, accepted_at, declined_at, total_amount, amount, created_by').eq('tenant_id', t).in('status', ['sent', 'viewed']), ctx).limit(500));
    for (const p of pr) {
      if (p.accepted_at || p.declined_at) continue;
      if (ctx.scope === 'mine' && p.created_by && p.created_by !== ctx.me.id) continue;
      proposalsWaiting++;
      const sentAge = p.sent_at ? Math.max(0, daysBetween(String(p.sent_at).slice(0, 10), today)) : null;
      const expired = p.valid_until && String(p.valid_until).slice(0, 10) < today;
      const who = p.client_company || p.client_name || projects.get(p.project_id)?.name || 'Client';
      items.push({ id: `proposal:${p.id}`, sourceType: 'proposal', sourceId: p.id, title: `Proposal decision — ${who}`, projectId: p.project_id, projectName: projects.get(p.project_id)?.name || null, owner: (p.created_by && people.get(p.created_by)) || null, dueAt: p.valid_until || null, tier: expired ? 2 : sentAge != null && sentAge > 7 ? 4 : 5, reason: expired ? 'Proposal validity date passed with no decision' : sentAge != null ? `Sent ${plural(sentAge, 'day')} ago · no decision recorded` : 'Sent · no decision recorded', actionLabel: 'Open Proposal', href: `/app/projects/${p.project_id}/proposal`, updatedAt: p.sent_at || null });
    }
  });

  for (const p of projects.values()) {
    if (p.closed || p.phase !== 'bidding' || !p.bidDue) continue;
    if (ctx.projectId && p.id !== ctx.projectId) continue;
    const d = String(p.bidDue).slice(0, 10);
    if (d > addDays(today, 7)) continue;
    bidsDue++;
    items.push({ id: `bid:${p.id}`, sourceType: 'bid', sourceId: p.id, title: `Bid due — ${p.name}`, projectId: p.id, projectName: p.name, owner: p.pm, dueAt: d, tier: tierForDue(d, today), reason: dueReason(d, today), actionLabel: 'Open Job', href: `/app/projects/${p.id}/overview`, updatedAt: null });
  }

  const queue = rankQueue(items);
  const scopeLabel = ctx.scope === 'mine' ? 'Mine + unassigned' : 'Team';
  return {
    metrics: [
      { key: 'first', label: 'Awaiting First Contact', value: errors.leads ? null : String(awaitingFirst), basis: `${scopeLabel} · New leads with no recorded activity`, href: '/app/leads', state: errors.leads ? 'failed' : awaitingFirst ? 'ok' : 'empty' },
      { key: 'follow', label: 'Follow-Ups Overdue', value: errors.leads ? null : String(followOverdue), basis: `${scopeLabel} · next-action date passed`, href: '/app/leads', state: errors.leads ? 'failed' : followOverdue ? 'ok' : 'empty' },
      { key: 'bids', label: 'Bids Due (7 Days)', value: String(bidsDue), basis: 'Jobs in Bidding with a bid due date in the next 7 days', href: null, state: bidsDue ? 'ok' : 'empty' },
      { key: 'proposals', label: 'Proposals Awaiting Decision', value: errors.proposals ? null : String(proposalsWaiting), basis: 'Sent or viewed · not accepted or declined', href: null, state: errors.proposals ? 'failed' : proposalsWaiting ? 'ok' : 'empty' },
    ],
    queue: { items: queue.slice(0, 50), total: queue.length, state: queue.length ? 'ok' : 'empty' },
    schedule: { entries: windowFilter(schedule, ctx), state: 'ok' },
    workTable: {
      kind: 'leads', title: 'Open Leads', state: errors.leads ? 'failed' : tableRows.length ? 'ok' : 'empty', note: errors.leads ? errors.leads : tableRows.length ? undefined : 'No open leads in this view.',
      columns: [{ key: 'lead', label: 'Lead' }, { key: 'contact', label: 'Contact' }, { key: 'stage', label: 'Stage' }, { key: 'value', label: 'Est. Value', align: 'right' }, { key: 'owner', label: 'Owner' }, { key: 'last', label: 'Last Contact' }, { key: 'next', label: 'Next Step' }, { key: 'nextDate', label: 'Next Date' }],
      rows: tableRows.sort((a, b) => String(a.nextDate || '9999').localeCompare(String(b.nextDate || '9999'))),
    },
    errors,
  };
}

export async function buildService(ctx: BuildCtx, errors: Record<string, string>): Promise<HomeSections> {
  const db = loose(ctx.db);
  const t = ctx.tenantId;
  const today = ctx.today;
  const [projects, people] = await Promise.all([loadProjects(ctx), loadPeople(ctx).catch(() => new Map<string, string>())]);
  const pname = (pid: string | null) => (pid && projects.get(pid)?.name) || null;
  const items: QueueItem[] = [];
  const schedule: ScheduleEntry[] = [];
  const tableRows: WorkTable['rows'] = [];
  let unassigned = 0, visitsToday = 0, slaBreached = 0, slaConfigured = 0, completedOpen = 0;

  await safe('serviceTickets', errors, async () => {
    const tk = await rows(scoped(db.from('service_tickets').select('id, ticket_number, project_id, title, category, priority, status, sla_hours, scheduled_window_start, scheduled_window_end, assigned_tech_id, created_at, updated_at').eq('tenant_id', t), ctx).limit(1000));
    for (const x of tk) {
      if (String(x.status || '').toLowerCase() === 'completed') completedOpen++;
      if (TICKET_CLOSED.includes(String(x.status || '').toLowerCase())) continue;
      if (ctx.scope === 'mine' && x.assigned_tech_id && x.assigned_tech_id !== ctx.me.id) continue;
      const tech = x.assigned_tech_id ? (people.get(x.assigned_tech_id) || 'Assigned') : null;
      const win = x.scheduled_window_start ? String(x.scheduled_window_start).slice(0, 10) : null;
      let breach = false;
      if (x.sla_hours) {
        slaConfigured++;
        const deadline = Date.parse(x.created_at) + Number(x.sla_hours) * 3_600_000;
        if (Date.now() > deadline && !win) { breach = true; slaBreached++; }
      }
      if (!tech) unassigned++;
      if (win === today) visitsToday++;
      const tier: Tier = breach ? 0 : !tech ? 3 : tierForDue(win, today);
      items.push({ id: `ticket:${x.id}`, sourceType: 'service_ticket', sourceId: x.id, title: `${x.ticket_number ? x.ticket_number + ' ' : ''}${x.title || x.category || 'Service call'}`, projectId: x.project_id, projectName: pname(x.project_id), owner: tech, dueAt: win, tier, reason: breach ? `SLA of ${x.sla_hours}h passed with no visit scheduled` : !tech ? `Unassigned${x.priority ? ' · ' + x.priority + ' priority' : ''}` : win ? `Visit ${dueReason(win, today).toLowerCase()}` : 'No visit window set', actionLabel: tech ? 'Open Ticket' : 'Assign Tech', href: `/app/service?ticket=${x.id}`, updatedAt: x.updated_at || null });
      if (win && win >= today && win <= addDays(today, 7)) schedule.push({ id: `ticket-s:${x.id}`, kind: 'Service Visit', title: x.title || 'Service visit', date: win, time: String(x.scheduled_window_start).slice(11, 16) || null, projectId: x.project_id, projectName: pname(x.project_id), who: tech, href: `/app/service?ticket=${x.id}` });
      tableRows.push({ id: `t-${x.id}`, href: `/app/service?ticket=${x.id}`, item: `${x.ticket_number || 'Ticket'} — ${x.title || x.category || 'Service call'}`, job: pname(x.project_id) || '—', type: 'Service call', priority: x.priority || '—', status: x.status || '—', assigned: tech || 'Unassigned', when: win });
    }
  });

  await safe('warranty', errors, async () => {
    const wc = await rows(scoped(db.from('warranty_claims').select('id, claim_number, project_id, title, severity, status, assigned_to, scheduled_date, reported_date, created_at, updated_at').eq('tenant_id', t), ctx).limit(1000));
    for (const x of wc) {
      if (CLAIM_CLOSED.includes(String(x.status || '').toLowerCase())) continue;
      if (ctx.scope === 'mine' && x.assigned_to && !isMine([x.assigned_to], ctx.me)) continue;
      const who = x.assigned_to ? (people.get(x.assigned_to) || x.assigned_to) : null;
      if (!who) unassigned++;
      if (x.scheduled_date === today) visitsToday++;
      const critical = ['critical', 'emergency'].includes(String(x.severity || '').toLowerCase());
      const tier: Tier = critical ? 0 : !who ? 3 : tierForDue(x.scheduled_date, today);
      items.push({ id: `claim:${x.id}`, sourceType: 'warranty_claim', sourceId: x.id, title: `Warranty ${x.claim_number ? '#' + x.claim_number + ' ' : ''}${x.title || 'claim'}`, projectId: x.project_id, projectName: pname(x.project_id), owner: who, dueAt: x.scheduled_date || null, tier, reason: critical ? `${x.severity} severity` : !who ? 'Unassigned warranty claim' : x.scheduled_date ? `Visit ${dueReason(x.scheduled_date, today).toLowerCase()}` : 'No visit scheduled', actionLabel: who ? 'Open Claim' : 'Assign', href: '/app/warranty-claims', updatedAt: x.updated_at || null });
      if (x.scheduled_date && x.scheduled_date >= today && x.scheduled_date <= addDays(today, 7)) schedule.push({ id: `claim-s:${x.id}`, kind: 'Warranty Visit', title: x.title || 'Warranty visit', date: x.scheduled_date, time: null, projectId: x.project_id, projectName: pname(x.project_id), who, href: '/app/warranty-claims' });
      tableRows.push({ id: `w-${x.id}`, href: '/app/warranty-claims', item: `Warranty ${x.claim_number ? '#' + x.claim_number : ''} ${x.title || ''}`.trim(), job: pname(x.project_id) || '—', type: 'Warranty (no charge)', priority: x.severity || '—', status: x.status || '—', assigned: who || 'Unassigned', when: x.scheduled_date || null });
    }
  });

  const queue = rankQueue(items);
  return {
    metrics: [
      { key: 'unassigned', label: 'Unassigned Calls', value: String(unassigned), basis: 'Open service tickets + warranty claims with no one assigned', href: '/app/service?filter=unassigned', state: unassigned ? 'ok' : 'empty' },
      { key: 'today', label: 'Visits Today', value: String(visitsToday), basis: 'Service windows and warranty visits dated today', href: null, state: visitsToday ? 'ok' : 'empty' },
      slaConfigured
        ? { key: 'sla', label: 'SLA Breached', value: String(slaBreached), basis: `${plural(slaConfigured, 'ticket')} with an SLA · past it with no visit scheduled`, href: null, state: slaBreached ? 'ok' : 'empty' }
        : { key: 'sla', label: 'SLA Breached', value: null, basis: '', href: null, state: 'unavailable', note: 'No SLA policies configured on any open ticket' },
      errors.serviceTickets
        ? { key: 'invoice', label: 'Completed, Not Closed', value: null, basis: '', href: null, state: 'failed', note: errors.serviceTickets }
        : { key: 'invoice', label: 'Completed, Not Closed', value: String(completedOpen), basis: 'Visits marked Completed, not yet Closed · invoices aren\'t linked to tickets, so close a call once it\'s billed', href: '/app/service?filter=completed', state: completedOpen ? 'ok' : 'empty' },
    ],
    queue: { items: queue.slice(0, 50), total: queue.length, state: queue.length ? 'ok' : 'empty' },
    schedule: { entries: windowFilter(schedule, ctx), state: 'ok' },
    workTable: {
      kind: 'service', title: 'Service & Warranty Work', state: tableRows.length ? 'ok' : 'empty',
      note: tableRows.length ? undefined : 'No open service calls or warranty claims.',
      columns: [{ key: 'item', label: 'Work Item' }, { key: 'job', label: 'Job / Site' }, { key: 'type', label: 'Type' }, { key: 'priority', label: 'Priority' }, { key: 'status', label: 'Status' }, { key: 'assigned', label: 'Assigned' }, { key: 'when', label: 'Scheduled' }],
      rows: tableRows,
    },
    errors,
  };
}

export async function buildOwner(ctx: BuildCtx, errors: Record<string, string>): Promise<HomeSections> {
  const [{ sections: ops, items: allItems }, projects] = await Promise.all([operationsWithItems({ ...ctx, scope: 'team' }, errors), loadProjects(ctx)]);
  const decisions = ops.queue.items.filter(i => ['change_order', 'pay_app', 'purchase_order', 'invoice'].includes(i.sourceType));
  const exceptions = ops.queue.items.filter(i => i.tier <= 2);
  const merged = rankQueue([...exceptions, ...decisions]);
  const risk = ops.metrics.find(m => m.key === 'risk')!;
  const approvals = ops.metrics.find(m => m.key === 'approvals')!;
  const billed = hasPermission(ctx.perms, 'Pay Apps', 'View')
    ? ops.metrics.find(m => m.key === 'billed') || { key: 'billed', label: 'Billed, Not Paid', value: null, basis: '', href: null, state: 'failed' as DataState }
    : { key: 'billed', label: 'Billed, Not Paid', value: null, basis: '', href: null, state: 'restricted' as DataState, note: 'Needs Pay Apps access' };
  const activeJobs = [...projects.values()].filter(p => !p.closed && (!ctx.projectId || p.id === ctx.projectId));
  const contract = await underContract(ctx, activeJobs).catch((e): Metric => {
    console.error('[home:contract]', e);
    return { key: 'contract', label: 'Under Contract', value: null, basis: '', href: null, state: 'failed', note: 'Could not load contract values.' };
  });
  // The owner's job table: who runs it, where it stands, how far along, what it's worth.
  const keep = ['job', 'pm', 'phase', 'status', 'contract'];
  const cols = ops.workTable.columns.filter(c => keep.includes(c.key));
  const at = cols.findIndex(c => c.key === 'phase') + 1;
  cols.splice(at, 0, { key: 'progress', label: 'Progress' });
  // The alert ticker. Its extras failing must not cost the owner the queue-based
  // lines, so they load separately and degrade to "no extras".
  const extras = await safe('ticker', errors, () => ownerTickerExtras(ctx, projects));
  const tick = buildTicker({ items: allItems, review: extras?.review || [], done: extras?.done || null });
  return {
    ...ops,
    ticker: { ...tick, state: extras ? 'ok' : 'failed' },
    metrics: [
      contract,
      risk,
      billed,
      { ...approvals, key: 'decisions', label: 'Decisions Waiting' },
    ],
    queue: { items: merged.slice(0, 50), total: merged.length, state: merged.length ? 'ok' : 'empty' },
    workTable: { ...ops.workTable, columns: cols },
  };
}

export async function buildField(ctx: BuildCtx, errors: Record<string, string>): Promise<HomeSections> {
  const mineCtx: BuildCtx = { ...ctx, scope: 'mine' };
  const [projects, people, myProjects] = await Promise.all([loadProjects(mineCtx), loadPeople(mineCtx).catch(() => new Map<string, string>()), loadMyProjectIds(mineCtx).catch(() => new Set<string>())]);
  const ops = await buildOps(mineCtx, projects, people, errors);
  const mineItems = ops.items.filter(i => !i.id.startsWith('group:') && !['change_order', 'pay_app', 'purchase_order', 'invoice'].includes(i.sourceType));
  // Inspections on my jobs count even though they have no assignee.
  const queue = rankQueue(mineItems.filter(i => i.sourceType !== 'inspection' || (i.projectId && myProjects.has(i.projectId))));
  const myJobs = [...projects.values()].filter(p => myProjects.has(p.id) && !p.closed);
  const schedule = windowFilter(ops.schedule.filter(e => e.projectId && myProjects.has(e.projectId)), ctx);
  const overdue = queue.filter(i => i.tier === 2).length;
  const dueToday = queue.filter(i => i.tier === 3 || i.tier === 1).length;
  return {
    metrics: [
      { key: 'overdue', label: 'My Overdue', value: String(overdue), basis: 'Assigned to you · past due', href: '/app/my-work', state: overdue ? 'ok' : 'empty' },
      { key: 'today', label: 'Due Today', value: String(dueToday), basis: 'Assigned to you, or an inspection on your job today', href: '/app/my-work', state: dueToday ? 'ok' : 'empty' },
      { key: 'jobs', label: 'My Jobs', value: String(myJobs.length), basis: 'Active jobs you are assigned to', href: '/app/my-work', state: myJobs.length ? 'ok' : 'empty' },
      { key: 'week', label: 'On My Schedule', value: String(windowFilter(ops.schedule.filter(e => e.projectId && myProjects.has(e.projectId)), { ...ctx, window: '7d' }).length), basis: 'Next 7 days on your jobs', href: null, state: 'ok' },
    ],
    queue: { items: queue.slice(0, 50), total: queue.length, state: queue.length ? 'ok' : 'empty' },
    schedule: { entries: schedule, state: errors.schedule ? 'failed' : 'ok' },
    workTable: {
      kind: 'my-jobs', title: 'My Jobs', state: myJobs.length ? 'ok' : 'empty',
      note: myJobs.length ? undefined : 'You are not assigned to any active job yet.',
      columns: [{ key: 'job', label: 'Job' }, { key: 'address', label: 'Address' }, { key: 'phase', label: 'Phase' }, { key: 'open', label: 'Open Items', align: 'right' }],
      rows: myJobs.map(p => ({ id: p.id, href: `/app/projects/${p.id}/overview`, job: p.name, address: p.address || '—', phase: PHASE_LABEL[p.phase as keyof typeof PHASE_LABEL] || p.phase, open: queue.filter(i => i.projectId === p.id).length })),
    },
    errors,
  };
}

export const BUILDERS: Record<HomeView, (ctx: BuildCtx, errors: Record<string, string>) => Promise<HomeSections>> = {
  operations: buildOperations,
  sales: buildSales,
  service: buildService,
  owner: buildOwner,
  field: buildField,
};
