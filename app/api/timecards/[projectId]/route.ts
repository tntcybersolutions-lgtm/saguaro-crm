import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId } = await params;
  const db = createServerClient();
  const url = new URL(req.url);
  const date = url.searchParams.get('date');
  const employeeId = url.searchParams.get('employeeId');
  const week = url.searchParams.get('week');

  try {
    let query = db
      .from('time_entries')
      .select('*, employees!inner(full_name, title, trade, regular_rate), cost_codes(code, description)')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId);

    if (date) {
      query = query.eq('work_date', date);
    } else if (week) {
      const weekStart = new Date(week);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      query = query.gte('work_date', weekStart.toISOString().split('T')[0])
        .lte('work_date', weekEnd.toISOString().split('T')[0]);
    }

    if (employeeId) {
      query = query.eq('employee_id', employeeId);
    }

    const { data: entries, error } = await query.order('work_date', { ascending: false });
    if (error) throw error;

    // Build summary
    let totalRegular = 0, totalOT = 0, totalCost = 0;
    const byEmployee: Record<string, { name: string; hours: number; cost: number }> = {};
    const byCostCode: Record<string, { description: string; hours: number; cost: number }> = {};

    for (const e of entries || []) {
      const reg = Number(e.regular_hours || 0);
      const ot = Number(e.overtime_hours || 0);
      const dt = Number(e.doubletime_hours || 0);
      const hours = reg + ot + dt;
      const cost = Number(e.labor_cost || 0);
      totalRegular += reg;
      totalOT += ot;
      totalCost += cost;

      const empName = (e.employees as any)?.full_name || 'Unknown';
      if (!byEmployee[e.employee_id]) byEmployee[e.employee_id] = { name: empName, hours: 0, cost: 0 };
      byEmployee[e.employee_id].hours += hours;
      byEmployee[e.employee_id].cost += cost;

      const ccKey = e.cost_code_id || 'none';
      const ccDesc = (e.cost_codes as any)?.description || e.cost_code_description || 'Unassigned';
      if (!byCostCode[ccKey]) byCostCode[ccKey] = { description: ccDesc, hours: 0, cost: 0 };
      byCostCode[ccKey].hours += hours;
      byCostCode[ccKey].cost += cost;
    }

    return NextResponse.json({
      entries: entries || [],
      summary: {
        total_regular_hours: totalRegular,
        total_overtime_hours: totalOT,
        total_labor_cost: totalCost,
        entries_count: (entries || []).length,
        by_employee: byEmployee,
        by_cost_code: byCostCode,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId } = await params;
  const body = await req.json();

  if (!body.work_date) return NextResponse.json({ error: 'Missing required field: work_date' }, { status: 400 });
  if (!body.entries || !Array.isArray(body.entries) || body.entries.length === 0) {
    return NextResponse.json({ error: 'Missing required field: entries' }, { status: 400 });
  }

  const db = createServerClient();

  try {
    const rows = [];
    for (const entry of body.entries) {
      if (!entry.employee_id) continue;

      // Load employee rates
      const { data: emp } = await db
        .from('employees')
        .select('regular_rate, overtime_rate, doubletime_rate')
        .eq('id', entry.employee_id)
        .eq('tenant_id', user.tenantId)
        .single();

      const regRate = Number(emp?.regular_rate || 0);
      const otRate = emp?.overtime_rate ? Number(emp.overtime_rate) : regRate * 1.5;
      const dtRate = emp?.doubletime_rate ? Number(emp.doubletime_rate) : regRate * 2;

      // Load cost code description if provided
      let ccDesc = entry.cost_code_description || '';
      let csiDiv = entry.csi_division || '';
      if (entry.cost_code_id) {
        const { data: cc } = await db
          .from('cost_codes')
          .select('description, csi_division')
          .eq('id', entry.cost_code_id)
          .eq('tenant_id', user.tenantId)
          .single();
        ccDesc = cc?.description || ccDesc;
        csiDiv = cc?.csi_division || csiDiv;
      }

      rows.push({
        project_id: projectId,
        tenant_id: user.tenantId,
        employee_id: entry.employee_id,
        work_date: body.work_date,
        regular_hours: Number(entry.regular_hours || 0),
        overtime_hours: Number(entry.overtime_hours || 0),
        doubletime_hours: Number(entry.doubletime_hours || 0),
        cost_code_id: entry.cost_code_id || null,
        csi_division: csiDiv,
        cost_code_description: ccDesc,
        regular_rate_used: regRate,
        overtime_rate_used: otRate,
        doubletime_rate_used: dtRate,
        work_description: entry.work_description || null,
        status: 'pending',
        created_by: user.id,
      });
    }

    const { data: inserted, error } = await db
      .from('time_entries')
      .insert(rows)
      .select();

    if (error) throw error;

    return NextResponse.json({ entries: inserted, count: inserted?.length || 0 }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}
