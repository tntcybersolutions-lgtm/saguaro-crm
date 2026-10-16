import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { notOnRoster, subRecordScope } from '@/lib/sub-portal-scope';

async function authenticateSubPortal(req: NextRequest) {
  const token =
    req.nextUrl.searchParams.get('token') ||
    req.headers.get('x-portal-token');
  if (!token) return null;

  const db = createServerClient();
  const { data: session } = await db
    .from('portal_sub_sessions')
    .select('*')
    .eq('token', token).gt('expires_at', new Date().toISOString())
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

    // An email-only invite has no roster sub, so no log can belong to it (lib/sub-portal-scope).
    const scope = subRecordScope(session);
    if (!scope) return NextResponse.json({ daily_logs: [] });

    const db = createServerClient();

    const date = req.nextUrl.searchParams.get('date');
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50', 10);

    let query = db
      .from('portal_sub_daily_logs')
      .select('*')
      .eq('sub_id', scope.subId)
      .eq('project_id', scope.projectId)
      .eq('tenant_id', scope.tenantId)
      .order('log_date', { ascending: false })
      .limit(limit);

    if (date) {
      query = query.eq('log_date', date);
    }

    const { data: logs, error } = await query;

    if (error) throw error;

    return NextResponse.json({ daily_logs: logs || [] });
  } catch (err) {
    return apiError('portal/sub/daily-logs', err, "Couldn't load your daily logs.");
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

    const scope = subRecordScope(session);
    if (!scope) {
      const r = notOnRoster(session, 'a daily log');
      return NextResponse.json(r.body, { status: r.status });
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

    // Live portal_sub_daily_logs columns: log_date, crew_count, work_performed,
    // hours, materials_used, delays, notes, status, created_at. hours_worked ->
    // hours, work_completed -> work_performed. work_planned / weather /
    // safety_incidents / photos / gps_clock_in / gps_clock_out have no column (all
    // remaining columns are plain text with no jsonb to fold into), so the ones
    // without a home are appended into notes to avoid silent data loss.
    const extraNotes = [
      work_planned ? `Planned: ${work_planned}` : null,
      weather ? `Weather: ${weather}` : null,
      safety_incidents ? `Safety: ${safety_incidents}` : null,
      notes || null,
    ].filter(Boolean).join('\n');

    const { data: log, error } = await db
      .from('portal_sub_daily_logs')
      .insert({
        sub_id: scope.subId,
        project_id: scope.projectId,
        tenant_id: scope.tenantId,
        log_date,
        crew_count: crew_count || 0,
        hours: hours_worked || 0,
        work_performed: work_completed || null,
        delays: delays || null,
        notes: extraNotes || null,
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
  } catch (err) {
    return apiError('portal/sub/daily-logs', err, "Couldn't submit the daily log. Please try again.");
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

    const scope = subRecordScope(session);
    if (!scope) {
      const r = notOnRoster(session, 'a daily log');
      return NextResponse.json(r.body, { status: r.status });
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
      .eq('sub_id', scope.subId)
      .eq('tenant_id', scope.tenantId)
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

    // Build safe update payload. Only real portal_sub_daily_logs columns are
    // written; incoming body keys are mapped to their live column names.
    // There is no updated_at column, and work_planned / weather /
    // safety_incidents / photos / gps_* have no column, so they are ignored.
    const fieldMap: Record<string, string> = {
      crew_count: 'crew_count',
      hours_worked: 'hours',
      hours: 'hours',
      work_completed: 'work_performed',
      work_performed: 'work_performed',
      materials_used: 'materials_used',
      delays: 'delays',
      notes: 'notes',
      status: 'status',
    };
    const updateData: Record<string, any> = {};
    for (const [bodyKey, column] of Object.entries(fieldMap)) {
      if (updates[bodyKey] !== undefined) updateData[column] = updates[bodyKey];
    }

    const { data: updated, error } = await db
      .from('portal_sub_daily_logs')
      .update(updateData)
      .eq('id', log_id)
      .eq('sub_id', scope.subId)
      .eq('tenant_id', scope.tenantId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ daily_log: updated });
  } catch (err) {
    return apiError('portal/sub/daily-logs', err, "Couldn't update the daily log. Please try again.");
  }
}
