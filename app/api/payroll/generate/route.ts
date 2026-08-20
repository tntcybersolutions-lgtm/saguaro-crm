import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    if (!body.period_start || !body.period_end) {
      return NextResponse.json({ error: 'period_start and period_end are required' }, { status: 400 });
    }
    const db = createServerClient();
    const { data, error } = await db.from('payroll_periods').insert({
      tenant_id: user.tenantId,
      project_id: body.project_id || null,
      period_start: body.period_start,
      period_end: body.period_end,
      status: body.status || 'draft',
      total_hours: body.total_hours || 0,
      total_amount: body.total_amount || 0,
      created_by: user.id,
      notes: body.notes || '',
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, payrollPeriod: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
