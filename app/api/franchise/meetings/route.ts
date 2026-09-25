import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { hasFeature } from '@/lib/entitlements-server';

import { apiError } from '@/lib/api-error';
/**
 * Cross-site OAC (Owner / Architect / Contractor) meetings + action items.
 * FAIL-CLOSED: only tenants entitled to `command_center`, scoped to their tenant.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ meetings: [], actions: [] }, { status: 401 });
    if (!(await hasFeature(user.tenantId, 'command_center')))
      return NextResponse.json({ meetings: [], actions: [], gated: true }, { status: 403 });

    const db = createServerClient();
    const [{ data: meetings }, { data: actions }, { data: projs }] = await Promise.all([
      db.from('meetings').select('*').eq('tenant_id', user.tenantId).order('meeting_date', { ascending: false }),
      db.from('action_items').select('*').eq('tenant_id', user.tenantId).order('due_date', { ascending: true, nullsFirst: false }),
      db.from('projects').select('id,name,city,state').eq('tenant_id', user.tenantId),
    ]);

    const pmap: Record<string, any> = Object.fromEntries((projs || []).map((p: any) => [p.id, p]));
    const mtitle: Record<string, string> = Object.fromEntries((meetings || []).map((m: any) => [m.id, m.title]));

    const actionsByMeeting: Record<string, { total: number; open: number }> = {};
    (actions || []).forEach((a: any) => {
      const k = a.meeting_id || '';
      if (!k) return;
      const done = a.is_completed || /complete|closed|done/i.test(String(a.status || ''));
      const e = (actionsByMeeting[k] ||= { total: 0, open: 0 });
      e.total++; if (!done) e.open++;
    });

    const enrichedMeetings = (meetings || []).map((m: any) => ({
      ...m,
      project_name: pmap[m.project_id]?.name ?? null,
      project_city: pmap[m.project_id]?.city ?? null,
      project_state: pmap[m.project_id]?.state ?? null,
      action_total: actionsByMeeting[m.id]?.total ?? 0,
      action_open: actionsByMeeting[m.id]?.open ?? 0,
    }));
    const enrichedActions = (actions || []).map((a: any) => ({
      ...a,
      project_name: pmap[a.project_id]?.name ?? null,
      meeting_title: a.meeting_id ? (mtitle[a.meeting_id] ?? null) : null,
    }));

    return NextResponse.json({ meetings: enrichedMeetings, actions: enrichedActions });
  } catch (e) {
    // A failed read must NOT render as an empty list. The screen would say
    // "no meetings" with total confidence when the truth is that the query
    // failed — and the old body carried source:'error', which no screen has
    // ever read. Real status, real server-side log, correlation id.
    return apiError('franchise/meetings', e, 'Could not load meetings');
  }
}

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Admin', 'Full');
  if (!g.ok) return g.res;
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    if (!(await hasFeature(user.tenantId, 'command_center')))
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    if (!body?.project_id || !body?.title || !body?.meeting_date)
      return NextResponse.json({ error: 'project_id, title and meeting_date are required' }, { status: 400 });

    const db = createServerClient();
    const { data: proj } = await db.from('projects').select('id').eq('tenant_id', user.tenantId).eq('id', body.project_id).maybeSingle();
    if (!proj) return NextResponse.json({ error: 'invalid project' }, { status: 400 });

    const attendees = Array.isArray(body.attendees)
      ? body.attendees.filter((a: any) => a && a.name).map((a: any) => ({ name: String(a.name).slice(0, 120), company: a.company ? String(a.company).slice(0, 120) : null, role: a.role ? String(a.role).slice(0, 80) : null }))
      : [];

    const meetingRow: Record<string, any> = {
      tenant_id: user.tenantId,
      project_id: body.project_id,
      title: String(body.title).slice(0, 300),
      meeting_type: body.meeting_type ? String(body.meeting_type).slice(0, 40) : 'OAC',
      meeting_date: body.meeting_date,
      location: body.location ? String(body.location).slice(0, 200) : null,
      facilitator_name: body.facilitator_name ? String(body.facilitator_name).slice(0, 120) : null,
      agenda: body.agenda ? String(body.agenda).slice(0, 4000) : null,
      notes: body.notes ? String(body.notes).slice(0, 8000) : null,
      attendees: attendees.length ? attendees : null,
      status: 'draft',
    };
    const { data: meeting, error: mErr } = await db.from('meetings').insert(meetingRow as any).select('*').single();
    if (mErr || !meeting) throw mErr || new Error('meeting insert failed');

    const warnings: string[] = [];
    let actionCount = 0;
    const items = Array.isArray(body.action_items) ? body.action_items.filter((a: any) => a && (a.description || a.title)) : [];
    if (items.length) {
      const rows = items.map((a: any) => ({
        tenant_id: user.tenantId,
        project_id: body.project_id,
        meeting_id: (meeting as any).id,
        title: String(a.title || a.description).slice(0, 300),
        description: a.description ? String(a.description).slice(0, 2000) : null,
        assigned_to_name: a.assigned_to_name ? String(a.assigned_to_name).slice(0, 120) : null,
        due_date: a.due_date || null,
        priority: a.priority ? String(a.priority).slice(0, 20) : 'medium',
        status: 'open',
        is_completed: false,
      }));
      const { error: aErr } = await db.from('action_items').insert(rows as any);
      if (aErr) warnings.push(`action_items: ${aErr.message}`);
      else actionCount = rows.length;
    }

    return NextResponse.json({ meeting, action_count: actionCount, warnings });
  } catch (e: any) {
    return apiError('franchise/meetings', e, "create failed", 500);
  }
}
