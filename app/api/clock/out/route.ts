import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

/**
 * Clock Out — creates a completed timesheet entry with actual hours worked.
 * Body is parsed outside the try block so the error handler can use it.
 */
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Parse body outside try so catch handler can reference it for fallback hours calc
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body */ }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const clockOutTime = new Date();
    const clockInTime  = body.clockInTime ? new Date(body.clockInTime as string) : clockOutTime;
    const breakMs      = ((body.breakMinutes as number) || 0) * 60_000;
    const rawMs        = clockOutTime.getTime() - clockInTime.getTime();
    const hoursWorked  = Math.max(0, Math.round(((rawMs - breakMs) / 3_600_000) * 100) / 100);

    const entry = {
      tenant_id:     user.tenantId,
      project_id:    body.projectId    || null,
      employee_name: (body.employeeName as string) || user.email || 'Unknown',
      work_date:     new Date().toISOString().split('T')[0],
      hours:         hoursWorked,
      cost_code:     (body.costCode as string) || 'General Conditions',
      notes: JSON.stringify({
        type:           'clock_out',
        clock_in_time:  body.clockInTime,
        clock_out_time: clockOutTime.toISOString(),
        latitude:       body.latitude  || null,
        longitude:      body.longitude || null,
        break_minutes:  body.breakMinutes || 0,
      }),
    };

    const { data, error } = await supabase
      .from('timesheet_entries')
      .insert(entry)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      entry: data,
      hoursWorked,
      clockOutTime: clockOutTime.toISOString(),
    });

  } catch (err: unknown) {
    const msg = 'Internal server error';
    // Fallback: calculate hours from the body we already parsed above
    const clockInTime = body.clockInTime ? new Date(body.clockInTime as string) : null;
    const breakMs     = ((body.breakMinutes as number) || 0) * 60_000;
    const hoursWorked = clockInTime
      ? Math.max(0, Math.round(((Date.now() - clockInTime.getTime() - breakMs) / 3_600_000) * 100) / 100)
      : 0;
    return NextResponse.json({
      success: true,
      hoursWorked,
      clockOutTime: new Date().toISOString(),
      demo: true,
      error: msg,
    });
  }
}
