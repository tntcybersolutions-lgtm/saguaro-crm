import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ actions: [], source: 'unauth' }, { status: 401 });

    const db = createServerClient();
    const tenantId = user.tenantId;
    const today = new Date().toISOString().split('T')[0];
    const in30 = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

    const actions: any[] = [];

    // Pending pay apps
    const { data: payApps } = await db.from('pay_applications').select('*, projects(name)').eq('tenant_id', tenantId).in('status', ['submitted', 'approved']).limit(3);
    (payApps || []).forEach((pa: any) => {
      actions.push({
        type: 'pay-app',
        title: `Pay App #${pa.app_number} — ${pa.status === 'submitted' ? 'Awaiting Approval' : 'Awaiting Certification'}`,
        subtitle: `${pa.projects?.name} — ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(pa.current_payment_due || 0)}`,
        urgency: 'high',
        actionUrl: `/app/projects/${pa.project_id}/pay-apps`,
        actionLabel: 'Review',
      });
    });

    // Expiring insurance
    const { data: certs } = await db.from('insurance_certificates').select('*, subcontractors(name), projects(name, id)').eq('tenant_id', tenantId).lte('expiry_date', in30).gte('expiry_date', today).eq('status', 'active').limit(3);
    (certs || []).forEach((cert: any) => {
      const days = Math.ceil((new Date(cert.expiry_date).getTime() - Date.now()) / 86400000);
      actions.push({
        type: 'insurance',
        title: `${cert.subcontractors?.name || 'Sub'} insurance expires in ${days} days`,
        subtitle: `${cert.policy_type} — ${cert.projects?.name}`,
        urgency: days <= 7 ? 'high' : 'medium',
        actionUrl: `/app/projects/${cert.projects?.id}/insurance`,
        actionLabel: 'Request Renewal',
      });
    });

    // Overdue RFIs
    const { data: rfis } = await db.from('rfis').select('*, projects(name, id)').eq('tenant_id', tenantId).eq('status', 'open').lt('due_date', today).limit(3);
    if ((rfis || []).length > 0) {
      actions.push({
        type: 'rfi',
        title: `${rfis!.length} overdue RFI${rfis!.length > 1 ? 's' : ''}`,
        subtitle: (rfis![0] as any).projects?.name || '',
        urgency: 'medium',
        actionUrl: `/app/projects/${(rfis![0] as any).project_id}/rfis`,
        actionLabel: 'View RFIs',
      });
    }

    // Missing W9s
    const { data: w9s } = await db.from('w9_requests').select('*, projects(name, id)').eq('tenant_id', tenantId).eq('status', 'pending').limit(2);
    (w9s || []).forEach((w: any) => {
      actions.push({
        type: 'compliance',
        title: `W-9 missing for ${w.vendor_name}`,
        subtitle: w.projects?.name || '',
        urgency: 'medium',
        actionUrl: `/app/projects/${w.projects?.id}/w9`,
        actionLabel: 'Send Request',
      });
    });

    return NextResponse.json({ actions, source: 'live' });
  } catch {
    return NextResponse.json({ actions: [], source: 'error' });
  }
}
