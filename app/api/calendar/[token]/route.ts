import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getEffectivePermissions, hasPermission } from '@/lib/permissions';
import { buildIcs, type CalEvent } from '@/lib/calendar/ics';

export const dynamic = 'force-dynamic';

/**
 * GET /api/calendar/<token>[.ics] — a person's calendar-sync feed, subscribed
 * to from Google / Outlook / iPhone (Settings → Calendar Sync). The private
 * token is the auth (calendar apps can't sign in). The feed shows what the
 * person may see: nothing at all unless they can view the schedule.
 *   schedule tasks  — all-day, start → end
 *   inspections     — 1 hour at the scheduled time
 *   meetings        — the meeting's date and times
 * Window: 30 days back to 180 days ahead.
 */
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const token = String(params.token || '').replace(/\.ics$/i, '');
  if (!/^[0-9a-f-]{36}$/i.test(token)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const db = createServerClient() as any;
  const { data: feed } = await db.from('calendar_feeds').select('tenant_id, user_id').eq('token', token).maybeSingle();
  if (!feed) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // Still with this company? A person who left gets nothing from an old link.
  const { data: member } = await db.from('profiles').select('id').eq('id', feed.user_id).eq('tenant_id', feed.tenant_id).maybeSingle();
  if (!member) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const t = feed.tenant_id as string;

  const { data: tenant } = await db.from('tenants').select('name, company_name').eq('id', t).maybeSingle();
  const calName = `Saguaro — ${tenant?.company_name || tenant?.name || 'Jobs'}`;
  const perms = await getEffectivePermissions(db, feed.user_id, t);
  const events: CalEvent[] = [];

  if (hasPermission(perms, 'Schedule', 'View')) {
    const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const to = new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10);
    const [{ data: projs }, { data: tasks }, { data: insp }, { data: meets }] = await Promise.all([
      db.from('projects').select('id, name, address').eq('tenant_id', t),
      db.from('schedule_tasks').select('id, project_id, name, start_date, end_date, status')
        .eq('tenant_id', t).not('start_date', 'is', null).lte('start_date', to).or(`end_date.gte.${from},end_date.is.null`).limit(2000),
      db.from('inspections').select('id, project_id, inspection_type, scheduled_date, status, inspector_name')
        .eq('tenant_id', t).gte('scheduled_date', from).lte('scheduled_date', `${to}T23:59:59Z`).limit(1000),
      db.from('meetings').select('id, project_id, title, location, meeting_date, start_time, end_time, status')
        .eq('tenant_id', t).gte('meeting_date', from).lte('meeting_date', to).limit(1000),
    ]);
    const job = new Map<string, { name: string; address: string | null }>(((projs || []) as any[]).map((p) => [p.id, { name: p.name, address: p.address ?? null }]));
    const jobName = (id: string | null) => (id && job.get(id)?.name) || 'Job';
    for (const k of (tasks || []) as any[]) {
      events.push({ uid: `task-${k.id}`, title: `${k.name} · ${jobName(k.project_id)}`, allDay: true, start: k.start_date, end: k.end_date, location: job.get(k.project_id)?.address, description: k.status ? `Status: ${k.status}` : null });
    }
    for (const i of (insp || []) as any[]) {
      const start = new Date(i.scheduled_date);
      events.push({ uid: `insp-${i.id}`, title: `Inspection: ${i.inspection_type || 'inspection'} · ${jobName(i.project_id)}`, allDay: false, startUtc: start.toISOString(), endUtc: new Date(start.getTime() + 3600000).toISOString(), location: job.get(i.project_id)?.address, description: i.inspector_name ? `Inspector: ${i.inspector_name}` : null });
    }
    for (const m of (meets || []) as any[]) {
      const title = `${m.title || 'Meeting'} · ${jobName(m.project_id)}`;
      if (m.start_time) {
        const end = m.end_time || m.start_time.replace(/^(\d{2})/, (h: string) => String(Math.min(23, Number(h) + 1)).padStart(2, '0'));
        events.push({ uid: `meet-${m.id}`, title, allDay: false, floatingStart: `${m.meeting_date}T${m.start_time}`, floatingEnd: `${m.meeting_date}T${end}`, location: m.location || job.get(m.project_id)?.address });
      } else {
        events.push({ uid: `meet-${m.id}`, title, allDay: true, start: m.meeting_date, location: m.location || job.get(m.project_id)?.address });
      }
    }
  }

  return new NextResponse(buildIcs(calName, events), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="saguaro.ics"',
      'Cache-Control': 'private, max-age=900',
    },
  });
}
