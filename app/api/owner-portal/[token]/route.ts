import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

// PUBLIC route — token IS the auth
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = createServerClient();

  try {
    // Look up token
    const { data: tokenData, error: tokenErr } = await db
      .from('owner_portal_tokens')
      .select('*')
      .eq('token', token)
      .eq('is_active', true)
      .single();

    if (tokenErr || !tokenData) {
      return NextResponse.json({ error: 'Invalid or expired portal link' }, { status: 404 });
    }

    // Check expiry
    if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Portal link has expired' }, { status: 401 });
    }

    const projectId = tokenData.project_id;
    const tenantId = tokenData.tenant_id;

    // Update last accessed
    await db.from('owner_portal_tokens')
      .update({ last_accessed_at: new Date().toISOString() })
      .eq('id', tokenData.id);

    // Load project data
    const [projectRes, budgetRes, scheduleRes, photosRes, payAppsRes, punchRes, logsRes] = await Promise.all([
      db.from('projects').select('*').eq('id', projectId).eq('tenant_id', tenantId).single(),
      db.from('budget_items').select('budget_amount, actual_cost, committed_cost').eq('project_id', projectId).eq('tenant_id', tenantId),
      db.from('schedule_items').select('*').eq('project_id', projectId).eq('tenant_id', tenantId),
      db.from('project_photos').select('id, photo_url, caption, created_at').eq('project_id', projectId).eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(12),
      db.from('pay_applications').select('*').eq('project_id', projectId).eq('tenant_id', tenantId).order('created_at', { ascending: false }),
      db.from('punch_list').select('id, status').eq('project_id', projectId).eq('tenant_id', tenantId),
      db.from('daily_logs').select('id, log_date, weather, summary').eq('project_id', projectId).eq('tenant_id', tenantId).order('log_date', { ascending: false }).limit(5),
    ]);

    const project = projectRes.data;
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const budget = budgetRes.data || [];
    const schedule = scheduleRes.data || [];
    const photos = photosRes.data || [];
    const payApps = payAppsRes.data || [];
    const punchItems = punchRes.data || [];
    const logs = logsRes.data || [];

    const totalBudget = budget.reduce((s: number, b: any) => s + (Number(b.budget_amount) || 0), 0);
    const totalActual = budget.reduce((s: number, b: any) => s + (Number(b.actual_cost) || 0), 0);
    const totalSchedule = schedule.length || 1;
    const completedSchedule = schedule.filter((s: any) => s.status === 'completed' || s.pct_complete >= 100).length;
    const scheduleProgress = Math.round((completedSchedule / totalSchedule) * 100);

    const totalBilled = payApps.reduce((s: number, p: any) => s + (Number(p.current_payment_due) || 0), 0);
    const totalPaid = payApps.filter((p: any) => p.status === 'paid').reduce((s: number, p: any) => s + (Number(p.current_payment_due) || 0), 0);

    const healthScore = Math.round(
      (scheduleProgress * 0.3) +
      (Math.max(0, Math.min(100, totalBudget > 0 ? ((totalBudget - totalActual) / totalBudget) * 100 + 50 : 75)) * 0.3) +
      (punchItems.length > 0 ? (punchItems.filter((p: any) => p.status === 'closed' || p.status === 'verified').length / punchItems.length * 100) * 0.2 : 80 * 0.2) +
      (20)
    );

    return NextResponse.json({
      project: {
        name: project.name,
        address: project.address,
        status: project.status,
        start_date: project.start_date,
        end_date: project.end_date,
      },
      owner: {
        name: tokenData.owner_name,
        company: tokenData.owner_company,
      },
      healthScore: Math.min(100, healthScore),
      schedule: {
        progress: scheduleProgress,
        total: totalSchedule,
        completed: completedSchedule,
      },
      budget: {
        contractValue: totalBudget,
        billedPct: totalBudget > 0 ? Math.round((totalBilled / totalBudget) * 100) : 0,
        paidPct: totalBudget > 0 ? Math.round((totalPaid / totalBudget) * 100) : 0,
        totalBilled,
        totalPaid,
      },
      photos,
      payApps: payApps.slice(0, 5).map((p: any) => ({
        id: p.id,
        number: p.pay_app_number || p.number,
        period: p.period_to,
        amount: p.current_payment_due,
        status: p.status,
      })),
      recentActivity: logs.map((l: any) => ({
        date: l.log_date,
        summary: l.summary || 'Daily log recorded',
        weather: l.weather,
      })),
      punchSummary: {
        total: punchItems.length,
        closed: punchItems.filter((p: any) => p.status === 'closed' || p.status === 'verified').length,
        open: punchItems.filter((p: any) => p.status === 'open').length,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}
