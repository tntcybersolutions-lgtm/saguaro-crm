/**
 * Flat Home — loads the records behind Bidding, Jobs, Money, the COI count and
 * Sage's brief, and shapes them with lib/home/flat + lib/home/brief.
 *
 * - Every query is tenant-scoped and honours the header's job filter.
 * - Each section loads on its own: a failed read marks that section `failed`
 *   (and names it in `errors`) while the rest of Home still renders.
 * - Sections are gated by the caller's permissions, like the rest of /api/home.
 */
import { hasPermission } from '@/lib/permissions';
import type { BuildCtx, HomeSections, ProjectInfo } from './build';
import { loadProjects } from './build';
import { addDays, type HomeView } from './rank';
import {
  bidRows, coiSummary, jobRows, moneyRows, ownerStrip, stripFromMetrics, OPEN_BID_STATUSES, BILLED_STATUSES,
  type BidRow, type CoiSummary, type JobRow, type MoneySummary, type SectionState, type StripFigure,
  type BidPackageIn, type InviteIn, type SubmissionIn, type PayAppIn, type CertIn,
} from './flat';
import { buildBrief, type Brief } from './brief';
import { financeHome, type FinanceHome } from './finance';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = { from: (table: string) => any };
type Res<T> = { data: T[] | null; error: unknown };

export interface FlatSection<R> { state: SectionState; rows: R[]; total: number; note?: string }

export interface FlatHome {
  brief: Brief;
  strip: StripFigure[];
  /** null = this view doesn't show the section. */
  bidding: FlatSection<BidRow> | null;
  jobs: FlatSection<JobRow> | null;
  money: (FlatSection<MoneySummary['rows'][number]> & { usualDays: number | null; paidCount: number }) | null;
  /** What's on the calendar in the next 7 days — the schedule itself lives in My Work. */
  comingUp: { count: number; next: { title: string; date: string; kind: string } | null };
  /** The money picture (owner / operations views); null for the other views. */
  finance: FinanceHome | null;
}

const HOME_ROWS = 5;

async function list<T>(q: PromiseLike<Res<T>>): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function section<T>(name: string, errors: Record<string, string>, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    console.error(`[home:${name}]`, e);
    errors[name] = 'Could not load this section.';
    return null;
  }
}

