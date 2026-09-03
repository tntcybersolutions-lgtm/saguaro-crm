import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/** camel+snake tolerant: returns the first key present (even if null), else undefined. */
function pick(body: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) if (k in body) return body[k];
  return undefined;
}

// PUT /api/schedule/milestone/{id}  -> { success, milestone }
// Update a schedule_milestones row by id + tenant_id (real columns only).
// Singular 'milestone' segment avoids the [projectId] dynamic-name clash
// with the sibling /api/schedule/milestones/[projectId] GET route.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Schedule', 'Edit');
  if (!g.ok) return g.res;
  const { id } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const updates: Record<string, unknown> = {};

    const title = pick(body, 'title', 'name');
    if (title !== undefined) {
      updates.title = title;
      updates.name = title;
    }

    // Real date column is `current_date` on schedule_milestones.
    const date = pick(body, 'date', 'milestone_date', 'milestoneDate', 'target_date', 'targetDate', 'current_date');
    if (date !== undefined) updates.current_date = date;

    const status = pick(body, 'status');
    if (status !== undefined) updates.status = status;

    const description = pick(body, 'description');
    if (description !== undefined) updates.description = description;

    const sortOrder = pick(body, 'sort_order', 'sortOrder');
    if (sortOrder !== undefined && sortOrder !== null) updates.sort_order = Number(sortOrder);

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 });
    }
    updates.updated_at = new Date().toISOString();

    const db = createServerClient();
    const { data, error } = await db
      .from('schedule_milestones')
      .update(updates as any)
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ success: true, milestone: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return apiError('schedule/milestone/id', e);
  }
}

// DELETE /api/schedule/milestone/{id}  -> { success }
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Schedule', 'Full');
  if (!g.ok) return g.res;
  const { id } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const db = createServerClient();
    const { error } = await db
      .from('schedule_milestones')
      .delete()
      .eq('id', id)
      .eq('tenant_id', user.tenantId);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return apiError('schedule/milestone/id', e);
  }
}
