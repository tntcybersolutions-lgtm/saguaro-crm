import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { generateReportData } from '@/lib/reports/generate';
import { apiError } from '@/lib/api-error';
import { requestDay } from '@/lib/time-zone';

export const dynamic = 'force-dynamic';

/**
 * POST /api/reports/generate
 * Body: { reportType, format?, projectId? }
 *
 * Runs a canned report against live tenant data. The reportType→live-query
 * mapping lives in lib/reports/generate.ts (generateReportData), shared with the
 * scheduled-report cron (app/api/cron/report-schedules) so the two can never drift.
 */
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Reports', 'Edit');
  if (!g.ok) return g.res;
  try {
    const body = await req.json().catch(() => ({}));
    const { reportType = 'job-cost', format = 'pdf', projectId } = body;

    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = createServerClient();
    const { zone } = await requestDay(req.headers, db, user.tenantId, 'reports/generate');
    const report = await generateReportData(db, user.tenantId, reportType, projectId, { timeZone: zone });

    return NextResponse.json({
      message: report.message,
      reportType: report.reportType,
      format,
      title: report.title,
      columns: report.columns,
      rows: report.rows,
      source: report.source,
    });
  } catch (e) {
    return apiError('reports/generate', e, "Couldn't run this report. Please try again.");
  }
}
