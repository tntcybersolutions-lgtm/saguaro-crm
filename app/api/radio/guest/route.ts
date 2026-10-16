import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { createServerClient } from '@/lib/supabase-server';
import { signStoredUrl } from '@/lib/storage-signing';
import { must } from '@/lib/db-write';
import { apiError } from '@/lib/api-error';

const BUCKET = 'project-files';
const MAX_BYTES = 25 * 1024 * 1024;
const AUDIO_OK = /\.(m4a|mp4|aac|mp3|wav|webm|ogg|caf)$/i;

/**
 * Saguaro Radio — guest sharing (GroupTalk "sharing" parity, simpler):
 *
 * Staff (authed):
 *   POST { channelId, label?, canTalk?, expiresDays? } -> create a guest link
 *   GET  ?channelId=  -> list the channel's guest links (for revoke UI)
 *   DELETE { linkId } -> revoke
 *
 * Guests (token, no account):
 *   GET  ?guestToken=&after= -> channel feed (signed media), label branding
 *   POST ?guestToken=  json {body} for text, multipart {file,durationSecs}
 *        for voice (only when the link allows talking)
 */
async function guest(db: any, token: string) {
  const { data } = await db.from('radio_guest_links')
    .select('*, radio_channels(id, name, project_id, tenant_id)')
    .eq('token', token).is('revoked_at', null).maybeSingle();
  const gl = data as any;
  if (!gl || !gl.radio_channels) return null;
  if (gl.expires_at && new Date(gl.expires_at).getTime() < Date.now()) return null;
  return gl;
}

export async function GET(req: NextRequest) {
  const db = createServerClient() as any;
  const guestToken = req.nextUrl.searchParams.get('guestToken');
  try {
    if (guestToken) {
      const gl = await guest(db, guestToken);
      if (!gl) return NextResponse.json({ error: 'Link expired or revoked' }, { status: 401 });
      const ch = gl.radio_channels;
      const after = req.nextUrl.searchParams.get('after');
      let q = db.from('radio_messages').select('*').eq('tenant_id', ch.tenant_id).eq('channel_id', ch.id);
      if (after) q = q.gt('created_at', after);
      const { data } = await q.order('created_at', { ascending: after ? true : false }).limit(100);
      const rows = ((data || []) as any[]);
      const messages = await Promise.all((after ? rows : rows.reverse()).map(async (m) => ({
        ...m,
        audio_url: m.audio_path ? await signStoredUrl(BUCKET, m.audio_path, 3600) : null,
        image_url: m.image_path ? await signStoredUrl(BUCKET, m.image_path, 3600) : null,
      })));
      return NextResponse.json({ channel: { id: ch.id, name: ch.name }, label: gl.label, canTalk: gl.can_talk !== false, messages });
    }

    const g = await requirePermission(req, 'Projects', 'View');
    if (!g.ok) return g.res;
    const channelId = req.nextUrl.searchParams.get('channelId');
    if (!channelId) return NextResponse.json({ error: 'channelId required' }, { status: 400 });
    const { data } = await db.from('radio_guest_links')
      .select('id, token, label, can_talk, expires_at, revoked_at, created_at')
      .eq('tenant_id', g.user.tenantId).eq('channel_id', channelId)
      .order('created_at', { ascending: false });
    return NextResponse.json({ links: data || [] });
  } catch (e) {
    return apiError('radio/guest GET', e);
  }
}

