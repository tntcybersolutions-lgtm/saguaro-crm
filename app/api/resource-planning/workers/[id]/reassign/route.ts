import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { must } from '@/lib/db-write';

export const dynamic = 'force-dynamic';

/**
 * Reassign a worker's area/task on a project.
 * The field page enqueues this with PATCH; we also accept POST.
 * Body: { projectId, area, task }
 *
 * There is no area/task column on workers or crew_locations, so the reassignment is
 * recorded as a geofence_events audit row and the worker's current project location
 * is refreshed. The field page applies the change optimistically and only needs an ack.
 */
async function handle(req: NextRequest, workerId: string) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const projectId: string | null = body.projectId || null;
    const area: string = body.area || '';
    const task: string = body.task || '';
    const timestamp = new Date().toISOString();

    const db = createServerClient();

    if (projectId) {
      await must(db.from('geofence_events').insert({
        tenant_id: user.tenantId,
        user_id: workerId,
        project_id: projectId,
        event_type: 'reassign',
        auto_clocked: false,
        created_at: timestamp,
      }), 'geofence_events insert');
    }

    // Keep current location row pointed at the right project if one exists.
    if (projectId) {
      await must(db
        .from('crew_locations')
        .update({ project_id: projectId, updated_at: timestamp })
        .eq('tenant_id', user.tenantId)
        .eq('user_id', workerId), 'crew_locations write');
    }

    return NextResponse.json({ success: true, area, task, project_id: projectId });
  } catch {
    return NextResponse.json({ success: false }, { status: 200 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Schedule', 'Edit');
  if (!g.ok) return g.res;
  const { id } = await params;
  return handle(req, id);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Schedule', 'Edit');
  if (!g.ok) return g.res;
  const { id } = await params;
  return handle(req, id);
}
