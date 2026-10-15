/**
 * Distribute minutes — locks the record as distributed, stamps when and to
 * whom (every attendee with an email), and hands back the printable minutes.
 *
 * POST → { meeting, recipients: [{ name, email }], printUrl }
 */
import { NextRequest, NextResponse } from 'next/server';
import { meetingsGate, meetingsFail, loadMeeting, notFound, MEETING_COLS } from '@/lib/meetings-server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { projectId: string; id: string } }) {
  const g = await meetingsGate(req, 'Edit', params.projectId);
  if (!g.ok) return g.res;
  const { user, db } = g;
  try {
    const meeting = await loadMeeting(db, user.tenantId, params.projectId, params.id);
    if (!meeting) return notFound();

    const { data: people, error: pErr } = await db
      .from('meeting_attendees')
      .select('name, email')
      .eq('meeting_id', params.id)
      .eq('tenant_id', user.tenantId);
    if (pErr) throw pErr;
    const recipients = ((people || []) as { name: string; email: string | null }[])
      .filter((p) => p.email)
      .map((p) => ({ name: p.name, email: p.email as string }));

    const now = new Date().toISOString();
    const { data, error } = await db
      .from('meetings')
      .update({ status: 'distributed', distributed_at: now, distributed_to: recipients, minutes_generated_at: now, updated_at: now })
      .eq('id', params.id)
      .eq('project_id', params.projectId)
      .eq('tenant_id', user.tenantId)
      .select(MEETING_COLS)
      .maybeSingle();
    if (error) throw error;
    if (!data) return notFound();
    return NextResponse.json({
      meeting: data,
      recipients,
      printUrl: `/app/projects/${params.projectId}/meetings/${params.id}/minutes`,
    });
  } catch (e) {
    return meetingsFail('projects/meetings/distribute POST', e, "Couldn't distribute the minutes");
  }
}
