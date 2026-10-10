import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { recordLearning } from '@/lib/learning';
import { requestDay } from '@/lib/time-zone';

/**
 * Saguaro Radio — file-to-log.
 * POST { messageId } — appends the radio message (transcript or body, with
 * sender + time) to today's daily log work_performed for the message's
 * project, creating a minimal log row when today has none yet. One tap turns
 * radio traffic into the daily record.
 */
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const db = g.db as any, t = g.user.tenantId;
  try {
    const body = await req.json().catch(() => ({}));
    const messageId = String(body.messageId || '');
    if (!messageId) return NextResponse.json({ error: 'messageId required' }, { status: 400 });

    const { data: msg } = await db.from('radio_messages')
      .select('id, project_id, sender_name, kind, body, transcript, created_at')
      .eq('tenant_id', t).eq('id', messageId).single();
    if (!msg) return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    const m = msg as any;
    if (!m.project_id) return NextResponse.json({ error: 'Message has no project' }, { status: 400 });
    const text = String(m.transcript || m.body || '').trim();
    if (!text) return NextResponse.json({ error: 'Nothing to log yet (no transcript or text)' }, { status: 400 });

    // Today's log and the time stamp are on the person's clock (device, else company zone) —
    // the UTC day was tomorrow's log by 7 PM in Iowa, and "19:30 UTC" meant nothing on site.
    const { today, zone } = await requestDay(req.headers, db, t, 'radio/file-to-log');
    const sent = new Date(String(m.created_at || ''));
    const at = Number.isNaN(sent.getTime())
      ? ''
      : new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(sent);
    const entry = `[Radio${at ? ` ${at}` : ''}] ${m.sender_name || 'Team member'}: ${text}`;

    // Append to today's log — or open a minimal one if the day has no log yet.
    const { data: logs } = await db.from('daily_logs')
      .select('id, work_performed')
      .eq('tenant_id', t).eq('project_id', m.project_id).eq('log_date', today)
      .order('created_at', { ascending: true }).limit(1);
    const existing = ((logs || []) as any[])[0];
    let logId: string;
    if (existing) {
      const merged = existing.work_performed ? `${existing.work_performed}\n${entry}` : entry;
      const { error } = await db.from('daily_logs').update({ work_performed: merged } as never).eq('tenant_id', t).eq('id', existing.id);
      if (error) throw error;
      logId = existing.id;
    } else {
      const { data: created, error } = await db.from('daily_logs').insert({
        tenant_id: t, project_id: m.project_id, log_date: today,
        work_performed: entry, crew_count: 0, created_by: g.user.id,
      } as never).select('id').single();
      if (error) throw error;
      logId = (created as any).id;
    }

    // Receipt: radio traffic became the daily record without retyping.
    recordLearning(db, { tenantId: t, kind: 'ai_extract', projectId: m.project_id, userId: g.user.id, meta: { source: 'radio_file_to_log', messageId } });

    return NextResponse.json({ logId });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
