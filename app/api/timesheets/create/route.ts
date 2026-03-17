import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body */ }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const row = {
      tenant_id:     user.tenantId,
      project_id:    body.project_id    || body.projectId    || null,
      employee_name: (body.employee_name || body.employeeName || user.email || 'Unknown') as string,
      work_date:     body.work_date     || body.workDate     || new Date().toISOString().split('T')[0],
      hours:         Number(body.hours) || 0,
      cost_code:     (body.cost_code     || body.costCode     || 'General Conditions') as string,
      notes:         (body.notes         || '') as string,
    };

    const { data, error } = await supabase
      .from('timesheet_entries')
      .insert(row)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, entry: data });
  } catch (err: unknown) {
    const msg = 'Internal server error';
    console.error('[timesheets/create] error:', msg);
    return NextResponse.json(
      { error: `[timesheets/create] Database error: ${msg}` },
      { status: 500 }
    );
  }
}
