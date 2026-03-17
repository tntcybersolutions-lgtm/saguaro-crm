import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { projectId } = body;

    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = createServerClient();
    const tenantId = user.tenantId;
    const today = new Date().toISOString().split('T')[0];
    const in30 = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

    const newAlerts: {
      tenant_id: string;
      project_id: string | null;
      severity: string;
      alert_type: string;
      message: string;
      status: string;
    }[] = [];
    const results: string[] = [];

    // 1. Overdue RFIs
    let rfiQuery = db
      .from('rfis')
      .select('id, subject, project_id')
      .eq('tenant_id', tenantId)
      .in('status', ['open', 'under_review'])
      .lt('response_due_date', today)
      .limit(20);
    if (projectId) rfiQuery = rfiQuery.eq('project_id', projectId);

    const { data: overdueRFIs } = await rfiQuery;
    if (overdueRFIs?.length) {
      for (const rfi of overdueRFIs) {
        newAlerts.push({
          tenant_id: tenantId,
          project_id: rfi.project_id,
          severity: 'high',
          alert_type: 'Overdue RFI',
          message: `RFI "${rfi.subject || rfi.id}" is past due`,
          status: 'open',
        });
      }
      results.push(`${overdueRFIs.length} overdue RFI(s)`);
    }

    // 2. Expiring insurance certificates (within 30 days)
    let certQuery = db
      .from('insurance_certificates')
      .select('id, sub_name, expiry_date, project_id')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .lte('expiry_date', in30)
      .gte('expiry_date', today)
      .limit(20);
    if (projectId) certQuery = certQuery.eq('project_id', projectId);

    const { data: expiringCerts } = await certQuery;
    if (expiringCerts?.length) {
      for (const cert of expiringCerts) {
        newAlerts.push({
          tenant_id: tenantId,
          project_id: cert.project_id,
          severity: 'medium',
          alert_type: 'Expiring Insurance',
          message: `${cert.sub_name || 'Certificate'} expires ${cert.expiry_date}`,
          status: 'open',
        });
      }
      results.push(`${expiringCerts.length} expiring insurance cert(s)`);
    }

    // 3. Pending lien waivers
    let waiverQuery = db
      .from('lien_waivers')
      .select('id, project_id')
      .eq('tenant_id', tenantId)
      .eq('status', 'pending')
      .limit(20);
    if (projectId) waiverQuery = waiverQuery.eq('project_id', projectId);

    const { data: pendingWaivers } = await waiverQuery;
    if (pendingWaivers?.length) {
      results.push(`${pendingWaivers.length} pending lien waiver(s)`);
      newAlerts.push({
        tenant_id: tenantId,
        project_id: projectId || null,
        severity: 'medium',
        alert_type: 'Pending Lien Waivers',
        message: `${pendingWaivers.length} lien waiver(s) awaiting signature`,
        status: 'open',
      });
    }

    // 4. Overdue change orders (pending > 14 days)
    const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString();
    let coQuery = db
      .from('change_orders')
      .select('id, title, project_id')
      .eq('tenant_id', tenantId)
      .eq('status', 'pending')
      .lt('created_at', twoWeeksAgo)
      .limit(20);
    if (projectId) coQuery = coQuery.eq('project_id', projectId);

    const { data: staleCOs } = await coQuery;
    if (staleCOs?.length) {
      for (const co of staleCOs) {
        newAlerts.push({
          tenant_id: tenantId,
          project_id: co.project_id,
          severity: 'high',
          alert_type: 'Stale Change Order',
          message: `Change order "${co.title || co.id}" pending > 14 days`,
          status: 'open',
        });
      }
      results.push(`${staleCOs.length} stale change order(s)`);
    }

    // Clear existing open alerts for this tenant/project before inserting new ones
    let deleteQuery = db
      .from('autopilot_alerts')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('status', 'open');
    if (projectId) deleteQuery = deleteQuery.eq('project_id', projectId);
    await deleteQuery;

    // Insert new alerts
    if (newAlerts.length > 0) {
      await db.from('autopilot_alerts').insert(newAlerts);
    }

    const summary = newAlerts.length > 0
      ? `Autopilot scan complete: ${results.join(', ')}.`
      : 'Autopilot scan complete. No new issues detected.';

    return NextResponse.json({
      success: true,
      summary,
      alertsCreated: newAlerts.length,
    });
  } catch (err: unknown) {
    const msg = 'Internal server error';
    console.error('[autopilot/run] error:', msg);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
