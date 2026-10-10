import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { runAutopilotScan } from '@/lib/autopilot/scan';
import { requestDay } from '@/lib/time-zone';

/** On-demand "Run Scan Now" — the same engine the 24/7 cron runs, scoped to this user's tenant. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const db = createServerClient();
    const { today } = await requestDay(req.headers, db, user.tenantId, 'autopilot/run');
    const { alertsCreated, summary } = await runAutopilotScan(db, user.tenantId, body.projectId || null, { today });
    return NextResponse.json({ success: true, summary, alertsCreated });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
