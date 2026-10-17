import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { runAutopilotScan } from '@/lib/autopilot/scan';
import { requestDay } from '@/lib/time-zone';
import { apiError } from '@/lib/api-error';

/** On-demand "Run Scan Now" — the same engine the 24/7 cron runs, scoped to this user's tenant. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const gate = await requirePermission(req, 'Projects', 'Edit');
  if (!gate.ok) return gate.res;
  const user = gate.user;
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const db = createServerClient();
    const { today } = await requestDay(req.headers, db, user.tenantId, 'autopilot/run');
    const { alertsCreated, summary } = await runAutopilotScan(db, user.tenantId, body.projectId || null, { today });
    return NextResponse.json({ success: true, summary, alertsCreated });
  } catch (e) {
    return apiError('autopilot/run POST', e);
  }
}
