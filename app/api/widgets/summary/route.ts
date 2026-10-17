import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { addDays, requestDay, startOfDayIn } from '@/lib/time-zone';
import { apiError } from '@/lib/api-error';
import { liveJobs, notOnHiddenJobs } from '@/lib/live-jobs';
import { jobsOffFor } from '@/lib/visible-jobs';
import { receivableOnly } from '@/lib/invoice-direction';

/**
 * GET /api/widgets/summary
 * Returns compact widget data for iOS/Android home screen widgets + Apple Watch.
 * Designed for quick polling (< 500ms response time).
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = createServerClient();
    const projectId = req.nextUrl.searchParams.get('projectId');

    // Get active project count
    const { count: projectCount } = await liveJobs(db
      .from('projects')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', user.tenantId)
      .eq('status', 'active'));

    // Everything below leaves out paper on archived or deleted jobs.
    const hidden = await jobsOffFor(db, user);
    const live = <Q extends { or(f: string): Q }>(q: Q) => notOnHiddenJobs(q, hidden);

    // Get today's stats
    // The company's day (device, else company zone); "logged today" runs from its local midnight.
    const { today, zone } = await requestDay(req.headers, db, user.tenantId, 'widgets/summary');

    // Open RFIs
    const { count: openRfis } = await live(db
      .from('rfis')
      .select('*', { count: 'exact', head: true }))
      .eq('tenant_id', user.tenantId)
      .in('status', ['open', 'pending']);

    // Open punch items
    const { count: openPunch } = await live(db
      .from('punch_list')
      .select('*', { count: 'exact', head: true }))
      .eq('tenant_id', user.tenantId)
      .eq('status', 'open');

    // Pending change orders
    const { count: pendingCOs } = await live(db
      .from('change_orders')
      .select('*', { count: 'exact', head: true }))
      .eq('tenant_id', user.tenantId)
      .eq('status', 'pending');

    // Pending invoices
    const { count: pendingInvoices } = await live(receivableOnly(db
      .from('invoices')
      .select('*', { count: 'exact', head: true })))
      .eq('tenant_id', user.tenantId)
      .in('status', ['draft', 'sent']);

    // Unread notifications
    const { count: unreadNotifs } = await db
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', user.tenantId)
      .eq('read', false);

    // Today's daily logs
    const { count: todayLogs } = await live(db
      .from('daily_logs')
      .select('*', { count: 'exact', head: true }))
      .eq('tenant_id', user.tenantId)
      .gte('created_at', startOfDayIn(zone, today).toISOString());

    // Expiring insurance (next 30 days)
    const thirtyDays = addDays(today, 30);
    const { count: expiringInsurance } = await live(db
      .from('insurance_certificates')
      .select('*', { count: 'exact', head: true }))
      .eq('tenant_id', user.tenantId)
      .lte('expiry_date', thirtyDays)
      .gte('expiry_date', today);

    // Open alerts
    const { count: openAlerts } = await db
      .from('network_alerts')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', user.tenantId)
      .eq('resolved', false);

    // Weather (cached from last field app visit)
    let weather = null;
    if (projectId) {
      const { data: project } = await db
        .from('projects')
        .select('city, state')
        .eq('id', projectId)
        .single();
      if (project) {
        weather = { city: project.city, state: project.state };
      }
    }

    // Compute health score (0-100)
    const issues = (openRfis || 0) + (openPunch || 0) + (pendingCOs || 0) + (expiringInsurance || 0);
    const healthScore = Math.max(0, Math.min(100, 100 - issues * 3));

    return NextResponse.json({
      // Core metrics
      activeProjects: projectCount || 0,
      healthScore,

      // Action items
      openRfis: openRfis || 0,
      openPunchItems: openPunch || 0,
      pendingChangeOrders: pendingCOs || 0,
      pendingInvoices: pendingInvoices || 0,
      unreadNotifications: unreadNotifs || 0,

      // Today
      todayDailyLogs: todayLogs || 0,

      // Compliance
      expiringInsurance: expiringInsurance || 0,
      openAlerts: openAlerts || 0,

      // Context
      weather,
      lastUpdated: new Date().toISOString(),

      // Quick actions (deep links for widget buttons)
      actions: [
        { label: 'Daily Log', url: '/app/daily-logs', icon: 'doc' },
        { label: 'Take Photo', url: '/app/projects', icon: 'camera' },
        { label: 'Clock In', url: '/app/time', icon: 'clock' },
        { label: 'Punch List', url: '/app/my-work', icon: 'check' },
      ],
    });
  } catch (e) {
    return apiError('widgets/summary GET', e);
  }
}
