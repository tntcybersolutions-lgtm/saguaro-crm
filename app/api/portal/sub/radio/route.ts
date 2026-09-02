import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { signStoredUrl } from '@/lib/storage-signing';
import { translateRadioMessage } from '@/lib/translate';
import { transcribeRadioVoice } from '@/lib/transcribe';
import { stampPresentAtSend, receiptsByMessage } from '@/lib/radio-receipts';
import { must } from '@/lib/db-write';

const BUCKET = 'project-files';
const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED = /\.(m4a|mp4|aac|mp3|wav|webm|ogg|caf)$/i;
const IMAGE_ALLOWED = /\.(png|jpe?g|webp|heic|pdf)$/i;

/**
 * Saguaro Radio — SUB PORTAL access (approved scope: subs join project
 * channels). Token-authenticated; scoped to the sub's project's sub-enabled
 * channels only. GET lists traffic (signed audio/images); POST sends text,
 * voice, or a photo/PDF attachment.
 */
async function auth(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') || req.headers.get('x-portal-token');
  if (!token) return null;
  const db = createServerClient() as any;
  const { data: session } = await db.from('portal_sub_sessions').select('*').eq('token', token).eq('status', 'active').single();
  return session ? { db, session: session as any } : null;
}

async function subChannel(db: any, session: any) {
  const { data } = await db.from('radio_channels')
    .select('id, name, project_id')
    .eq('tenant_id', session.tenant_id)
    .eq('project_id', session.project_id)
    .eq('allow_subs', true)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1);
  return ((data || [])[0] as any) ?? null;
}

async function ensureMember(db: any, session: any, channelId: string) {
  const { data } = await db.from('radio_members').select('id').eq('channel_id', channelId).eq('portal_sub_id', session.sub_id).limit(1);
  if (!data || !data.length) {
    await must(db.from('radio_members').insert({
      channel_id: channelId, tenant_id: session.tenant_id, portal_sub_id: session.sub_id,
      display_name: session.sub_company || 'Subcontractor',
    } as never), 'radio_members insert');
  }
}

