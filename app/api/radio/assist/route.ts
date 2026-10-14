import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { createServerClient } from '@/lib/supabase-server';
import { createNotification } from '@/lib/notifications';
import { runInBackground } from '@/lib/background';

/**
 * Saguaro Radio — assistance queue (GroupTalk "Queue" parity).
 * Field worker taps "Request assistance" -> queue entry + dispatcher alert;
 * dispatchers acknowledge and resolve without interrupting radio traffic.
 *
 * POST { channelId?, projectId?, note?, location? }        -> raise a request
 * GET  ?projectId= | ?all=1                                -> open queue
 * PATCH { assistId, action: 'ack'|'resolve' }              -> triage
 */
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'View');
  if (!g.ok) return g.res;
  const t = g.user.tenantId;
  try {
    const b = await req.json().catch(() => ({}));
    const db = createServerClient() as any;
    const who = g.user.email || 'Team member';
    const loc = b.location && typeof b.location.lat === 'number' ? { lat: b.location.lat, lng: b.location.lng } : null;
    const { data: row, error } = await db.from('radio_assists').insert({
      tenant_id: t, channel_id: b.channelId ?? null, project_id: b.projectId ?? null,
      requester_user_id: g.user.id, requester_name: who,
      note: String(b.note || '').trim() || null, location: loc,
    } as never).select().single();
    if (error) throw error;

    // Alert dispatchers (channel role) or, failing that, every channel member.
    if (b.channelId) {
      const { data: members } = await db.from('radio_members').select('user_id, role').eq('tenant_id', t).eq('channel_id', b.channelId).not('user_id', 'is', null);
      const all = ((members || []) as any[]).filter((m) => m.user_id && m.user_id !== g.user.id);
      const dispatchers = all.filter((m) => m.role === 'dispatcher');
      const targets = (dispatchers.length ? dispatchers : all).map((m) => m.user_id);
      runInBackground(Promise.all(targets.map((uid) => createNotification(
        t, uid, 'radio_assist', 'Assistance requested',
        `${who}${b.note ? ` — ${String(b.note).slice(0, 120)}` : ' needs a hand'}`,
        `/app/radio?channel=${b.channelId}`, b.projectId ?? undefined
      ))), 'radio notify');
    }
    return NextResponse.json({ assist: row }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'View');
  if (!g.ok) return g.res;
  try {
    const db = createServerClient() as any;
    let q = db.from('radio_assists').select('*').eq('tenant_id', g.user.tenantId).neq('status', 'resolved').order('created_at', { ascending: true });
    const projectId = req.nextUrl.searchParams.get('projectId');
    if (projectId) q = q.eq('project_id', projectId);
    const { data } = await q.limit(100);
    return NextResponse.json({ queue: data || [] });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'View');
  if (!g.ok) return g.res;
  try {
    const b = await req.json().catch(() => ({}));
    if (!b.assistId || !['ack', 'resolve'].includes(b.action)) {
      return NextResponse.json({ error: 'assistId and action required' }, { status: 400 });
    }
    const db = createServerClient() as any;
    const who = g.user.email || 'Dispatcher';
    const patch = b.action === 'ack'
      ? { status: 'acknowledged', acknowledged_by: who, acknowledged_at: new Date().toISOString() }
      : { status: 'resolved', resolved_at: new Date().toISOString() };
    const { data, error } = await db.from('radio_assists').update(patch as never)
      .eq('id', b.assistId).eq('tenant_id', g.user.tenantId).select().single();
    if (error) throw error;
    // Tell the requester their call was picked up / closed.
    const r = data as any;
    if (r?.requester_user_id && r.requester_user_id !== g.user.id) {
      runInBackground(createNotification(
        g.user.tenantId, r.requester_user_id, 'radio_assist_update',
        b.action === 'ack' ? `${who} is on it` : 'Assistance resolved',
        b.action === 'ack' ? 'Your assistance request was acknowledged.' : 'Your assistance request was closed.',
        r.channel_id ? `/app/radio?channel=${r.channel_id}` : '/app/radio', r.project_id ?? undefined
      ), 'radio notify');
    }
    return NextResponse.json({ assist: data });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
