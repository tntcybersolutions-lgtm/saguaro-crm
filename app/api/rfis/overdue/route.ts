import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServerClient();
    const url = new URL(req.url);
    const projectId = url.searchParams.get('projectId');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);

    let query = db
      .from('rfis')
      .select('*, projects!inner(name, status, pm_name)')
      .eq('tenant_id', user.tenantId)
      .eq('is_overdue', true)
      .in('status', ['submitted', 'under_review'])
      .neq('projects.status', 'closed')
      .order('response_days_elapsed', { ascending: false })
      .limit(limit);

    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    const { data: overdueRfis, error } = await query;
    if (error) throw error;

    const rfis = (overdueRfis || []).map((r: any) => {
      const priorityMultiplier =
        r.priority === 'critical' ? 4 :
        r.priority === 'high' ? 3 :
        r.priority === 'normal' ? 2 : 1;
      return {
        ...r,
        project_name: r.projects?.name,
        project_pm: r.projects?.pm_name,
        urgency_score: (r.response_days_elapsed || 0) * priorityMultiplier,
      };
    }).sort((a: any, b: any) => b.urgency_score - a.urgency_score);

    // Build summary
    const total = rfis.length;
    const critical = rfis.filter((r: any) => r.priority === 'critical').length;
    const high = rfis.filter((r: any) => r.priority === 'high').length;
    const normal = total - critical - high;
    const maxDays = rfis.reduce((m: number, r: any) => Math.max(m, r.response_days_elapsed || 0), 0);
    const totalCostImpact = rfis.reduce((s: number, r: any) => s + (Number(r.cost_impact) > 0 ? Number(r.cost_impact) : 0), 0);
    const totalScheduleImpact = rfis.reduce((s: number, r: any) => s + (r.schedule_impact_days || 0), 0);
    const oldest = rfis.length > 0 ? {
      subject: rfis[0].subject,
      project_name: rfis[0].project_name,
      days_elapsed: rfis[0].response_days_elapsed,
      rfi_number: rfis[0].rfi_number,
    } : null;

    // Create notifications for overdue RFIs (deduped by today)
    const today = new Date().toISOString().split('T')[0];
    for (const rfi of rfis.slice(0, 10)) {
      const { data: existing } = await db
        .from('notifications')
        .select('id')
        .eq('tenant_id', user.tenantId)
        .eq('type', 'rfi_overdue')
        .contains('metadata', { rfi_id: rfi.id, date: today })
        .limit(1);

      if (!existing || existing.length === 0) {
        await db.from('notifications').insert({
          tenant_id: user.tenantId,
          type: 'rfi_overdue',
          title: `RFI ${rfi.rfi_number || ''} is ${rfi.response_days_elapsed} days overdue`,
          body: rfi.subject,
          link: `/app/projects/${rfi.project_id}/rfis`,
          project_id: rfi.project_id,
          priority: rfi.priority === 'critical' ? 'urgent' : 'normal',
          metadata: { rfi_id: rfi.id, date: today },
        });
      }
    }

    return NextResponse.json({
      rfis,
      summary: {
        total, critical, high, normal,
        max_days_overdue: maxDays,
        total_cost_impact: totalCostImpact,
        total_schedule_impact: totalScheduleImpact,
        oldest,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
