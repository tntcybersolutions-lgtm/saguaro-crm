import { NextRequest, NextResponse } from 'next/server';
import { getUser, createServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * Live dashboard metrics — tenant-scoped.
 * One consolidated snapshot the homepage can render without placeholder zeros.
 */
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createServerClient();
  const today = new Date();
  const todayIso = today.toISOString().split('T')[0];
  const in30Days = new Date(today.getTime() + 30 * 86400000).toISOString().split('T')[0];

  try {
    const [
      lwPending, lwExpiring, lwExpired,
      coiExpired, coiExpiring,
      rfisOpen, rfisOverdue,
      cosPending,
      closeoutOpen,
      payAppsDraft,
      projectsActive, projectsPrevailing,
    ] = await Promise.all([
      // Lien waivers pending (status='sent'), expiring in 30d, expired
      db.from('lien_waivers').select('id', { count: 'exact', head: true })
        .eq('tenant_id', user.tenantId).eq('status', 'sent'),
      db.from('lien_waivers').select('id', { count: 'exact', head: true })
        .eq('tenant_id', user.tenantId).eq('status', 'sent')
        .lte('due_date', in30Days).gt('due_date', todayIso),
      db.from('lien_waivers').select('id', { count: 'exact', head: true })
        .eq('tenant_id', user.tenantId).eq('status', 'sent')
        .lt('due_date', todayIso),

      // COI expired / expiring
      db.from('subcontractor_insurance').select('id', { count: 'exact', head: true })
        .eq('tenant_id', user.tenantId).lt('expiry_date', todayIso),
      db.from('subcontractor_insurance').select('id', { count: 'exact', head: true })
        .eq('tenant_id', user.tenantId).gte('expiry_date', todayIso).lte('expiry_date', in30Days),

      // RFIs open / overdue
      db.from('rfis').select('id', { count: 'exact', head: true })
        .eq('tenant_id', user.tenantId).eq('status', 'open'),
      db.from('rfis').select('id', { count: 'exact', head: true })
        .eq('tenant_id', user.tenantId).eq('status', 'open').lt('due_date', todayIso),

      // Change orders pending with $ exposure
      db.from('change_orders').select('id, amount, title, co_number, project_id, status, created_at')
        .eq('tenant_id', user.tenantId).in('status', ['pending', 'submitted'])
        .order('created_at', { ascending: false }).limit(10),

      // Closeout items by category
      db.from('closeout_items').select('id, category, status, project_id, title')
        .eq('tenant_id', user.tenantId).neq('status', 'complete'),

      // Draft pay applications
      db.from('pay_applications').select('id, app_number, project_id, current_payment_due, period_to, created_at')
        .eq('tenant_id', user.tenantId).eq('status', 'draft')
        .order('created_at', { ascending: false }).limit(10),

      // Projects active / prevailing wage
      db.from('projects').select('id, name, percent_complete, phase, contract_value, alert_count, city, state')
        .eq('tenant_id', user.tenantId).eq('status', 'active')
        .order('created_at', { ascending: false }),
      db.from('projects').select('id', { count: 'exact', head: true })
        .eq('tenant_id', user.tenantId).eq('status', 'active').eq('prevailing_wage', true),
    ]);

    // COI list for the panel
    const { data: coiList } = await db
      .from('subcontractor_insurance')
      .select('id, subcontractor_name, expiry_date, coverage_type')
      .eq('tenant_id', user.tenantId)
      .order('expiry_date', { ascending: true })
      .limit(10);

    // Open RFIs list
    const { data: openRfiList } = await db
      .from('rfis')
      .select('id, rfi_number, subject, due_date, project_id, priority, status')
      .eq('tenant_id', user.tenantId)
      .eq('status', 'open')
      .order('due_date', { ascending: true })
      .limit(8);

    const coPendingAmount = (cosPending.data || []).reduce(
      (sum, c) => sum + Number((c as { amount: number }).amount || 0), 0,
    );

    const closeoutByCategory: Record<string, number> = {};
    for (const c of closeoutOpen.data || []) {
      const cat = (c as { category?: string }).category || 'other';
      closeoutByCategory[cat] = (closeoutByCategory[cat] || 0) + 1;
    }

    return NextResponse.json({
      alerts: {
        coi_expired: coiExpired.count || 0,
        coi_expiring_30d: coiExpiring.count || 0,
        lien_waivers_pending: lwPending.count || 0,
        lien_waivers_expiring_30d: lwExpiring.count || 0,
        lien_waivers_expired: lwExpired.count || 0,
        rfis_open: rfisOpen.count || 0,
        rfis_overdue: rfisOverdue.count || 0,
        cos_pending_count: cosPending.data?.length || 0,
        cos_pending_amount: coPendingAmount,
        closeout_items_open: closeoutOpen.data?.length || 0,
        pay_apps_draft: payAppsDraft.data?.length || 0,
        projects_active: projectsActive.data?.length || 0,
        projects_prevailing: projectsPrevailing.count || 0,
      },
      coi_list: coiList || [],
      open_rfi_list: openRfiList || [],
      draft_pay_apps: payAppsDraft.data || [],
      pending_cos: cosPending.data || [],
      closeout_by_category: closeoutByCategory,
      active_projects: projectsActive.data || [],
      fetched_at: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
