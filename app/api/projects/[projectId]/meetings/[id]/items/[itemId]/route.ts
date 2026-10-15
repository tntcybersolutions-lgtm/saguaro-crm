/**
 * Edit, close/reopen or remove one meeting item.
 * PATCH { topic?, discussion?, assignee_name?, due_date?, status?: 'open'|'closed' } → { item }
 * DELETE → { ok: true }
 */
import { NextRequest, NextResponse } from 'next/server';
import { meetingsGate, meetingsFail, loadMeeting, notFound, ITEM_COLS, dateOrNull, textOrNull } from '@/lib/meetings-server';
import { ITEM_STATUSES } from '@/lib/meetings';

export const dynamic = 'force-dynamic';
type P = { params: { projectId: string; id: string; itemId: string } };

export async function PATCH(req: NextRequest, { params }: P) {
  const g = await meetingsGate(req, 'Edit', params.projectId);
  if (!g.ok) return g.res;
  const { user, db } = g;
  try {
    const body = await req.json().catch(() => ({}));
    const meeting = await loadMeeting(db, user.tenantId, params.projectId, params.id);
    if (!meeting) return notFound();
    const u: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.topic !== undefined) {
      const t = textOrNull(body.topic);
      if (!t) return NextResponse.json({ error: 'topic is required' }, { status: 400 });
      u.topic = t;
    }
    if (body.discussion !== undefined) u.discussion = textOrNull(body.discussion);
    if (body.assignee_name !== undefined) u.assignee_name = textOrNull(body.assignee_name);
    if (body.due_date !== undefined) u.due_date = dateOrNull(body.due_date);
    if (body.status !== undefined) {
      if (!(ITEM_STATUSES as readonly string[]).includes(body.status)) {
        return NextResponse.json({ error: 'status must be open or closed' }, { status: 400 });
      }
      u.status = body.status;
      u.closed_at = body.status === 'closed' ? new Date().toISOString() : null;
    }
    const { data, error } = await db
      .from('meeting_items')
      .update(u)
      .eq('id', params.itemId)
      .eq('meeting_id', params.id)
      .eq('tenant_id', user.tenantId)
      .select(ITEM_COLS)
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    return NextResponse.json({ item: data });
  } catch (e) {
    return meetingsFail('projects/meetings/items PATCH', e, "Couldn't save the item");
  }
}

export async function DELETE(req: NextRequest, { params }: P) {
  const g = await meetingsGate(req, 'Edit', params.projectId);
  if (!g.ok) return g.res;
  const { user, db } = g;
  try {
    const meeting = await loadMeeting(db, user.tenantId, params.projectId, params.id);
    if (!meeting) return notFound();
    const { data, error } = await db
      .from('meeting_items')
      .delete()
      .eq('id', params.itemId)
      .eq('meeting_id', params.id)
      .eq('tenant_id', user.tenantId)
      .select('id');
    if (error) throw error;
    if (!data?.length) return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return meetingsFail('projects/meetings/items DELETE', e, "Couldn't remove the item");
  }
}
