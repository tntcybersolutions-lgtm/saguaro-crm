import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { signStoredUrl } from '@/lib/storage-signing';
import { createNotification } from '@/lib/notifications';
import { translateRadioMessage } from '@/lib/translate';
import { stampPresentAtSend, receiptsByMessage } from '@/lib/radio-receipts';
import { apiError } from '@/lib/api-error';
import { writeWithOptionalColumns } from '@/lib/optional-column';

/**
 * Saguaro Radio — channel traffic.
 * GET ?channelId=&after=  — messages (newest 100, or everything after a cursor
 *   timestamp for near-real-time polling); voice/image paths come back signed.
 * POST { channelId, kind: 'text'|'alert', body } — send text; 'alert' is the
 *   high-visibility broadcast (notifies every member, bypassing quiet UX).
 * PATCH { id, body } — correct a typed message (text/alert) YOU sent. Voice,
 *   tones, photos, panics and patch-mirrored copies are records of what went
 *   out over the air and are never editable. The row is stamped edited_at once
 *   that column exists:
 *     ALTER TABLE public.radio_messages ADD COLUMN IF NOT EXISTS edited_at timestamptz;
 */
async function membership(db: any, t: string, uid: string, channelId: string) {
  const { data } = await db.from('radio_members').select('id, role').eq('tenant_id', t).eq('channel_id', channelId).eq('user_id', uid).limit(1);
  return (data || [])[0] ?? null;
}


