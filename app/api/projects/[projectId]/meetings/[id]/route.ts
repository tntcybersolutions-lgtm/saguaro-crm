/**
 * One job meeting — read with attendees and numbered items; update its header.
 *
 * GET   → { meeting, attendees, items, today, itemsMissing, carriedFrom: { [itemId]: meetingNumber } }
 * PATCH { title?, meeting_type?, meeting_date?, start_time?, end_time?, location?, notes?, facilitator_name?, status? }
 */
import { NextRequest, NextResponse } from 'next/server';
import { requestDay } from '@/lib/time-zone';
import {
  meetingsGate, meetingsFail, loadMeeting, notFound, MEETING_COLS, ATTENDEE_COLS, ITEM_COLS,
  dateOrNull, timeOrNull, textOrNull,
} from '@/lib/meetings-server';
import { isMissingTableError, MEETING_STATUSES, normalizeType, sortItems, type ItemLike } from '@/lib/meetings';

export const dynamic = 'force-dynamic';
type P = { params: { projectId: string; id: string } };

export async function GET(req: NextRequest, { params }: P) {
  const g = await meetingsGate(req, 'View', params.projectId);
  if (!g.ok) return g.res;
  const { user, db } = g;
  try {
    const meeting = await loadMeeting(db, user.tenantId, params.projectId, params.id);
    if (!meeting) return notFound();

    const [att, itm] = await Promise.all([
      db.from('meeting_attendees').select(ATTENDEE_COLS).eq('meeting_id', params.id).eq('tenant_id', user.tenantId).order('created_at', { ascending: true }),
      db.from('meeting_items').select(ITEM_COLS).eq('meeting_id', params.id).eq('tenant_id', user.tenantId),
    ]);
    if (att.error) throw att.error;
    let itemsMissing = false;
    if (itm.error) {
      if (!isMissingTableError(itm.error)) throw itm.error;
      itemsMissing = true;
    }
    const items = sortItems((itm.data || []) as (ItemLike & Record<string, unknown>)[]);

    /* Which meeting each carried item came from — the badge reads "From #3". */
    const carriedFrom: Record<string, number | null> = {};
    const srcIds = items.map((i) => i.carried_from_item_id).filter(Boolean) as string[];
    if (srcIds.length) {
      const { data: src, error: sErr } = await db.from('meeting_items').select('id, meeting_id').in('id', srcIds).eq('tenant_id', user.tenantId);
      if (sErr) throw sErr;
      const mIds = Array.from(new Set((src || []).map((s: { meeting_id: string }) => s.meeting_id)));
      const { data: ms, error: mErr } = mIds.length
        ? await db.from('meetings').select('id, meeting_number').in('id', mIds).eq('tenant_id', user.tenantId)
        : { data: [], error: null };
      if (mErr) throw mErr;
      const num = new Map((ms || []).map((m: { id: string; meeting_number: number | null }) => [m.id, m.meeting_number]));
      for (const s of (src || []) as { id: string; meeting_id: string }[]) carriedFrom[s.id] = num.get(s.meeting_id) ?? null;
    }

    /* Has this meeting's open work already moved to a later one? */
    let carriedTo: { id: string; meeting_number: number | null } | null = null;
    if (items.length) {
      const { data: later, error: lErr } = await db
        .from('meeting_items')
        .select('meeting_id')
        .in('carried_from_item_id', items.map((i) => i.id))
        .eq('tenant_id', user.tenantId)
        .limit(1);
      if (lErr) throw lErr;
      const mid = (later || [])[0]?.meeting_id as string | undefined;
      if (mid) {
        const { data: lm, error: lmErr } = await db.from('meetings').select('id, meeting_number').eq('id', mid).eq('tenant_id', user.tenantId).maybeSingle();
        if (lmErr) throw lmErr;
        carriedTo = (lm as typeof carriedTo) || null;
      }
    }

    const { today } = await requestDay(req.headers, db as never, user.tenantId, 'meetings/id');
    return NextResponse.json({ meeting, attendees: att.data || [], items, today, itemsMissing, carriedFrom, carriedTo });
  } catch (e) {
    return meetingsFail('projects/meetings/id GET', e, "Couldn't load the meeting");
  }
}

export async function PATCH(req: NextRequest, { params }: P) {
  const g = await meetingsGate(req, 'Edit', params.projectId);
  if (!g.ok) return g.res;
  const { user, db } = g;
  try {
    const body = await req.json().catch(() => ({}));
    const u: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.title !== undefined) {
      const t = textOrNull(body.title);
      if (!t) return NextResponse.json({ error: 'title is required' }, { status: 400 });
      u.title = t;
    }
    if (body.meeting_type !== undefined) u.meeting_type = normalizeType(body.meeting_type);
    if (body.meeting_date !== undefined) {
      const d = dateOrNull(body.meeting_date);
      if (!d) return NextResponse.json({ error: 'meeting_date is required' }, { status: 400 });
      u.meeting_date = d;
    }
    if (body.start_time !== undefined) u.start_time = timeOrNull(body.start_time);
    if (body.end_time !== undefined) u.end_time = timeOrNull(body.end_time);
    for (const k of ['location', 'notes', 'facilitator_name'] as const) if (body[k] !== undefined) u[k] = textOrNull(body[k]);
    if (body.status !== undefined) {
      if (!(MEETING_STATUSES as readonly string[]).includes(body.status)) {
        return NextResponse.json({ error: `status must be one of ${MEETING_STATUSES.join(', ')}` }, { status: 400 });
      }
      u.status = body.status;
    }
    const { data, error } = await db
      .from('meetings')
      .update(u)
      .eq('id', params.id)
      .eq('project_id', params.projectId)
      .eq('tenant_id', user.tenantId)
      .select(MEETING_COLS)
      .maybeSingle();
    if (error) throw error;
    if (!data) return notFound();
    return NextResponse.json({ meeting: data });
  } catch (e) {
    return meetingsFail('projects/meetings/id PATCH', e, "Couldn't save the meeting");
  }
}
