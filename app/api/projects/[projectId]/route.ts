import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = createServerClient();
    const [
      { data: project },
      { data: subs },
      { data: payApps },
      { data: changeOrders },
      { data: rfis },
      { data: team },
      { data: budgetLines },
      { data: punchItems },
      { data: schedulePhases },
      { data: alerts },
    ] = await Promise.all([
      db.from('projects').select('*').eq('id', projectId).eq('tenant_id', user.tenantId).single(),
      db.from('subcontractors').select('*').eq('project_id', projectId).eq('tenant_id', user.tenantId).order('created_at', { ascending: false }),
      db.from('pay_applications').select('*').eq('project_id', projectId).eq('tenant_id', user.tenantId).order('application_number', { ascending: false }),
      db.from('change_orders').select('*').eq('project_id', projectId).eq('tenant_id', user.tenantId).order('created_at', { ascending: false }),
      db.from('rfis').select('*').eq('project_id', projectId).eq('tenant_id', user.tenantId).order('created_at', { ascending: false }),
      db.from('project_team').select('*').eq('project_id', projectId),
      db.from('budget_lines').select('*').eq('project_id', projectId).eq('tenant_id', user.tenantId).order('cost_code', { ascending: true }),
      db.from('punch_list_items').select('id, status').eq('project_id', projectId).eq('tenant_id', user.tenantId),
      db.from('schedule_phases').select('*').eq('project_id', projectId).eq('tenant_id', user.tenantId).order('planned_start', { ascending: true }),
      db.from('autopilot_alerts').select('id, alert_type, severity, message, status, created_at').eq('project_id', projectId).eq('tenant_id', user.tenantId).eq('status', 'open').order('created_at', { ascending: false }).limit(10),
    ]);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const cos = (changeOrders || []) as any[];
    const apps = (payApps || []) as any[];
    const lines = (budgetLines || []) as any[];
    const punch = (punchItems || []) as any[];
    const p = project as any;

    const approvedCOs = cos.filter((c: any) => c.status === 'approved');
    const contractSumToDate = (p.contract_amount || 0) + approvedCOs.reduce((s: number, co: any) => s + (co.cost_impact || 0), 0);
    const totalBilledToDate = apps.length > 0 ? (apps[0].total_completed_and_stored || 0) : 0;

    // Budget health aggregates
    const budgetHealth = {
      originalBudget: lines.reduce((s: number, l: any) => s + (l.original_budget || 0), 0),
      committedCost: lines.reduce((s: number, l: any) => s + (l.committed_cost || 0), 0),
      actualCost: lines.reduce((s: number, l: any) => s + (l.actual_cost || 0), 0),
      forecastCost: lines.reduce((s: number, l: any) => s + (l.forecast_cost || l.original_budget || 0), 0),
      lineCount: lines.length,
    };

    // Punch list summary
    const punchSummary = {
      total: punch.length,
      open: punch.filter((i: any) => i.status === 'open').length,
      complete: punch.filter((i: any) => i.status === 'complete' || i.status === 'closed').length,
    };

    return NextResponse.json({
      project: { ...p, contractSumToDate, totalBilledToDate },
      subs: subs || [],
      payApps: apps,
      changeOrders: cos,
      rfis: rfis || [],
      team: team || [],
      budgetLines: lines,
      budgetHealth,
      punchSummary,
      schedulePhases: schedulePhases || [],
      alerts: (alerts || []).map((a: any) => ({ ...a, title: a.alert_type || a.title })),
    });
  } catch {
    return NextResponse.json({ error: 'Failed to load project' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const db = createServerClient();
    const { data, error } = await db.from('projects').update(body).eq('id', projectId).eq('tenant_id', user.tenantId).select().single();
    if (error) throw error;
    return NextResponse.json({ project: data });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
