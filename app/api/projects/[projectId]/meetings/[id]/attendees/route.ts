/**
 * Add an attendee to a meeting.
 * POST { name, company?, email?, role?, present? } → { attendee }
 */
import { NextRequest, NextResponse } from 'next/server';
import { meetingsGate, meetingsFail, loadMeeting, notFound, ATTENDEE_COLS, textOrNull } from '@/lib/meetings-server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { projectId: string; id: string } }) {
  const g = await meetingsGate(req, 'Edit', params.projectId);
  if (!g.ok) return g.res;
  const { user, db } = g;
  try {
    const body = await req.json().catch(() => ({}));
    const name = textOrNull(body.name);
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
    const meeting = await loadMeeting(db, user.tenantId, params.projectId, params.id);
    if (!meeting) return notFound();
    const { data, error } = await db
      .from('meeting_attendees')
      .insert({
        tenant_id: user.tenantId,
        meeting_id: params.id,
        name,
        company: textOrNull(body.company),
        email: textOrNull(body.email),
        role: textOrNull(body.role),
        attended: body.present === undefined ? false : !!body.present,
      })
      .select(ATTENDEE_COLS)
      .single();
    if (error) throw error;
    return NextResponse.json({ attendee: data }, { status: 201 });
  } catch (e) {
    return meetingsFail('projects/meetings/attendees POST', e, "Couldn't add the attendee");
  }
}
