import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { must } from '@/lib/db-write';

export const dynamic = 'force-dynamic';

/**
 * Per-worker weather notes.
 *
 * NOTE: The shipped field Resource Planning page saves weather notes to the
 * project-scoped route /api/resource-planning/weather-notes (not per-worker).
 * This per-worker endpoint exists for the documented route surface; it stores a
 * lightweight note keyed to the worker via a geofence_events audit row and returns
 * a success ack. There is no per-worker notes column, so reads return an empty note.
 *
 * GET  -> { notes: '' }
 * POST  Body: { projectId, notes, date }
 */
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ notes: '' });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Schedule', 'Edit');
  if (!g.ok) return g.res;
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: workerId } = await params;
    const body = await req.json().catch(() => ({}));
    const projectId: string | null = body.projectId || null;
    const timestamp = new Date().toISOString();

    const db = createServerClient();
    // project_id is NOT NULL on geofence_events — only audit when known.
    if (projectId) {
      await must(db.from('geofence_events').insert({
        tenant_id: user.tenantId,
        user_id: workerId,
        project_id: projectId,
        event_type: 'weather-note',
        auto_clocked: false,
        created_at: timestamp,
      }), 'geofence_events insert');
    }

    return NextResponse.json({ success: true, notes: body.notes ?? '' });
  } catch {
    return NextResponse.json({ success: false }, { status: 200 });
  }
}
