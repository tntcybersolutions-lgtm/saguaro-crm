import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { getEffectivePermissions, hasPermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { addDays, requestDay } from '@/lib/time-zone';

/* THE RAIL HID FINANCIAL; THIS ROUTE STILL HANDED IT OVER.
   Every module is guarded and the navigation now renders only the categories a
   person holds — and this endpoint answered every logged-in user with the
   company's total contract value, its monthly revenue, the pay applications in
   flight and the open RFIs. A salesperson with Pay Apps: None could not reach
   /app/billing, and read the count of what was in it off the dashboard on the
   way past.

   Permission decides the QUERY, not the presentation: a figure nobody may see
   is never read out of the database, so there is nothing to leak through a
   payload, a cache or a log.

   Absent, never zero. Returning 0 for a withheld number is a lie that reads as
   a fact — "Total Contract Value $0" on a company running eight jobs. The field
   is omitted, and the dashboard drops the tile rather than drawing a figure
   that is not true. A real 0 still renders, because that is an answer. */
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = createServerClient();
    const tenantId = user.tenantId;

    const perms = await getEffectivePermissions(db, user.id, tenantId);
    // "Expiring within 30 days" from the company's day (device, else company zone).
    const in30 = addDays((await requestDay(req.headers, db, tenantId, 'dashboard/stats')).today, 30);
    const canMoney   = hasPermission(perms, 'Budget', 'View');
    const canPayApps = hasPermission(perms, 'Pay Apps', 'View');
    const canRFIs    = hasPermission(perms, 'RFIs', 'View');

    const HEAD = { count: 'exact' as const, head: true };

    const [
      { count: activeProjects },
      { count: openBids },
      payApps,
      contracts,
      rfis,
      { count: expiringInsurance },
    ] = await Promise.all([
      db.from('projects').select('*', HEAD).eq('tenant_id', tenantId).eq('status', 'active'),
      db.from('bid_packages').select('*', HEAD).eq('tenant_id', tenantId).eq('status', 'open'),
      canPayApps
        ? db.from('pay_applications').select('*', HEAD).eq('tenant_id', tenantId).in('status', ['submitted', 'approved'])
        : null,
      canMoney
        ? db.from('projects').select('contract_value').eq('tenant_id', tenantId).eq('status', 'active')
        : null,
      canRFIs
        ? db.from('rfis').select('*', HEAD).eq('tenant_id', tenantId).eq('status', 'open')
        : null,
      db.from('subcontractor_insurance').select('*', HEAD).eq('tenant_id', tenantId)
        .lte('expiry_date', in30),
    ]);

    const totalContractValue = canMoney
      ? (contracts?.data || []).reduce((s: number, p: any) => s + (p.contract_value || 0), 0)
      : undefined;

    return NextResponse.json({
      stats: {
        activeProjects: activeProjects || 0,
        openBids: openBids || 0,
        expiringInsurance: expiringInsurance || 0,
        ...(canPayApps ? { pendingPayApps: payApps?.count || 0 } : {}),
        ...(canRFIs ? { openRFIs: rfis?.count || 0 } : {}),
        ...(totalContractValue !== undefined
          ? { totalContractValue, monthlyRevenue: Math.round(totalContractValue / 12) }
          : {}),
      },
      source: 'live',
    });
  } catch (e) {
    /* Was: `catch { return { stats: ZERO_STATS } }` with a 200. A failed query
       came back as eight zeros and an OK, which the dashboard reads as a brand
       new account and answers with the getting-started rail — telling a GC with
       live jobs that they have none. An error is an error. */
    return apiError('dashboard_stats', e);
  }
}
