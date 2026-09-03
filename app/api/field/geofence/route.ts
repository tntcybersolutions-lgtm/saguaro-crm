import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export async function POST(req: NextRequest) {
  try {
    const g = await requirePermission(req, 'Projects', 'Edit');
    if (!g.ok) return g.res;
    const user = g.user;

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
        auto_clocked: !!auto_clock,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (eventError) {
      return apiError('field/geofence', eventError, 'Failed to log geofence event');
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
            employee_name: user.email || '',
            punch_type: clockAction,
            punched_at: new Date().toISOString(),
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
    return apiError('field/geofence', err, 'Internal server error');
  }
}
