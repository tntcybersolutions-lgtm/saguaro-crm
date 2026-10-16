import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/**
 * Bulk operations on punch_list items for a project.
 * Called by app/field/punch/page.tsx (batchClose / batchReassign /
 * batchChangePriority / batchDelete).
 *
 * All operations are scoped to project_id AND tenant_id so a user can never
 * touch another tenant's rows even if ids are spoofed.
 */

/**
 * PATCH — bulk update.
 * Request body: { ids: string[], update: { status? | assignee? | priority? } }
 *   - `assignee` from the UI maps to the `assigned_to` column.
 *   - status 'complete' also stamps completed_at / completed_by.
 * Response: { success: true, updated: number }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;

  const { projectId } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];
    const update = (body?.update ?? {}) as Record<string, unknown>;

    if (ids.length === 0) {
      return NextResponse.json({ success: true, updated: 0 });
    }

    // Map UI field names -> DB columns; ignore anything unrecognized.
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof update.status === 'string') {
      patch.status = update.status;
      if (update.status === 'complete') {
        patch.completed_at = new Date().toISOString();
        patch.completed_by = user.email;
      }
    }
    if (typeof update.priority === 'string') patch.priority = update.priority;
    if (typeof update.assignee === 'string') patch.assigned_to = update.assignee;
    if (typeof update.assigned_to === 'string') patch.assigned_to = update.assigned_to;

    const db = createServerClient();
    const { data, error } = await db
      .from('punch_list')
      .update(patch)
      .in('id', ids)
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .select('id');

    if (error) throw error;
    return NextResponse.json({ success: true, updated: (data || []).length });
  } catch (e) {
    return apiError('projects/[projectId]/punch-list/batch PATCH', e, 'Failed to update punch items');
  }
}

/**
 * DELETE — bulk delete.
 * Request body: { ids: string[] }
 * Response: { success: true, deleted: number }
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const g = await requirePermission(req, 'Projects', 'Full');
  if (!g.ok) return g.res;
  const user = g.user;

  const { projectId } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];

    if (ids.length === 0) {
      return NextResponse.json({ success: true, deleted: 0 });
    }

    const db = createServerClient();
    const { data, error } = await db
      .from('punch_list')
      .delete()
      .in('id', ids)
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .select('id');

    if (error) throw error;
    return NextResponse.json({ success: true, deleted: (data || []).length });
  } catch (e) {
    return apiError('projects/[projectId]/punch-list/batch DELETE', e, 'Failed to delete punch items');
  }
}
