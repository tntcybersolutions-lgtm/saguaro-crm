import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

// Public, read-only calendar feed. No auth header (a webcal:// subscription
// can't send one) — the secret is the high-entropy token in the URL, resolved
// against ics_feed_tokens. Always fresh so subscribed calendars see updates.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');

// 'YYYY-MM-DD' -> 'YYYYMMDD'
const toDate = (d: string | null): string | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || '');
  return m ? `${m[1]}${m[2]}${m[3]}` : null;
};
// all-day DTEND is exclusive, so add a day
const plusDay = (d: string | null): string | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || '');
  if (!m) return null;
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return `${dt.getUTCFullYear()}${String(dt.getUTCMonth() + 1).padStart(2, '0')}${String(dt.getUTCDate()).padStart(2, '0')}`;
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const raw = (await params).token || '';
  const token = raw.replace(/\.ics$/i, '').trim();
  if (!token) return new NextResponse('Not found', { status: 404 });

  try {
    const db = createServerClient();

    const { data: feed } = await db
      .from('ics_feed_tokens')
      .select('tenant_id, project_id, label')
      .eq('token', token)
      .is('revoked_at', null)
      .maybeSingle();

    // Don't reveal whether a token exists — always 404 on miss.
    if (!feed) return new NextResponse('Not found', { status: 404 });

    const tenantId = (feed as any).tenant_id as string;
    const projectId = (feed as any).project_id as string | null;

    let tasksQ = db.from('schedule_tasks').select('id, name, start_date, end_date, status, trade, phase').eq('tenant_id', tenantId);
    let msQ = db.from('schedule_milestones').select('id, title, baseline_date, current_date, actual_date, status, is_critical_path').eq('tenant_id', tenantId);
    if (projectId) { tasksQ = tasksQ.eq('project_id', projectId); msQ = msQ.eq('project_id', projectId); }

    const [{ data: tasks }, { data: milestones }] = await Promise.all([tasksQ, msQ]);

    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const calName = (feed as any).label || 'Saguaro Schedule';
    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Saguaro//Field Schedule//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${esc(calName)}`,
      'X-PUBLISHED-TTL:PT1H',
    ];

    for (const t of (tasks ?? []) as any[]) {
      const start = toDate(t.start_date);
      if (!start) continue; // can't place a dateless task on a calendar
      const end = plusDay(t.end_date || t.start_date);
      const meta = [t.trade, t.phase, t.status].filter(Boolean).join(' · ');
      lines.push(
        'BEGIN:VEVENT',
        `UID:task-${t.id}@saguarocontrol.net`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${start}`,
        `DTEND;VALUE=DATE:${end}`,
        `SUMMARY:${esc(t.name || 'Task')}`,
        ...(meta ? [`DESCRIPTION:${esc(meta)}`] : []),
        'END:VEVENT',
      );
    }

    for (const m of (milestones ?? []) as any[]) {
      const day = toDate(m.actual_date || m.current_date || m.baseline_date);
      if (!day) continue;
      const flag = m.is_critical_path ? '⚑ ' : '◆ ';
      lines.push(
        'BEGIN:VEVENT',
        `UID:milestone-${m.id}@saguarocontrol.net`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${day}`,
        `DTEND;VALUE=DATE:${plusDay(day)}`,
        `SUMMARY:${esc(flag + (m.title || 'Milestone'))}`,
        ...(m.status ? [`DESCRIPTION:${esc('Milestone · ' + m.status)}`] : []),
        'END:VEVENT',
      );
    }

    lines.push('END:VCALENDAR');
    const body = lines.join('\r\n') + '\r\n';

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="saguaro-schedule.ics"',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch {
    return new NextResponse('Error', { status: 500 });
  }
}
