import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      project_id,
      event_type,
      latitude,
      longitude,
      fence_id,
      fence_name,
      auto_clock,
    } = body;

    if (!project_id || !event_type) {
      return NextResponse.json({ error: 'project_id and event_type are required' }, { status: 400 });
    }

    if (!['enter', 'exit'].includes(event_type)) {
      return NextResponse.json({ error: 'event_type must be "enter" or "exit"' }, { status: 400 });
    }

    const db = createServerClient();

    // Log the geofence event
    const { data: event, error: eventError } = await db
      .from('geofence_events')
      .insert({
        tenant_id: user.tenantId,
        project_id,
        user_id: user.id,
        event_type,
        latitude: latitude || null,
        longitude: longitude || null,
        fence_id: fence_id || null,
        fence_name: fence_name || null,
        recorded_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (eventError) {
      return NextResponse.json({ error: 'Failed to log geofence event', details: eventError.message }, { status: 500 });
    }

    // Optionally auto-clock in/out via internal clock API
    let clockResult = null;
    if (auto_clock) {
      try {
        const clockAction = event_type === 'enter' ? 'clock_in' : 'clock_out';
        const { data: clockData, error: clockError } = await db
          .from('clock_punches')
          .insert({
            tenant_id: user.tenantId,
            project_id,
            user_id: user.id,
            action: clockAction,
            timestamp: new Date().toISOString(),
            source: 'geofence',
            geofence_event_id: event.id,
          })
          .select()
          .single();

        if (!clockError) {
          clockResult = clockData;
        }
      } catch {
        // auto-clock is best-effort
      }
    }

    return NextResponse.json({ event, clock: clockResult }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}
