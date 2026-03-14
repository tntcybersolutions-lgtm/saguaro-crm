import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

async function authenticateSubPortal(req: NextRequest) {
  const token =
    req.nextUrl.searchParams.get('token') ||
    req.headers.get('x-portal-token');
  if (!token) return null;

  const db = createServerClient();
  const { data: session } = await db
    .from('portal_sub_sessions')
    .select('*')
    .eq('token', token)
    .eq('status', 'active')
    .single();

  return session;
}

/** GET — List sub's daily logs */
export async function GET(req: NextRequest) {
  try {
    const session = await authenticateSubPortal(req);
    if (!session) {
      return NextResponse.json(
        { error: 'Invalid or expired portal token' },
        { status: 401 }
      );
    }

    const db = createServerClient();

    const date = req.nextUrl.searchParams.get('date');
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50', 10);

    let query = db
      .from('portal_sub_daily_logs')
      .select('*')
      .eq('sub_id', session.sub_id)
      .eq('project_id', session.project_id)
      .eq('tenant_id', session.tenant_id)
      .order('log_date', { ascending: false })
      .limit(limit);

    if (date) {
      query = query.eq('log_date', date);
    }

    const { data: logs, error } = await query;

    if (error) throw error;

    return NextResponse.json({ daily_logs: logs || [] });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/** POST — Create new daily log */
export async function POST(req: NextRequest) {
  try {
    const session = await authenticateSubPortal(req);
    if (!session) {
      return NextResponse.json(
        { error: 'Invalid or expired portal token' },
        { status: 401 }
      );
    }

    const db = createServerClient();
    const body = await req.json();
    const {
      log_date,
      crew_count,
      hours_worked,
      work_completed,
      work_planned,
      weather,
      delays,
      safety_incidents,
      photos,
      gps_clock_in,
      gps_clock_out,
      notes,
    } = body;

    if (!log_date) {
      return NextResponse.json(
        { error: 'log_date is required' },
        { status: 400 }
      );
    }

    const { data: log, error } = await db
      .from('portal_sub_daily_logs')
      .insert({
        sub_id: session.sub_id,
        project_id: session.project_id,
        tenant_id: session.tenant_id,
        log_date,
        crew_count: crew_count || 0,
        hours_worked: hours_worked || 0,
        work_completed: work_completed || null,
        work_planned: work_planned || null,
        weather: weather || null,
        delays: delays || null,
        safety_incidents: safety_incidents || null,
        photos: photos || [],
        gps_clock_in: gps_clock_in || null,
        gps_clock_out: gps_clock_out || null,
        notes: notes || null,
        status: 'submitted',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(
      { daily_log: log, message: 'Daily log created successfully' },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/** PATCH — Update existing daily log */
export async function PATCH(req: NextRequest) {
  try {
    const session = await authenticateSubPortal(req);
    if (!session) {
      return NextResponse.json(
        { error: 'Invalid or expired portal token' },
        { status: 401 }
      );
    }

    const db = createServerClient();
    const body = await req.json();
    const { log_id, ...updates } = body;

    if (!log_id) {
      return NextResponse.json(
        { error: 'log_id is required' },
        { status: 400 }
      );
    }

    // Verify log belongs to this sub
    const { data: existing } = await db
      .from('portal_sub_daily_logs')
      .select('id, status')
      .eq('id', log_id)
      .eq('sub_id', session.sub_id)
      .eq('tenant_id', session.tenant_id)
      .single();

    if (!existing) {
      return NextResponse.json(
        { error: 'Daily log not found' },
        { status: 404 }
      );
    }

    if (existing.status === 'approved') {
      return NextResponse.json(
        { error: 'Cannot edit an approved daily log' },
        { status: 400 }
      );
    }

    // Build safe update payload
    const allowed = [
      'crew_count', 'hours_worked', 'work_completed', 'work_planned',
      'weather', 'delays', 'safety_incidents', 'photos',
      'gps_clock_in', 'gps_clock_out', 'notes',
    ];
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    for (const key of allowed) {
      if (updates[key] !== undefined) updateData[key] = updates[key];
    }

    const { data: updated, error } = await db
      .from('portal_sub_daily_logs')
      .update(updateData)
      .eq('id', log_id)
      .eq('tenant_id', session.tenant_id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ daily_log: updated });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
