import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { runAutopilotScan } from '@/lib/autopilot/scan';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * The 24/7 heartbeat that makes "Autopilot monitors your projects 24/7" TRUE. Vercel cron hits
 * this on a schedule; it scans EVERY tenant with the service-role client and refreshes their
 * open alerts. Guarded by CRON_SECRET in production. Wired in vercel.json.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const db = createServerClient();
    const { data: tenants } = await db.from('tenants').select('id');
    let tenantsScanned = 0;
    let alertsCreated = 0;
    for (const t of (tenants || []) as { id: string }[]) {
      try {
        const { alertsCreated: n } = await runAutopilotScan(db, t.id, null);
        alertsCreated += n;
        tenantsScanned++;
      } catch (e) {
        console.error('[cron/autopilot] tenant scan failed', t.id, e);
      }
    }
    return NextResponse.json({ success: true, tenantsScanned, alertsCreated });
  } catch (e) {
    return apiError('cron/autopilot GET', e);
  }
}