export async function POST(req: NextRequest) {
  const db = createServerClient() as any;
  const guestToken = req.nextUrl.searchParams.get('guestToken');
  try {
    if (guestToken) {
      const gl = await guest(db, guestToken);
      if (!gl) return NextResponse.json({ error: 'Link expired or revoked' }, { status: 401 });
      const ch = gl.radio_channels;
      const sender = gl.label || 'Guest';
      const ct = req.headers.get('content-type') || '';
      if (ct.includes('multipart/form-data')) {
        if (gl.can_talk === false) return NextResponse.json({ error: 'This link is listen-only' }, { status: 403 });
        const form = await req.formData();
        const file = form.get('file') as File | null;
        const durationSecs = Number(form.get('durationSecs')) || null;
        if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 });
        if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Audio too large' }, { status: 413 });
        // Same rule as the staff voice route: a guest's hold-to-talk clip is
        // renamed from its content type when the browser's blob name fails the
        // pattern — never 415 a live transmission over a filename.
        let safeName = String(file.name || 'clip.webm').replace(/[^\w.\-]+/g, '_');
        if (!AUDIO_OK.test(safeName)) {
          const ct = String(file.type || '').toLowerCase();
          const ext = ct.includes('webm') ? 'webm' : ct.includes('ogg') ? 'ogg'
            : ct.includes('wav') ? 'wav' : ct.includes('mpeg') || ct.includes('mp3') ? 'mp3'
            : ct.includes('aac') ? 'aac' : ct.includes('mp4') ? 'm4a' : 'webm';
          safeName = `clip.${ext}`;
        }
        const path = `${ch.tenant_id}/radio/${ch.id}/${Date.now()}_guest_${safeName}`;
        const buffer = Buffer.from(await file.arrayBuffer());
        const { error: upErr } = await db.storage.from(BUCKET).upload(path, buffer, { contentType: file.type || 'audio/webm', upsert: false });
        if (upErr) throw upErr;
        const { data: msg, error } = await db.from('radio_messages').insert({
          tenant_id: ch.tenant_id, channel_id: ch.id, project_id: ch.project_id,
          sender_name: `${sender} (guest)`, kind: 'voice', audio_path: path, audio_duration_secs: durationSecs,
        } as never).select().single();
        if (error) throw error;
        return NextResponse.json({ message: msg }, { status: 201 });
      }
      if (gl.can_talk === false) return NextResponse.json({ error: 'This link is listen-only' }, { status: 403 });
      const b = await req.json().catch(() => ({}));
      const text = String(b.body || '').trim();
      if (!text) return NextResponse.json({ error: 'body required' }, { status: 400 });
      const { data: msg, error } = await db.from('radio_messages').insert({
        tenant_id: ch.tenant_id, channel_id: ch.id, project_id: ch.project_id,
        sender_name: `${sender} (guest)`, kind: 'text', body: text,
      } as never).select().single();
      if (error) throw error;
      try { const { translateRadioMessage } = await import('@/lib/translate'); void translateRadioMessage(db, (msg as any)?.id, text); } catch {}
      return NextResponse.json({ message: msg }, { status: 201 });
    }

    const g = await requirePermission(req, 'Projects', 'Edit');
    if (!g.ok) return g.res;
    const b = await req.json().catch(() => ({}));
    if (!b.channelId) return NextResponse.json({ error: 'channelId required' }, { status: 400 });
    const { data: ch } = await db.from('radio_channels').select('id').eq('id', b.channelId).eq('tenant_id', g.user.tenantId).maybeSingle();
    if (!ch) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    const expires_at = b.expiresDays ? new Date(Date.now() + Math.max(1, Math.min(90, Number(b.expiresDays))) * 86400000).toISOString() : null;
    const { data: link, error } = await db.from('radio_guest_links').insert({
      tenant_id: g.user.tenantId, channel_id: b.channelId,
      label: String(b.label || '').trim() || null, can_talk: b.canTalk !== false,
      expires_at, created_by: g.user.id,
    } as never).select().single();
    if (error) throw error;
    return NextResponse.json({ link, url: `/portals/radio/${(link as any).token}` }, { status: 201 });
  } catch (e) {
    return apiError('radio/guest POST', e);
  }
}

export async function DELETE(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  try {
    const db = createServerClient() as any;
    const b = await req.json().catch(() => ({}));
    if (!b.linkId) return NextResponse.json({ error: 'linkId required' }, { status: 400 });
    await must(db.from('radio_guest_links').update({ revoked_at: new Date().toISOString() } as never)
      .eq('id', b.linkId).eq('tenant_id', g.user.tenantId), 'radio_guest_links update');
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError('radio/guest DELETE', e);
  }
}
