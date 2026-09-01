import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';

import { apiError } from '@/lib/api-error';
/**
 * Per-task schedule update.
 *
 * The field schedule screen PATCHes /api/projects/{projectId}/schedule/{taskId}
 * with { percent_complete } (and the mobile app sends status/dates). There was NO
 * route file at this path, so every progress update 404'd — the client caught the
 * error, queued it offline, and it never persisted. This route persists the update
 * against schedule_tasks, mapping the client's `percent_complete` to the real
 * `pct_complete` column, tenant-scoped via project ownership.
 */

const ALLOWED_SCHEDULE_COLUMNS = [
  'name', 'start_date', 'end_date', 'status', 'trade', 'phase', 'duration',
  'pct_complete', 'is_critical', 'wbs', 'predecessors', 'predecessor_id',
] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; taskId: string }> },
) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  const { projectId, taskId } = await params;

  try {
    const supabase = createServerClient();

    // Verify the project belongs to this tenant before touching its tasks.
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('tenant_id', user.tenantId)
      .single();
    if (projectError || !project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const updates: Record<string, unknown> = {};
    for (const k of ALLOWED_SCHEDULE_COLUMNS) {
      if (body[k] !== undefined) updates[k] = body[k];
    }
    // Client sends `percent_complete`; the real column is `pct_complete`.
    if (body.percent_complete !== undefined && updates.pct_complete === undefined) {
      updates.pct_complete = body.percent_complete;
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('schedule_tasks')
      .update(updates as never)
      .eq('id', taskId)
      .eq('project_id', projectId)
      .select()
      .single();
    if (error) {
      const status = error.code === 'PGRST116' ? 404 : 500;
      return apiError('projects/projectId/schedule/taskId', error, "Failed to update task", status);
    }
    return NextResponse.json({ task: data });
  } catch (err) {
    console.error('[schedule/taskId/PATCH]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
