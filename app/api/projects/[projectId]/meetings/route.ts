/**
 * Job meetings — list (with item counts and the four headline numbers) and create.
 *
 * GET  /api/projects/:projectId/meetings
 *      → { meetings: [...with open_items / overdue_items / item_count], stats, today, itemsMissing }
 * POST /api/projects/:projectId/meetings  { title?, meeting_type, meeting_date, start_time?, location? }
 *      → { meeting }   meeting_number is the next in that type's series
 */
import { NextRequest, NextResponse } from 'next/server';
import { requestDay } from '@/lib/time-zone';
import {
  meetingsGate, meetingsFail, tableMissing, MEETING_COLS, dateOrNull, timeOrNull, textOrNull,
} from '@/lib/meetings-server';
import {
  isMissingTableError, itemCountsByMeeting, meetingStats, nextMeetingNumber, normalizeType, typeLabel,
  type ItemLike,
} from '@/lib/meetings';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const g = await meetingsGate(req, 'View', params.projectId);
  if (!g.ok) return g.res;
  const { user, db } = g;
  try {
    const { data: meetings, error } = await db
      .from('meetings')
      .select(MEETING_COLS)
      .eq('project_id', params.projectId)
      .eq('tenant_id', user.tenantId)
      .order('meeting_date', { ascending: false });
    if (error) throw error;

    const itemsQ = await db
      .from('meeting_items')
      .select('id, meeting_id, number, status, due_date, carried_from_item_id')
      .eq('project_id', params.projectId)
      .eq('tenant_id', user.tenantId);
    let itemsMissing = false;
    if (itemsQ.error) {
      if (!isMissingTableError(itemsQ.error)) throw itemsQ.error;
      itemsMissing = true;
    }
    const items = (itemsQ.data || []) as ItemLike[];
    const { today } = await requestDay(req.headers, g.db as never, user.tenantId, 'meetings');
    const counts = itemCountsByMeeting(items, today);
    const rows = (meetings || []).map((m: Record<string, unknown>) => {
      const c = counts[m.id as string] || { open: 0, overdue: 0, total: 0 };
      return { ...m, open_items: c.open, overdue_items: c.overdue, item_count: c.total };
    });
    return NextResponse.json({
      meetings: rows,
      stats: meetingStats(rows as never, items, today),
      today,
      itemsMissing,
    });
  } catch (e) {
    return meetingsFail('projects/meetings GET', e, "Couldn't load meetings");
  }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const g = await meetingsGate(req, 'Edit', params.projectId);
  if (!g.ok) return g.res;
  const { user, db } = g;
  try {
    const body = await req.json().catch(() => ({}));
    const meeting_date = dateOrNull(body.meeting_date);
    if (!meeting_date) return NextResponse.json({ error: 'meeting_date is required' }, { status: 400 });
    const meeting_type = normalizeType(body.meeting_type);

    const { data: series, error: sErr } = await db
      .from('meetings')
      .select('meeting_type, meeting_number')
      .eq('project_id', params.projectId)
      .eq('tenant_id', user.tenantId);
    if (sErr) throw sErr;
    const meeting_number = nextMeetingNumber(series || [], meeting_type);

    const { data, error } = await db
      .from('meetings')
      .insert({
        tenant_id: user.tenantId,
        project_id: params.projectId,
        title: textOrNull(body.title) || `${typeLabel(meeting_type)} meeting`,
        meeting_type,
        meeting_number,
        meeting_date,
        start_time: timeOrNull(body.start_time),
        location: textOrNull(body.location),
        status: 'scheduled',
        created_by: user.id,
      })
      .select(MEETING_COLS)
      .single();
    if (error) throw error;
    return NextResponse.json({ meeting: data }, { status: 201 });
  } catch (e) {
    if (isMissingTableError(e)) return tableMissing();
    return meetingsFail('projects/meetings POST', e, "Couldn't create the meeting");
  }
}
