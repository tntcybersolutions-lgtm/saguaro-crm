import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { must } from '@/lib/db-write';

export const dynamic = 'force-dynamic';

/**
 * POST /api/resource-planning/workers/[id]/check-in
 * Body: { projectId, timestamp }
 * Records the worker's on-site check-in. There is no per-day worker status column,
 * so we write an audit row to geofence_events (event_type 'enter') and upsert the
 * worker's current location/status into crew_locations. The field page fires this
 * offline (fire-and-forget) and only needs a success ack.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Schedule', 'Edit');
  if (!g.ok) return g.res;
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: workerId } = await params;
    const body = await req.json().catch(() => ({}));
    const projectId: string | null = body.projectId || null;
    const timestamp: string = body.timestamp || new Date().toISOString();

    const db = createServerClient();

    // Audit trail (project_id is NOT NULL on geofence_events — only log when known)
    if (projectId) {
      await must(db.from('geofence_events').insert({
        tenant_id: user.tenantId,
        user_id: workerId,
        project_id: projectId,
        event_type: 'enter',
        auto_clocked: false,
        created_at: timestamp,
      }), 'geofence_events insert');
    }

    // Current status — replace any existing location row for this worker.
    // latitude/longitude are NOT NULL on crew_locations; default to 0 when unknown.
    await must(db.from('crew_locations').delete().eq('tenant_id', user.tenantId).eq('user_id', workerId), 'crew_locations delete');
    await must(db.from('crew_locations').insert({
      tenant_id: user.tenantId,
      user_id: workerId,
      project_id: projectId,
      latitude: 0,
      longitude: 0,
      status: 'on-site',
      updated_at: timestamp,
    }), 'crew_locations insert');

    return NextResponse.json({ success: true, status: 'on-site', checked_in_at: timestamp });
  } catch {
    // Stay non-fatal: this is an offline-queued mutation.
    return NextResponse.json({ success: false }, { status: 200 });
  }
}
