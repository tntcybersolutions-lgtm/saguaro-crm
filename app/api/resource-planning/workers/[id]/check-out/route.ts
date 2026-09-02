import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { must } from '@/lib/db-write';

export const dynamic = 'force-dynamic';

/**
 * POST /api/resource-planning/workers/[id]/check-out
 * Body: { projectId, timestamp }
 * Records the worker's check-out: audit row in geofence_events (event_type 'exit')
 * and crew_locations status -> 'off-site'.
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

    if (projectId) {
      await must(db.from('geofence_events').insert({
        tenant_id: user.tenantId,
        user_id: workerId,
        project_id: projectId,
        event_type: 'exit',
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
      status: 'off-site',
      updated_at: timestamp,
    }), 'crew_locations insert');

    return NextResponse.json({ success: true, status: 'off-site', checked_out_at: timestamp });
  } catch {
    return NextResponse.json({ success: false }, { status: 200 });
  }
}
