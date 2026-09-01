import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { runReport, ReportRunError } from '@/lib/reports/run';

export const dynamic = 'force-dynamic';

/**
 * POST /api/reports/run
 * Body: { entity, columns?, filters?:[{field,op,value}], groupBy?, sort?:{field,dir}, limit? }
 *
 * Runs an ad-hoc, tenant-scoped read against ONE whitelisted table. All identifier
 * validation and query building lives in lib/reports/run.ts (runReport), which is
 * shared with the scheduled-report cron (app/api/cron/report-schedules) so the two
 * can never drift.
 */
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Reports', 'Edit');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const result = await runReport(createServerClient(), user.tenantId, body);
    return NextResponse.json(result);
  } catch (e: unknown) {
    if (e instanceof ReportRunError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    // A raw Error's text is the database's words, not ours — log it, show the line we wrote.
    console.error('[reports/run]', e);
    const msg = "Failed to run report";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
