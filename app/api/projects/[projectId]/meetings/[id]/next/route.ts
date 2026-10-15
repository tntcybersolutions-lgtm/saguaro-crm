/**
 * Start next meeting — the next number in this meeting's series, a week on
 * (or the date given), the same attendees (present unticked), and every OPEN
 * item copied forward with its number kept and a link back to this meeting.
 *
 * POST { meeting_date? } → { meeting, carried: n }
 * 409 when this meeting's open items have already been carried to a later one.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requestDay } from '@/lib/time-zone';
import {
  meetingsGate, meetingsFail, loadMeeting, notFound, MEETING_COLS, dateOrNull,
} from '@/lib/meetings-server';
import { carryForwardRows, nextMeetingDate, nextMeetingNumber, type ItemLike } from '@/lib/meetings';

export const dynamic = 'force-dynamic';

type SrcItem = ItemLike & { topic: string | null; discussion: string | null; assignee_name: string | null };

export async function POST(req: NextRequest, { params }: { params: { projectId: string; id: string } }) {
  const g = await meetingsGate(req, 'Edit', params.projectId);
  if (!g.ok) return g.res;
  const { user, db } = g;
  let createdId: string | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    const src = await loadMeeting(db, user.tenantId, params.projectId, params.id);
    if (!src) return notFound();

    /* Items first: a missing table must stop this before a meeting is written. */
    const { data: srcItems, error: iErr } = await db
      .from('meeting_items')
      .select('id, number, topic, discussion, status, assignee_name, due_date, carried_from_item_id, position')
      .eq('meeting_id', params.id)
      .eq('tenant_id', user.tenantId);
    if (iErr) throw iErr;
    const items = (srcItems || []) as SrcItem[];

    if (items.length) {
      const { data: already, error: aErr } = await db
        .from('meeting_items')
        .select('meeting_id')
        .in('carried_from_item_id', items.map((i) => i.id))
        .eq('tenant_id', user.tenantId)
        .limit(1);
      if (aErr) throw aErr;
      const laterId = (already || [])[0]?.meeting_id as string | undefined;
      if (laterId) {
        const { data: later } = await db.from('meetings').select('id, meeting_number, meeting_date').eq('id', laterId).eq('tenant_id', user.tenantId).maybeSingle();
        return NextResponse.json({ error: 'This meeting\'s open items were already carried to the next meeting', meeting: later }, { status: 409 });
      }
    }

    const { data: series, error: sErr } = await db
      .from('meetings')
      .select('meeting_type, meeting_number')
      .eq('project_id', params.projectId)
      .eq('tenant_id', user.tenantId);
    if (sErr) throw sErr;

    const { today } = await requestDay(req.headers, db as never, user.tenantId, 'meetings/next');
    const { data: created, error: cErr } = await db
      .from('meetings')
      .insert({
        tenant_id: user.tenantId,
        project_id: params.projectId,
        title: src.title,
        meeting_type: src.meeting_type,
        meeting_number: nextMeetingNumber(series || [], src.meeting_type),
        meeting_date: dateOrNull(body.meeting_date) || nextMeetingDate(src.meeting_date as string | null, today),
        start_time: src.start_time,
        end_time: src.end_time,
        location: src.location,
        facilitator_name: src.facilitator_name,
        status: 'scheduled',
        created_by: user.id,
      })
      .select(MEETING_COLS)
      .single();
    if (cErr) throw cErr;
    createdId = (created as { id: string }).id;

    const { data: people, error: pErr } = await db
      .from('meeting_attendees')
      .select('name, company, email, role')
      .eq('meeting_id', params.id)
      .eq('tenant_id', user.tenantId);
    if (pErr) throw pErr;
    if (people?.length) {
      const { error } = await db.from('meeting_attendees').insert(
        people.map((p: Record<string, unknown>) => ({ ...p, tenant_id: user.tenantId, meeting_id: createdId, attended: false })),
      );
      if (error) throw error;
    }

    const rows = carryForwardRows(items, { tenantId: user.tenantId, projectId: params.projectId, meetingId: createdId })
      .map((r) => ({ ...r, created_by: user.id }));
    if (rows.length) {
      const { error } = await db.from('meeting_items').insert(rows);
      if (error) throw error;
    }

    return NextResponse.json({ meeting: created, carried: rows.length }, { status: 201 });
  } catch (e) {
    /* Never leave a half-built meeting behind (no attendees, missing items). */
    if (createdId) {
      const { error: undoErr } = await db.from('meetings').delete().eq('id', createdId).eq('tenant_id', user.tenantId);
      if (undoErr) console.error('[meetings/next] cleanup failed', undoErr);
    }
    return meetingsFail('projects/meetings/next POST', e, "Couldn't start the next meeting");
  }
}
