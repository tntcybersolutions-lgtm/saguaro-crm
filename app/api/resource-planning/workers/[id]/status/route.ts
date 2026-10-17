import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { must } from '@/lib/db-write';

export const dynamic = 'force-dynamic';

/**
 * GET   /api/resource-planning/workers/[id]/status -> { status }
 * PATCH /api/resource-planning/workers/[id]/status   Body: { projectId, status, date }
 *
 * Worker presence status is tracked in crew_locations (one current row per worker).
 * Used by the field page "Mark Absent" action (status: 'absent').
 */

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: workerId } = await params;
    // Someone else's whereabouts: Schedule: View, as crew_locations_sel in the
    // database (own row, or Schedule: View). Your own status needs only sign-in.
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (workerId !== user.id) {
      const g = await requirePermission(req, 'Schedule', 'View');
      if (!g.ok) return g.res;
    }
    const db = createServerClient();
    const { data } = await db
      .from('crew_locations')
      .select('status, project_id, updated_at')
      .eq('tenant_id', user.tenantId)
      .eq('user_id', workerId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      status: data?.status || 'off-site',
      project_id: data?.project_id || null,
      updated_at: data?.updated_at || null,
    });
  } catch (e) {
    console.error('[resource-planning/workers/status GET]', e);
    return NextResponse.json({ status: 'off-site' });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Schedule', 'Edit');
  if (!g.ok) return g.res;
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: workerId } = await params;
    const body = await req.json().catch(() => ({}));
    const status: string = body.status || 'off-site';
    const projectId: string | null = body.projectId || null;
    const timestamp = new Date().toISOString();

    const db = createServerClient();

    // Audit absences/status changes for traceability (project_id is NOT NULL).
    if (projectId) {
      await must(db.from('geofence_events').insert({
        tenant_id: user.tenantId,
        user_id: workerId,
        project_id: projectId,
        event_type: status === 'absent' ? 'absent' : 'status',
        auto_clocked: false,
        created_at: timestamp,
      }), 'geofence_events insert');
    }

    await must(db.from('crew_locations').delete().eq('tenant_id', user.tenantId).eq('user_id', workerId), 'crew_locations delete');
    await must(db.from('crew_locations').insert({
      tenant_id: user.tenantId,
      user_id: workerId,
      project_id: projectId,
      latitude: 0,
      longitude: 0,
      status,
      updated_at: timestamp,
    }), 'crew_locations insert');

    return NextResponse.json({ success: true, status });
  } catch {
    return NextResponse.json({ success: false }, { status: 200 });
  }
}
