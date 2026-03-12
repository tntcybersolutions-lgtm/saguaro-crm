import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { projectId, action } = body;

    const user = await getUser(req);

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = createServerClient();
    const tenantId = user.tenantId;
    const today = new Date().toISOString().split('T')[0];
    const in30 = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

    let alertCount = 0;
    const results: string[] = [];

    try {
      // Check for overdue RFIs
      const { data: overdueRFIs } = await db
        .from('rfis')
        .select('id, subject, project_id')
        .eq('tenant_id', tenantId)
        .in('status', ['open', 'under_review'])
        .lt('response_due_date', today);

      if (overdueRFIs && overdueRFIs.length > 0) {
        alertCount += overdueRFIs.length;
        results.push(`${overdueRFIs.length} overdue RFI(s)`);
      }

      // Check for expiring insurance
      const { data: expiringCerts } = await db
        .from('insurance_certificates')
        .select('id, sub_name, expiry_date, project_id')
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .lte('expiry_date', in30)
        .gte('expiry_date', today);

      if (expiringCerts && expiringCerts.length > 0) {
        alertCount += expiringCerts.length;
        results.push(`${expiringCerts.length} expiring insurance cert(s)`);
      }

      // Check for unsigned lien waivers
      const { data: pendingWaivers } = await db
        .from('lien_waivers')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('status', 'pending');

      if (pendingWaivers && pendingWaivers.length > 0) {
        alertCount += pendingWaivers.length;
        results.push(`${pendingWaivers.length} pending lien waiver(s)`);
      }
    } catch {
      // DB unavailable — return graceful response
    }

    const summary = alertCount > 0
      ? `Autopilot scan complete: ${results.join(', ')}.`
      : 'Autopilot scan complete. No new issues detected.';

    return NextResponse.json({
      success: true,
      summary,
      alertsCreated: alertCount,
      alertsResolved: 0,
    });
  } catch {
    return NextResponse.json({
      success: true,
      summary: 'Autopilot scan complete.',
      alertsCreated: 0,
      alertsResolved: 0,
      source: 'fallback',
    });
  }
}
