import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { createServerClient } from '@/lib/supabase-server';
import { createNotification } from '@/lib/notifications';
import { transcribeRadioVoice } from '@/lib/transcribe';
import { stampPresentAtSend } from '@/lib/radio-receipts';
import { must } from '@/lib/db-write';

const BUCKET = 'project-files';
const MAX_BYTES = 25 * 1024 * 1024; // 25MB — minutes of audio, not uploads gone wrong
const ALLOWED = /\.(m4a|mp4|aac|mp3|wav|webm|ogg|caf)$/i;

/**
 * Saguaro Radio — PTT voice.
 * POST multipart: channelId, durationSecs, file — stores the clip and drops a
 * 'voice' message on the channel; members' apps auto-play it (radio UX).
 */
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'View');
  if (!g.ok) return g.res;
  const t = g.user.tenantId;
  try {
    const form = await req.formData();
    const channelId = String(form.get('channelId') || '');
    const durationSecs = Number(form.get('durationSecs')) || null;
    const file = form.get('file') as File | null;
    if (!channelId || !file) return NextResponse.json({ error: 'channelId and file required' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Audio too large' }, { status: 413 });
    // Never bounce an authed PTT clip on its filename: browsers name blobs
    // from negotiated mimeTypes (codecs suffixes and all), and a rejected key
    // press reads as "the radio is broken" in the field. If the name fails the
    // pattern, rename from the content type instead of 415ing.
    let safeName = String(file.name || 'clip.m4a').replace(/[^\w.\-]+/g, '_');
    if (!ALLOWED.test(safeName)) {
      const ct = String(file.type || '').toLowerCase();
      const ext = ct.includes('webm') ? 'webm' : ct.includes('ogg') ? 'ogg'
        : ct.includes('wav') ? 'wav' : ct.includes('mpeg') || ct.includes('mp3') ? 'mp3'
        : ct.includes('aac') ? 'aac' : 'm4a';
      safeName = `clip.${ext}`;
    }

    const db = createServerClient() as any;
    const { data: mem } = await db.from('radio_members').select('id').eq('tenant_id', t).eq('channel_id', channelId).eq('user_id', g.user.id).limit(1);
    if (!mem || !mem.length) return NextResponse.json({ error: 'Not a member of this channel' }, { status: 403 });
    const { data: ch } = await db.from('radio_channels').select('project_id, name').eq('id', channelId).single();

    const path = `${t}/radio/${channelId}/${Date.now()}_${safeName}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await db.storage.from(BUCKET).upload(path, buffer, { contentType: file.type || 'audio/mp4', upsert: false });
    if (upErr) throw upErr;

    const { data: msg, error } = await db.from('radio_messages').insert({
      tenant_id: t, channel_id: channelId, project_id: (ch as any)?.project_id ?? null,
      sender_user_id: g.user.id, sender_name: g.user.email || 'Team member',
      kind: 'voice', audio_path: path, audio_duration_secs: durationSecs,
    } as never).select().single();
    if (error) throw error;

    // Transcription brain: fire-and-forget (env-gated inside; never blocks the send).
    void transcribeRadioVoice(db, (msg as any)?.id, path);

    // HEARD-BY (R13): snapshot who was live on the channel at send time.
    // Fire-and-forget; tolerant of the pre-063 schema.
    void stampPresentAtSend(db, t, channelId, (msg as any)?.id);

    // GROUP PATCHING: mirror the transmission onto patched channels (same clip).
    void (async () => {
      try {
        const { data: patches } = await db.from('radio_channel_patches')
          .select('channel_a, channel_b')
          .eq('tenant_id', t).is('released_at', null)
          .or(`channel_a.eq.${channelId},channel_b.eq.${channelId}`);
        for (const p of (patches || []) as any[]) {
          const other = p.channel_a === channelId ? p.channel_b : p.channel_a;
          const { data: och } = await db.from('radio_channels').select('project_id').eq('id', other).single();
          await must(db.from('radio_messages').insert({
            tenant_id: t, channel_id: other, project_id: (och as any)?.project_id ?? null,
            sender_user_id: g.user.id, sender_name: g.user.email || 'Team member',
            kind: 'voice', audio_path: path, audio_duration_secs: durationSecs, patched_from: channelId,
          } as never), 'radio_messages insert');
        }
      } catch { /* mirroring is best-effort */ }
    })();

    // Radio push — members hear about traffic immediately.
    const { data: members } = await db.from('radio_members').select('user_id, monitoring').eq('channel_id', channelId).not('user_id', 'is', null);
    Promise.all(((members || []) as any[])
      .filter((m) => m.user_id && m.user_id !== g.user.id && m.monitoring !== false)
      .map((m) => createNotification(t, m.user_id, 'radio_voice', `PTT — ${(ch as any)?.name || 'Radio'}`, `${g.user.email || 'Team member'} · ${durationSecs ? Math.round(durationSecs) + 's' : 'voice'}`, `/app/radio?channel=${channelId}`, (ch as any)?.project_id ?? undefined))
    ).catch(() => {});

    return NextResponse.json({ message: msg }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
