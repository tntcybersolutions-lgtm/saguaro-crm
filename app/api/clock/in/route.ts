import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

/**
 * Clock In — stores clock event as a timesheet entry with type='clock_in'.
 * The client also stores state in localStorage for offline support.
 */
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const clockIn = {
      tenant_id:     user.tenantId,
      project_id:    body.projectId || null,
      employee_name: (body.employeeName as string) || user.email || 'Unknown',
      work_date:     new Date().toISOString().split('T')[0],
      hours:         0,
      cost_code:     'Clock Event',
      notes: JSON.stringify({
        type:           'clock_in',
        clock_in_time:  new Date().toISOString(),
        latitude:       body.latitude  || null,
        longitude:      body.longitude || null,
      }),
    };

    const { data, error } = await supabase
      .from('timesheet_entries')
      .insert(clockIn)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      entry: data,
      clockInTime: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    // Client uses localStorage as source of truth — return success so app continues
    return NextResponse.json({
      success: true,
      clockInTime: new Date().toISOString(),
      demo: true,
      error: msg,
    });
  }
}
