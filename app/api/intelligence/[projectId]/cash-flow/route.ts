import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId } = await params;
  const db = createServerClient();

  try {
    const { data, error } = await db
      .from('cash_flow_projections')
      .select('*')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .order('month_index', { ascending: true });

    if (error) throw error;

    // If no projections exist, generate from budget + pay apps
    if (!data || data.length === 0) {
      const [budgetRes, payAppRes, projectRes] = await Promise.all([
        db.from('budget_items').select('budget_amount, actual_cost, committed_cost').eq('project_id', projectId).eq('tenant_id', user.tenantId),
        db.from('pay_applications').select('*').eq('project_id', projectId).eq('tenant_id', user.tenantId).order('period_to', { ascending: true }),
        db.from('projects').select('start_date, end_date, contract_value').eq('id', projectId).eq('tenant_id', user.tenantId).single(),
      ]);

      const budget = budgetRes.data || [];
      const payApps = payAppRes.data || [];
      const project = projectRes.data;

      const totalBudget = budget.reduce((s: number, b: any) => s + (Number(b.budget_amount) || 0), 0);
      const totalActual = budget.reduce((s: number, b: any) => s + (Number(b.actual_cost) || 0), 0);
      const contractValue = Number(project?.contract_value) || totalBudget * 1.15;

      // Generate 6-month projection
      const months: any[] = [];
      const now = new Date();
      let cumRevenue = payApps.reduce((s: number, p: any) => s + (Number(p.current_payment_due) || 0), 0);
      let cumCost = totalActual;
      const monthlyBurn = totalBudget > 0 ? totalBudget / 12 : 50000;
      const monthlyRevenue = contractValue > 0 ? contractValue / 12 : 60000;

      for (let i = 0; i < 6; i++) {
        const monthDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const label = monthDate.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        const isHistorical = i === 0;

        const projRevenue = isHistorical ? cumRevenue : monthlyRevenue;
        const projCost = isHistorical ? cumCost : monthlyBurn;
        cumRevenue += isHistorical ? 0 : monthlyRevenue;
        cumCost += isHistorical ? 0 : monthlyBurn;

        months.push({
          month_label: label,
          month_index: i,
          projected_revenue: Math.round(projRevenue),
          projected_cost: Math.round(projCost),
          actual_revenue: isHistorical ? Math.round(cumRevenue) : 0,
          actual_cost: isHistorical ? Math.round(totalActual) : 0,
          cumulative_revenue: Math.round(cumRevenue),
          cumulative_cost: Math.round(cumCost),
          net_cash_flow: Math.round(cumRevenue - cumCost),
        });
      }

      return NextResponse.json({ data: months, generated: true });
    }

    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId } = await params;
  const db = createServerClient();
  const body = await req.json();
  const { projections } = body;

  if (!projections || !Array.isArray(projections)) {
    return NextResponse.json({ error: 'Missing required field: projections' }, { status: 400 });
  }

  try {
    // Delete existing
    await db.from('cash_flow_projections')
      .delete()
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId);

    // Insert new
    const rows = projections.map((p: any, i: number) => ({
      tenant_id: user.tenantId,
      project_id: projectId,
      month_label: p.month_label,
      month_index: i,
      projected_revenue: p.projected_revenue || 0,
      projected_cost: p.projected_cost || 0,
      actual_revenue: p.actual_revenue || 0,
      actual_cost: p.actual_cost || 0,
      cumulative_revenue: p.cumulative_revenue || 0,
      cumulative_cost: p.cumulative_cost || 0,
      net_cash_flow: p.net_cash_flow || 0,
      created_by: user.id,
    }));

    const { data, error } = await db.from('cash_flow_projections').insert(rows).select();
    if (error) throw error;

    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}
