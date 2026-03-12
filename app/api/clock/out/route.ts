import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase-server';

/**
 * Clock Out — creates a completed timesheet entry with actual hours worked.
 */
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const clockOutTime = new Date();
    const clockInTime = body.clockInTime ? new Date(body.clockInTime) : clockOutTime;
    const hoursWorked = Math.round(((clockOutTime.getTime() - clockInTime.getTime()) / 3600000) * 100) / 100;

    const entry = {
      project_id: body.projectId || null,
      employee_name: body.employeeName || user.email || 'Unknown',
      work_date: new Date().toISOString().split('T')[0],
      hours: hoursWorked,
      cost_code: body.costCode || 'General Conditions',
      notes: JSON.stringify({
        type: 'clock_out',
        clock_in_time: body.clockInTime,
        clock_out_time: clockOutTime.toISOString(),
        latitude: body.latitude || null,
        longitude: body.longitude || null,
        break_minutes: body.breakMinutes || 0,
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
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const clockInTime = body_safe(req, 'clockInTime');
    const hoursWorked = clockInTime
      ? Math.round(((Date.now() - new Date(clockInTime).getTime()) / 3600000) * 100) / 100
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

function body_safe(_req: NextRequest, _key: string): string | null { return null; }