export async function buildFlat(ctx: BuildCtx, view: HomeView, sections: HomeSections, errors: Record<string, string>): Promise<FlatHome> {
  const db = ctx.db as unknown as Loose;
  const t = ctx.tenantId;
  const canProjects = hasPermission(ctx.perms, 'Projects', 'View');
  const canBudget = hasPermission(ctx.perms, 'Budget', 'View');
  const canPayApps = hasPermission(ctx.perms, 'Pay Apps', 'View');
  const company = view === 'owner' || view === 'operations';
  const byJob = <Q extends { eq: (c: string, v: string) => Q }>(q: Q): Q => (ctx.projectId ? q.eq('project_id', ctx.projectId) : q);

  // Jobs: the builder's own load when it made one; otherwise load them here (only the company views need them).
  let projects: Map<string, ProjectInfo> | null = sections.internal?.projects || null;
  if (!projects && company && canProjects) projects = await section('jobs', errors, () => loadProjects(ctx));
  const jobNames = new Map<string, string>([...(projects?.values() || [])].map(p => [p.id, p.name]));
  const usable = (pid: string) => !!projects && projects.has(pid) && !projects.get(pid)!.archived;

  /* Bidding — open packages with their invites and bids. */
  let bids: BidRow[] | null = null;
  if (company && canProjects) {
    bids = await section('bidding', errors, async () => {
      const pk = (await list<BidPackageIn & { deleted_at?: string | null }>(byJob(db.from('bid_packages')
        .select('id, project_id, name, trade, status, due_date, bid_due_date, sub_portal_enabled, budget_estimate, estimated_value, deleted_at')
        .eq('tenant_id', t).is('deleted_at', null).in('status', OPEN_BID_STATUSES)).limit(500)))
        .filter(p => usable(p.project_id));
      const ids = pk.map(p => p.id);
      const [inv, sub] = ids.length
        ? await Promise.all([
            list<InviteIn>(db.from('bid_package_invites').select('bid_package_id, status, response_status').eq('tenant_id', t).in('bid_package_id', ids).limit(5000)),
            list<SubmissionIn>(db.from('bid_submissions').select('id, bid_package_id, status, amount, base_amount, base_bid, sub_id, sub_email, company_name').eq('tenant_id', t).in('bid_package_id', ids).limit(5000)),
          ])
        : [[], []];
      return bidRows({ packages: pk, invites: inv, submissions: sub, jobNames, today: ctx.today, showMoney: canBudget });
    });
  }

  /* Pay apps — billing on each job, and the Money rows. */
  let apps: PayAppIn[] | null = null;
  if (company && canPayApps) {
    apps = await section('money', errors, () => list<PayAppIn>(byJob(db.from('pay_applications')
      .select('id, project_id, app_number, status, total_completed_stored, current_payment_due, payment_amount, submitted_at, application_date, payment_received_at, total_retainage')
      .eq('tenant_id', t).is('deleted_at', null).in('status', BILLED_STATUSES)).limit(3000)));
    if (apps) apps = apps.filter(a => !a.project_id || usable(a.project_id) || !projects);
  }
  const money = apps ? moneyRows({ apps, jobNames, today: ctx.today }) : null;

  /* Insurance on file. */
  let coi: CoiSummary | null = null;
  if (company && canProjects) {
    coi = await section('coi', errors, async () => coiSummary(await list<CertIn>(byJob(db.from('insurance_certificates')
      .select('id, sub_name, vendor_name, status, expiry_date, project_id')
      .eq('tenant_id', t)).limit(3000)), ctx.today));
  }

  /* Jobs. */
  let jobs: JobRow[] | null = null;
  if (company && projects) {
    const mine = sections.internal?.mine || null;
    jobs = jobRows({
      jobs: [...projects.values()]
        .filter(p => (!ctx.projectId || p.id === ctx.projectId) && (!mine || mine.has(p.id)))
        .map(p => ({ id: p.id, name: p.name, status: p.status, phase: p.rawPhase, city: p.city, start: p.start, finish: p.finish, actualFinish: p.actualFinish, contract: p.contract, archived: p.archived })),
      apps: apps || [], bids: bids || [], today: ctx.today, showMoney: canBudget, showBilling: canPayApps && !!apps,
      risk: new Map((sections.internal?.risk || []).map(r => [r.projectId, r.reasons])),
    });
  }

  /* The number strip. */
  const strip = view === 'owner'
    ? ownerStrip({ jobs: jobs || [], openBids: bids ? bids.length : null, coi, canBudget, canPayApps: canPayApps && !!apps })
    : stripFromMetrics(sections.metrics, view);
  if (view === 'owner' && !jobs) strip[0] = { ...strip[0], value: null, note: 'Could not load jobs' };
  if (view === 'owner' && canPayApps && canBudget && !apps) strip[1] = { ...strip[1], value: null, note: 'Could not load pay apps' };

  /* Sage's brief. */
  const brief = buildBrief({
    today: ctx.today,
    bids, money, coi,
    queue: sections.queue.items,
    risk: sections.internal?.risk || [],
    jobs: [...(projects?.values() || [])].filter(p => !p.closed && !p.archived).map(p => ({ id: p.id, name: p.name, start: p.start })),
    incomplete: Object.keys(errors).length > 0,
  });

  const week = sections.schedule.entries.filter(e => e.date >= ctx.today && e.date <= addDays(ctx.today, 7));

  const state = <R>(rows: R[] | null, name: string, restricted: boolean): FlatSection<R> => {
    if (restricted) return { state: 'restricted', rows: [], total: 0 };
    if (!rows) return { state: 'failed', rows: [], total: 0, note: errors[name] || 'Could not load this section.' };
    return { state: rows.length ? 'ok' : 'empty', rows: rows.slice(0, name === 'bidding' ? 50 : HOME_ROWS), total: rows.length };
  };

  return {
    brief,
    strip,
    bidding: company ? state(bids, 'bidding', !canProjects) : null,
    jobs: company ? state(jobs, 'jobs', !canProjects) : null,
    money: company && (canPayApps || view === 'owner')
      ? { ...state(money?.rows || (apps ? [] : null), 'money', !canPayApps), usualDays: money?.usualDays ?? null, paidCount: money?.paidCount ?? 0 }
      : null,
    comingUp: { count: week.length, next: week[0] ? { title: week[0].title, date: week[0].date, kind: week[0].kind } : null },
    finance: company && (canBudget || canPayApps)
      ? financeHome({ apps, jobs, bids, today: ctx.today, canBudget, canPayApps })
      : null,
  };
}