export async function GET(req: NextRequest) {
  const a = await auth(req);
  if (!a) return NextResponse.json({ error: 'Invalid or expired portal token' }, { status: 401 });
  try {
    const ch = await subChannel(a.db, a.session);
    if (!ch) return NextResponse.json({ channel: null, messages: [] });
    await ensureMember(a.db, a.session, ch.id);
    const after = req.nextUrl.searchParams.get('after');
    // Presence: polling the feed is the heartbeat — mark this sub seen/read,
    // then count everyone (crew + subs) seen on the channel in the last 90s.
    const nowIso = new Date().toISOString();
    await must(a.db.from('radio_members')
      .update({ last_seen_at: nowIso, last_read_at: nowIso } as never)
      .eq('channel_id', ch.id).eq('portal_sub_id', a.session.sub_id), 'radio_members write');
    const presenceCutoff = new Date(Date.now() - 90 * 1000).toISOString();
    const { count: onChannel } = await a.db.from('radio_members')
      .select('id', { count: 'exact', head: true })
      .eq('channel_id', ch.id)
      .gt('last_seen_at', presenceCutoff);
    let q = a.db.from('radio_messages').select('*').eq('channel_id', ch.id);
    if (after) q = q.gt('created_at', after);
    const { data } = await q.order('created_at', { ascending: after ? true : false }).limit(100);
    const rows = ((data || []) as any[]);
    // R13 heard-by: subs see who played their own transmissions too.
    const receiptMap = await receiptsByMessage(a.db, a.session.tenant_id, rows.map((m) => m.id));
    const messages = await Promise.all((after ? rows : rows.reverse()).map(async (m) => ({
      ...m,
      receipts: receiptMap.get(m.id) ?? [],
      audio_url: m.audio_path ? await signStoredUrl('project-files', m.audio_path, 3600) : null,
      image_url: m.image_path ? await signStoredUrl('project-files', m.image_path, 3600) : null,
    })));
    return NextResponse.json({ channel: { id: ch.id, name: ch.name, on_channel: onChannel ?? 0 }, messages });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const a = await auth(req);
  if (!a) return NextResponse.json({ error: 'Invalid or expired portal token' }, { status: 401 });
  try {
    const ch = await subChannel(a.db, a.session);
    if (!ch) return NextResponse.json({ error: 'Radio not enabled for this project' }, { status: 404 });
    await ensureMember(a.db, a.session, ch.id);
    const sender = a.session.sub_company || 'Subcontractor';
    const ct = req.headers.get('content-type') || '';

    if (ct.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file') as File | null;
      const durationSecs = Number(form.get('durationSecs')) || null;
      if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 });
      if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File too large' }, { status: 413 });
      let safeName = String(file.name || 'clip.m4a').replace(/[^\w.\-]+/g, '_');
      const isAttachment = IMAGE_ALLOWED.test(safeName);
      // Voice clips are never bounced on filename: browsers name blobs from
      // negotiated mimeTypes — rename from the content type instead of 415ing.
      if (!isAttachment && !ALLOWED.test(safeName)) {
        const fct = String(file.type || '').toLowerCase();
        const ext = fct.includes('webm') ? 'webm' : fct.includes('ogg') ? 'ogg'
          : fct.includes('wav') ? 'wav' : fct.includes('mpeg') || fct.includes('mp3') ? 'mp3'
          : fct.includes('aac') ? 'aac' : 'm4a';
        safeName = `clip.${ext}`;
      }
      const path = `${a.session.tenant_id}/radio/${ch.id}/${Date.now()}_sub_${safeName}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      const fallbackType = isAttachment ? 'application/octet-stream' : 'audio/mp4';
      const { error: upErr } = await a.db.storage.from(BUCKET).upload(path, buffer, { contentType: file.type || fallbackType, upsert: false });
      if (upErr) throw upErr;
      if (isAttachment) {
        // Photo/PDF attachment: same storage path as voice, but a kind 'image'
        // row with image_path so the feed signs and renders it inline.
        const { data: msg, error } = await a.db.from('radio_messages').insert({
          tenant_id: a.session.tenant_id, channel_id: ch.id, project_id: ch.project_id,
          sender_portal_sub_id: a.session.sub_id, sender_name: sender,
          kind: 'image', image_path: path,
        } as never).select().single();
        if (error) throw error;
        void stampPresentAtSend(a.db, a.session.tenant_id, ch.id, (msg as any)?.id);
        return NextResponse.json({ message: msg }, { status: 201 });
      }
      const { data: msg, error } = await a.db.from('radio_messages').insert({
        tenant_id: a.session.tenant_id, channel_id: ch.id, project_id: ch.project_id,
        sender_portal_sub_id: a.session.sub_id, sender_name: sender,
        kind: 'voice', audio_path: path, audio_duration_secs: durationSecs,
      } as never).select().single();
      if (error) throw error;
      // Transcription brain: fire-and-forget (env-gated inside; never blocks the send).
      void transcribeRadioVoice(a.db, (msg as any)?.id, path);
      void stampPresentAtSend(a.db, a.session.tenant_id, ch.id, (msg as any)?.id);
      return NextResponse.json({ message: msg }, { status: 201 });
    }

    const body = await req.json().catch(() => ({}));

    // R13 heard-by: a sub's device finished playing clips — record receipts
    // under the sub's portal identity. Tolerant pre-063; dedupe via the
    // partial unique index (insert errors ignored). Own sends never count.
    if (Array.isArray(body.receiptMessageIds)) {
      const ids = [...new Set(
        body.receiptMessageIds.filter((x: unknown) => typeof x === 'string' && x.length > 0 && !String(x).startsWith('local-')).slice(0, 25),
      )] as string[];
      let stored = 0;
      if (ids.length) {
        const { data: msgs } = await a.db.from('radio_messages')
          .select('id, tenant_id, channel_id, sender_portal_sub_id').in('id', ids);
        for (const m of ((msgs || []) as any[])) {
          if (m.tenant_id !== a.session.tenant_id || m.channel_id !== ch.id) continue;
          if (m.sender_portal_sub_id === a.session.sub_id) continue;
          try {
            const { error } = await a.db.from('radio_receipts').insert({
              tenant_id: a.session.tenant_id, channel_id: ch.id, message_id: m.id,
              portal_sub_id: a.session.sub_id, display_name: sender, action: 'played',
            } as never);
            if (!error) stored += 1;
          } catch { /* tolerant: receipts never fail the caller */ }
        }
      }
      return NextResponse.json({ ok: true, stored });
    }

    const text = String(body.body || '').trim();
    if (!text) return NextResponse.json({ error: 'body required' }, { status: 400 });
    const { data: msg, error } = await a.db.from('radio_messages').insert({
      tenant_id: a.session.tenant_id, channel_id: ch.id, project_id: ch.project_id,
      sender_portal_sub_id: a.session.sub_id, sender_name: sender, kind: 'text', body: text,
    } as never).select().single();
    if (error) throw error;
    // Translation brain: fire-and-forget (env-gated inside; never blocks the send).
    void translateRadioMessage(a.db, (msg as any)?.id, text);
    void stampPresentAtSend(a.db, a.session.tenant_id, ch.id, (msg as any)?.id);
    return NextResponse.json({ message: msg }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
