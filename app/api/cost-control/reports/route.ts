import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { requirePermission } from '@/lib/permissions';
import { requestDay } from '@/lib/time-zone';

/**
 * Cost-report snapshots (the monthly CM cost report), tenant-scoped.
 *   GET  /api/cost-control/reports?project_id=…  → history (newest first)
 *   POST /api/cost-control/reports               → save a snapshot { project_id, report_date?, title?, notes?, lines, totals }
 *
 * `lines` / `totals` are stored verbatim in integer cents (produced by the page
 * from the live aggregation + lib/finance). Per-line manual overrides ride along
 * in `lines[].committedOverrideCents` / `actualOverrideCents` and are re-applied
 * by GET /api/cost-control on the next load.
 */

async function verifyProject(db: ReturnType<typeof createServerClient>, projectId: string, tenantId: string) {
  const { data } = await db.from('projects').select('id').eq('id', projectId).eq('tenant_id', tenantId).single();
  return !!data;
}

export async function GET(req: NextRequest) {
  const g = await requirePermission(req, 'Budget', 'View');
  if (!g.ok) return g.res;
  const user = g.user;

  const projectId = req.nextUrl.searchParams.get('project_id') || req.nextUrl.searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'project_id is required' }, { status: 400 });

  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('cost_reports')
      .select('id, report_date, title, lines, totals, notes, created_by, created_at')
      .eq('project_id', projectId).eq('tenant_id', user.tenantId)
      .order('report_date', { ascending: false }).order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return NextResponse.json({ reports: data ?? [] });
  } catch (e) {
    // Logged, then answered with a 2xx and an empty body — so the server knew
    // and the screen still showed "no reports" as a fact. apiError() logs
    // the same detail WITH a correlation id and returns a status the client
    // can act on.
    return apiError('cost-control/reports', e, 'Could not load cost reports');
  }
}

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Budget', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;

  try {
    const body = await req.json().catch(() => ({}));
    const projectId: string | undefined = body.project_id || body.projectId;
    if (!projectId) return NextResponse.json({ error: 'project_id is required' }, { status: 400 });
    if (!Array.isArray(body.lines)) return NextResponse.json({ error: 'lines[] is required' }, { status: 400 });

    const db = createServerClient();
    if (!(await verifyProject(db, projectId, user.tenantId)))
      return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data, error } = await db.from('cost_reports').insert({
      tenant_id: user.tenantId,
      project_id: projectId,
      report_date: body.report_date || (await requestDay(req.headers, db, user.tenantId, 'cost-control/reports')).today,
      title: body.title || null,
      lines: body.lines,
      totals: body.totals ?? {},
      notes: body.notes || null,
      created_by: user.id,
    }).select('id, report_date, title, lines, totals, notes, created_at').single();
    if (error) throw error;

    return NextResponse.json({ success: true, report: data });
  } catch (e) {
    return apiError('cost-control/reports POST', e, 'Could not save the cost report. Please try saving it again.');
  }
}