export async function GET(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'View');
  if (!g.ok) return g.res;
  const db = g.db as any, t = g.user.tenantId;
  try {
    const channelId = req.nextUrl.searchParams.get('channelId');
    const after = req.nextUrl.searchParams.get('after');
    if (!channelId) return NextResponse.json({ error: 'channelId required' }, { status: 400 });
    if (!(await membership(db, t, g.user.id, channelId))) return NextResponse.json({ error: 'Not a member of this channel' }, { status: 403 });

    // Presence + read piggyback: polling IS being on channel. Fire-and-forget —
    // never blocks or fails the read.
    const nowIso = new Date().toISOString();
    void db.from('radio_members').update({ last_seen_at: nowIso, last_read_at: nowIso } as never)
      .eq('tenant_id', t).eq('channel_id', channelId).eq('user_id', g.user.id)
      .then(() => {}, () => {});

    let q = db.from('radio_messages').select('*').eq('tenant_id', t).eq('channel_id', channelId);
    if (after) q = q.gt('created_at', after);
    // Recording console: date-range reads for the channel log export.
    const from = req.nextUrl.searchParams.get('from');
    const to = req.nextUrl.searchParams.get('to');
    if (from) q = q.gte('created_at', from);
    if (to) q = q.lte('created_at', to);
    const { data, error } = await q.order('created_at', { ascending: after ? true : false }).limit(100);
    if (error) throw error;
    const rows = (data || []) as any[];
    // HEARD-BY (R13): one IN query attaches receipts to the page. Tolerant —
    // pre-migration this returns an empty map and rows ship without receipts.
    const receiptMap = await receiptsByMessage(db, t, rows.map((m) => m.id));
    const messages = await Promise.all((after ? rows : rows.reverse()).map(async (m) => ({
      ...m,
      receipts: receiptMap.get(m.id) ?? [],
      audio_url: m.audio_path ? await signStoredUrl('project-files', m.audio_path, 3600) : null,
      image_url: m.image_path ? await signStoredUrl('project-files', m.image_path, 3600) : null,
    })));
    return NextResponse.json({ messages });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'View');
  if (!g.ok) return g.res;
  const db = g.db as any, t = g.user.tenantId;
  try {
    const body = await req.json().catch(() => ({}));
    // Broadcast (GroupTalk group-patch parity, the practical version): one
    // compose can land on several channels at once.
    if (Array.isArray(body.channelIds) && body.channelIds.length > 1) {
      const text0 = String(body.body || '').trim();
      if (!text0) return NextResponse.json({ error: 'body required' }, { status: 400 });
      const sent: any[] = [];
      for (const cid of body.channelIds.slice(0, 8)) {
        if (!(await membership(db, t, g.user.id, cid))) continue;
        const { data: chb } = await db.from('radio_channels').select('project_id').eq('tenant_id', t).eq('id', cid).single();
        const { data: bm } = await db.from('radio_messages').insert({
          tenant_id: t, channel_id: cid, project_id: (chb as any)?.project_id ?? null,
          sender_user_id: g.user.id, sender_name: g.user.email || 'Team member',
          kind: body.kind === 'alert' ? 'alert' : 'text', body: text0,
        } as never).select().single();
        if (bm) {
          sent.push(bm);
          void translateRadioMessage(db, (bm as any).id, text0);
          // HEARD-BY (R13): broadcast rows get the same present-at-send
          // snapshot as single-channel traffic. Fire-and-forget.
          void stampPresentAtSend(db, t, cid, (bm as any).id);
        }
      }
      return NextResponse.json({ messages: sent, broadcast: sent.length }, { status: 201 });
    }

    const channelId = body.channelId;
    const kind = body.kind === 'alert' ? 'alert' : body.kind === 'tone' ? 'tone' : 'text';
    const text = String(body.body || '').trim();
    if (!channelId || !text) return NextResponse.json({ error: 'channelId and body required' }, { status: 400 });
    if (kind === 'tone' && !['ack', 'negative', 'comein'].includes(text)) {
      return NextResponse.json({ error: 'invalid tone' }, { status: 400 });
    }
    if (!(await membership(db, t, g.user.id, channelId))) return NextResponse.json({ error: 'Not a member of this channel' }, { status: 403 });

    const { data: ch } = await db.from('radio_channels').select('project_id, name').eq('tenant_id', t).eq('id', channelId).single();
    const { data: msg, error } = await db.from('radio_messages').insert({
      tenant_id: t, channel_id: channelId, project_id: (ch as any)?.project_id ?? null,
      sender_user_id: g.user.id, sender_name: g.user.email || 'Team member', kind, body: text,
    } as never).select().single();
    if (error) throw error;

    // Translation brain: fire-and-forget (env-gated inside; never blocks the send).
    if (kind !== 'tone') void translateRadioMessage(db, (msg as any)?.id, text);

    // HEARD-BY (R13): snapshot who was live on the channel at send time.
    // Fire-and-forget; tolerant of the pre-063 schema.
    void stampPresentAtSend(db, t, channelId, (msg as any)?.id);

    // GROUP PATCHING: mirror the message onto every channel patched to this one.
    void (async () => {
      try {
        const { data: patches } = await db.from('radio_channel_patches')
          .select('channel_a, channel_b')
          .eq('tenant_id', t).is('released_at', null)
          .or(`channel_a.eq.${channelId},channel_b.eq.${channelId}`);
        for (const p of (patches || []) as any[]) {
          const other = p.channel_a === channelId ? p.channel_b : p.channel_a;
          const { data: och } = await db.from('radio_channels').select('project_id').eq('tenant_id', t).eq('id', other).single();
          const { data: pm } = await db.from('radio_messages').insert({
            tenant_id: t, channel_id: other, project_id: (och as any)?.project_id ?? null,
            sender_user_id: g.user.id, sender_name: g.user.email || 'Team member',
            kind, body: text, patched_from: channelId,
          } as never).select().single();
          // HEARD-BY (R13): mirrored rows carry their own present-at-send
          // snapshot for the patched channel. Fire-and-forget.
          if (pm) void stampPresentAtSend(db, t, other, (pm as any).id);
        }
      } catch { /* mirroring is best-effort */ }
    })();

    if (kind === 'alert') {
      const { data: members } = await db.from('radio_members').select('user_id').eq('tenant_id', t).eq('channel_id', channelId).not('user_id', 'is', null);
      await Promise.all(((members || []) as any[])
        .filter((m) => m.user_id && m.user_id !== g.user.id)
        .map((m) => createNotification(t, m.user_id, 'radio_alert', `ALERT — ${(ch as any)?.name || 'Radio'}`, text, `/app/radio?channel=${channelId}`, (ch as any)?.project_id ?? undefined)));
    }
    return NextResponse.json({ message: msg }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Kinds a sender may correct after sending — the typed ones. */
const EDITABLE_KINDS = new Set(['text', 'alert']);

export async function PATCH(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'View');
  if (!g.ok) return g.res;
  const db = g.db as any, t = g.user.tenantId;
  try {
    const body = await req.json().catch(() => ({}));
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    const text = String(body.body ?? '').trim();
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
    if (!text) return NextResponse.json({ error: 'body is required' }, { status: 400 });

    const { data: m, error: findErr } = await db.from('radio_messages')
      .select('id, channel_id, sender_user_id, kind, patched_from')
      .eq('tenant_id', t).eq('id', id).maybeSingle();
    if (findErr) throw findErr;
    if (!m) return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    if (m.sender_user_id !== g.user.id) return NextResponse.json({ error: 'Only the person who sent a message can edit it' }, { status: 403 });
    if (!EDITABLE_KINDS.has(String(m.kind)) || m.patched_from) {
      return NextResponse.json({ error: 'Only a typed message can be edited — voice, photos, tones and panics stay as sent' }, { status: 409 });
    }
    if (!(await membership(db, t, g.user.id, m.channel_id))) return NextResponse.json({ error: 'Not a member of this channel' }, { status: 403 });

    // The old translations describe the old words — clear them; re-translated below.
    const { result: { data: updated, error: updErr } } = await writeWithOptionalColumns(
      { body: text, translations: null, edited_at: new Date().toISOString() },
      ['edited_at'],
      (row): PromiseLike<{ data: any; error: any }> => db.from('radio_messages').update(row as never)
        .eq('tenant_id', t).eq('id', id).eq('sender_user_id', g.user.id)
        .select().single(),
    );
    if (updErr) throw updErr;

    void translateRadioMessage(db, id, text);
    return NextResponse.json({ message: updated });
  } catch (e) {
    return apiError('radio/messages PATCH', e, 'Could not edit the message');
  }
}
