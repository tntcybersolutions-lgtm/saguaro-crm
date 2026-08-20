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
  const url = new URL(req.url);
  const week = url.searchParams.get('week');

  if (!week) return NextResponse.json({ error: 'Missing required query: week (YYYY-MM-DD)' }, { status: 400 });

  const db = createServerClient();

  try {
    const weekStart = new Date(week);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const { data: entries, error } = await db
      .from('time_entries')
      .select('*, employees!inner(full_name, employee_number), cost_codes(code, description)')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .gte('work_date', weekStart.toISOString().split('T')[0])
      .lte('work_date', weekEnd.toISOString().split('T')[0])
      .order('work_date')
      .order('employees(full_name)');

    if (error) throw error;

    // Build CSV
    const headers = [
      'Employee', 'Employee ID', 'Date', 'Regular Hours', 'OT Hours', 'DT Hours',
      'Total Hours', 'Cost Code', 'Description', 'Regular Rate', 'OT Rate', 'Total Cost', 'Status',
    ];

    const rows = (entries || []).map((e: any) => [
      (e.employees as any)?.full_name || '',
      (e.employees as any)?.employee_number || '',
      e.work_date,
      e.regular_hours || 0,
      e.overtime_hours || 0,
      e.doubletime_hours || 0,
      e.total_hours || 0,
      (e.cost_codes as any)?.code || '',
      e.cost_code_description || '',
      e.regular_rate_used || 0,
      e.overtime_rate_used || 0,
      e.labor_cost || 0,
      e.status,
    ]);

    const csv = [headers.join(','), ...rows.map((r: any[]) =>
      r.map((v: any) => typeof v === 'string' && v.includes(',') ? `"${v}"` : v).join(',')
    )].join('\n');

    const filename = `payroll-${week}.csv`;

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}
