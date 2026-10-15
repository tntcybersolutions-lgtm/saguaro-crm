/**
 * Edit or remove one meeting attendee.
 * PATCH { name?, company?, email?, role?, present? } → { attendee }
 * DELETE → { ok: true }
 */
import { NextRequest, NextResponse } from 'next/server';
import { meetingsGate, meetingsFail, loadMeeting, notFound, ATTENDEE_COLS, textOrNull } from '@/lib/meetings-server';

export const dynamic = 'force-dynamic';
type P = { params: { projectId: string; id: string; attendeeId: string } };

export async function PATCH(req: NextRequest, { params }: P) {
  const g = await meetingsGate(req, 'Edit', params.projectId);
  if (!g.ok) return g.res;
  const { user, db } = g;
  try {
    const body = await req.json().catch(() => ({}));
    const meeting = await loadMeeting(db, user.tenantId, params.projectId, params.id);
    if (!meeting) return notFound();
    const u: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const n = textOrNull(body.name);
      if (!n) return NextResponse.json({ error: 'name is required' }, { status: 400 });
      u.name = n;
    }
    for (const k of ['company', 'email', 'role'] as const) if (body[k] !== undefined) u[k] = textOrNull(body[k]);
    if (body.present !== undefined) u.attended = !!body.present;
    if (!Object.keys(u).length) return NextResponse.json({ error: 'Nothing to change' }, { status: 400 });
    const { data, error } = await db
      .from('meeting_attendees')
      .update(u)
      .eq('id', params.attendeeId)
      .eq('meeting_id', params.id)
      .eq('tenant_id', user.tenantId)
      .select(ATTENDEE_COLS)
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Attendee not found' }, { status: 404 });
    return NextResponse.json({ attendee: data });
  } catch (e) {
    return meetingsFail('projects/meetings/attendees PATCH', e, "Couldn't save the attendee");
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
      .from('meeting_attendees')
      .delete()
      .eq('id', params.attendeeId)
      .eq('meeting_id', params.id)
      .eq('tenant_id', user.tenantId)
      .select('id');
    if (error) throw error;
    if (!data?.length) return NextResponse.json({ error: 'Attendee not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return meetingsFail('projects/meetings/attendees DELETE', e, "Couldn't remove the attendee");
  }
}
