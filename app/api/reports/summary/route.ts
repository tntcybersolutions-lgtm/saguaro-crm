/**
 * GET /api/reports/summary?projectId=&range=90d|12m|all — the Reports chart
 * library: every tile's numbers for the company, or one job (lib/reports).
 *
 * Gate: Reports ≥ View. Each tile also needs View on its own module (money
 * tiles need Budget, RFIs need RFIs …); without it that tile's rows are never
 * read and the tile comes back null. Every query carries the tenant filter.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission, hasPermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { requestDay } from '@/lib/time-zone';
import { buildReportSummary, parseRange } from '@/lib/reports';
import { liveJobs } from '@/lib/live-jobs';

export const dynamic = 'force-dynamic';

type Res = { data: Record<string, unknown>[] | null; error: unknown };
/** The few builder calls this route uses, over tables named at run time. */
type Q = PromiseLike<Res> & { eq: (c: string, v: unknown) => Q; is: (c: string, v: null) => Q; or: (f: string) => Q };
type LooseDb = { from: (t: string) => { select: (c: string) => Q } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const projectId = sp.get('projectId') || null;
  if (projectId && !UUID.test(projectId)) return NextResponse.json({ error: 'projectId is not a valid job id' }, { status: 400 });
  const db = createServerClient();
  const g = await requirePermission(req, 'Reports', 'View', { projectId, db });
  if (!g.ok) return g.res;
  const t = g.user.tenantId;
  const can = (c: Parameters<typeof hasPermission>[1]) => hasPermission(g.perms, c, 'View');

  try {
    // One query builder per table: tenant always, the job when one is picked.
    const loose = db as unknown as LooseDb;
    const q = (table: string, cols: string, opts: { soft?: boolean } = {}): PromiseLike<Res> => {
      let b = loose.from(table).select(cols).eq('tenant_id', t);
      if (projectId) b = b.eq('project_id', projectId);
      if (opts.soft) b = b.is('deleted_at', null);
      return b;
    };
    const skip: Promise<Res> = Promise.resolve({ data: null, error: null });

    // One job: that job, even when archived (its own report). The company:
    // live jobs only — an archived or deleted job is off every company rollup.
    let pq = loose.from('projects').select('id, name, revised_contract_value, contract_amount, contract_value').eq('tenant_id', t);
    pq = projectId ? pq.is('deleted_at', null).eq('id', projectId) : liveJobs(pq);

    const money = can('Budget');
    const [projects, apps, bills, budget, cos, rfis, subs, punch, safety, tasks] = await Promise.all([
      pq,
      money ? q('pay_applications', 'id, project_id, status, current_payment_due, payment_amount, submitted_at, application_date, payment_received_at, total_completed_stored', { soft: true }) : skip,
      money ? q('bills', 'project_id, total, amount, status, due_date, created_at') : skip,
      money ? q('budget_lines', 'project_id, original_budget, approved_changes, committed, actual, projected') : skip,
      can('Change Orders') || money ? q('change_orders', 'project_id, amount, status, approved_at, created_at', { soft: true }) : skip,
      can('RFIs') ? q('rfis', 'project_id, status, created_at, submitted_at, answered_at, answered_date, closed_at', { soft: true }) : skip,
      can('Submittals') ? q('submittals', 'project_id, status, created_at, submitted_at, returned_at, reviewed_at, response_date, days_to_review', { soft: true }) : skip,
      can('Projects') ? q('punch_list_items', 'project_id, status, trade', { soft: true }) : skip,
      can('Safety') ? q('safety_incidents', 'project_id, incident_date, created_at, near_miss, incident_type, type', { soft: true }) : skip,
      can('Schedule') ? q('schedule_tasks', 'project_id, status, pct_complete, end_date, baseline_end') : skip,
    ]);
    for (const r of [projects, apps, bills, budget, cos, rfis, subs, punch, safety, tasks]) if (r.error) throw r.error;
    const live = new Set((projects.data ?? []).map((p) => String(p.id)));
    const onLive = (rows: Record<string, unknown>[] | null) =>
      rows === null || projectId ? rows : rows.filter((r) => !r.project_id || live.has(String(r.project_id)));

    const { today } = await requestDay(req.headers, db, t, 'reports/summary');
    type Rows = never;
    const summary = buildReportSummary({
      today,
      range: parseRange(sp.get('range')),
      projects: (projects.data ?? []) as Rows,
      payApps: onLive(apps.data) as Rows,
      bills: onLive(bills.data) as Rows,
      budgetLines: onLive(budget.data) as Rows,
      // Money by month counts approved changes; the change-order tile needs its own permission.
      changeOrders: onLive(cos.data) as Rows,
      rfis: onLive(rfis.data) as Rows,
      submittals: onLive(subs.data) as Rows,
      punch: onLive(punch.data) as Rows,
      incidents: onLive(safety.data) as Rows,
      tasks: onLive(tasks.data) as Rows,
    });
    if (!can('Change Orders')) summary.changeOrders = null;
    return NextResponse.json({ ...summary, projectId });
  } catch (e) {
    return apiError('reports/summary', e, "Couldn't load the reports.");
  }
}
