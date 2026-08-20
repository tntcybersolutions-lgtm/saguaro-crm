import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('project_id');

    if (!projectId) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 });
    }

    const db = createServerClient();

    // Fetch project, budget, cost codes, and schedule data
    const [projectRes, costCodesRes, phasesRes, changeOrdersRes] = await Promise.all([
      db.from('projects')
        .select('name, start_date, end_date, contract_amount, status')
        .eq('id', projectId)
        .eq('tenant_id', user.tenantId)
        .single(),
      db.from('cost_codes')
        .select('*')
        .eq('project_id', projectId)
        .eq('tenant_id', user.tenantId),
      db.from('schedule_phases')
        .select('name, phase_name, percent_complete, start_date, end_date')
        .eq('project_id', projectId)
        .eq('tenant_id', user.tenantId),
      db.from('change_orders')
        .select('amount, status, title')
        .eq('project_id', projectId)
        .eq('tenant_id', user.tenantId)
        .in('status', ['approved', 'pending']),
    ]);

    const project = projectRes.data;
    const costCodes = costCodesRes.data || [];
    const phases = phasesRes.data || [];
    const changeOrders = changeOrdersRes.data || [];

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const today = new Date();
    const projectStart = new Date(project.start_date || today);
    const projectEnd = new Date(project.end_date || today);
    const totalDuration = Math.max(1, (projectEnd.getTime() - projectStart.getTime()) / (1000 * 60 * 60 * 24));
    const elapsed = Math.max(0, (today.getTime() - projectStart.getTime()) / (1000 * 60 * 60 * 24));
    const schedulePace = Math.min(100, (elapsed / totalDuration) * 100);

    // Average schedule completion
    const avgScheduleComplete = phases.length > 0
      ? phases.reduce((sum: number, p: any) => sum + (p.percent_complete || 0), 0) / phases.length
      : 0;

    // Budget analysis per cost code / division
    const totalBudget = project.contract_amount || costCodes.reduce((sum: number, c: any) => sum + (c.budget_amount || 0), 0);
    const totalSpent = costCodes.reduce((sum: number, c: any) => sum + (c.actual_amount || c.spent || 0), 0);
    const budgetBurnRate = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

    const approvedCOs = changeOrders.filter((co: any) => co.status === 'approved')
      .reduce((sum: number, co: any) => sum + (co.amount || 0), 0);
    const pendingCOs = changeOrders.filter((co: any) => co.status === 'pending')
      .reduce((sum: number, co: any) => sum + (co.amount || 0), 0);

    // Identify overspending divisions
    const divisionAnalysis = costCodes.map((cc: any) => {
      const budget = cc.budget_amount || 0;
      const spent = cc.actual_amount || cc.spent || 0;
      const percentUsed = budget > 0 ? (spent / budget) * 100 : 0;
      const overBudget = percentUsed > schedulePace + 10;

      return {
        code: cc.code || cc.cost_code,
        name: cc.name || cc.description,
        division: cc.division || null,
        budget,
        spent,
        remaining: budget - spent,
        percent_used: Math.round(percentUsed * 10) / 10,
        over_budget: overBudget,
        variance: Math.round((percentUsed - schedulePace) * 10) / 10,
      };
    });

    const overspending = divisionAnalysis.filter((d: any) => d.over_budget);

    const warnings: string[] = [];
    if (budgetBurnRate > schedulePace + 15) {
      warnings.push(`Budget burn rate (${Math.round(budgetBurnRate)}%) significantly exceeds schedule pace (${Math.round(schedulePace)}%)`);
    }
    if (overspending.length > 0) {
      warnings.push(`${overspending.length} cost code(s) are overspending relative to schedule pace`);
    }
    if (pendingCOs > 0) {
      warnings.push(`$${pendingCOs.toLocaleString()} in pending change orders not yet reflected in budget`);
    }
    if (budgetBurnRate > 90 && avgScheduleComplete < 80) {
      warnings.push('Critical: Budget nearly exhausted but project is not near completion');
    }

    return NextResponse.json({
      project: project.name,
      summary: {
        total_budget: totalBudget,
        total_spent: totalSpent,
        remaining: totalBudget - totalSpent,
        budget_burn_rate: Math.round(budgetBurnRate * 10) / 10,
        schedule_pace: Math.round(schedulePace * 10) / 10,
        avg_schedule_complete: Math.round(avgScheduleComplete * 10) / 10,
        approved_change_orders: approvedCOs,
        pending_change_orders: pendingCOs,
      },
      overspending_divisions: overspending,
      all_divisions: divisionAnalysis,
      warnings,
      risk_level: warnings.length === 0 ? 'low' : warnings.length <= 2 ? 'medium' : 'high',
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}
