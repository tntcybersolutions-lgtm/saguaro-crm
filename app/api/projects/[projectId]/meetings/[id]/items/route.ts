/**
 * Raise a new item on a meeting. It is numbered "<meeting number>.<next>".
 * POST { topic, discussion?, assignee_name?, due_date? } → { item }
 */
import { NextRequest, NextResponse } from 'next/server';
import { meetingsGate, meetingsFail, loadMeeting, notFound, ITEM_COLS, dateOrNull, textOrNull } from '@/lib/meetings-server';
import { nextItemNumber } from '@/lib/meetings';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { projectId: string; id: string } }) {
  const g = await meetingsGate(req, 'Edit', params.projectId);
  if (!g.ok) return g.res;
  const { user, db } = g;
  try {
    const body = await req.json().catch(() => ({}));
    const topic = textOrNull(body.topic);
    if (!topic) return NextResponse.json({ error: 'topic is required' }, { status: 400 });
    const meeting = await loadMeeting(db, user.tenantId, params.projectId, params.id);
    if (!meeting) return notFound();

    const { data: existing, error: eErr } = await db
      .from('meeting_items')
      .select('number, position')
      .eq('meeting_id', params.id)
      .eq('tenant_id', user.tenantId);
    if (eErr) throw eErr;
    const rows = (existing || []) as { number: string | null; position: number | null }[];
    const number = nextItemNumber(meeting.meeting_number as number | null, rows.map((r) => r.number));
    const position = rows.reduce((m, r) => Math.max(m, (r.position ?? 0) + 1), 0);

    const { data, error } = await db
      .from('meeting_items')
      .insert({
        tenant_id: user.tenantId,
        project_id: params.projectId,
        meeting_id: params.id,
        number,
        topic,
        discussion: textOrNull(body.discussion),
        assignee_name: textOrNull(body.assignee_name),
        due_date: dateOrNull(body.due_date),
        status: 'open',
        position,
        created_by: user.id,
      })
      .select(ITEM_COLS)
      .single();
    if (error) throw error;
    return NextResponse.json({ item: data }, { status: 201 });
  } catch (e) {
    return meetingsFail('projects/meetings/items POST', e, "Couldn't add the item");
  }
}
