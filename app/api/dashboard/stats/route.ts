import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

const DEMO_STATS = {
  activeProjects: 3, openBids: 7, pendingPayApps: 2,
  totalContractValue: 7500000, monthlyRevenue: 850000,
  openRFIs: 4, expiringInsurance: 2, pendingWaivers: 6,
};

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ stats: DEMO_STATS, source: 'demo' });

    const db = createServerClient();
    const tenantId = user.tenantId;

    const [
      { count: activeProjects },
      { count: openBids },
      { count: pendingPayApps },
      { data: projects },
      { count: openRFIs },
      { count: expiringInsurance },
    ] = await Promise.all([
      db.from('projects').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'active'),
      db.from('bid_packages').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'open'),
      db.from('pay_applications').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).in('status', ['submitted', 'approved']),
      db.from('projects').select('contract_amount').eq('tenant_id', tenantId).eq('status', 'active'),
      db.from('rfis').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'open'),
      db.from('insurance_certificates').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).lte('expiry_date', new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]),
    ]);

    const totalContractValue = (projects || []).reduce((s: number, p: any) => s + (p.contract_amount || 0), 0);

    return NextResponse.json({
      stats: {
        activeProjects: activeProjects || 0,
        openBids: openBids || 0,
        pendingPayApps: pendingPayApps || 0,
        totalContractValue,
        monthlyRevenue: Math.round(totalContractValue / 12),
        openRFIs: openRFIs || 0,
        expiringInsurance: expiringInsurance || 0,
        pendingWaivers: 0,
      },
      source: 'live',
    });
  } catch {
    return NextResponse.json({ stats: DEMO_STATS, source: 'demo' });
  }
}
