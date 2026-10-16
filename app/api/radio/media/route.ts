import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { createServerClient } from '@/lib/supabase-server';
import { createNotification } from '@/lib/notifications';
import { runInBackground } from '@/lib/background';
import { apiError } from '@/lib/api-error';

const BUCKET = 'project-files';
const MAX_BYTES = 50 * 1024 * 1024;
const ALLOWED = /\.(png|jpe?g|webp|heic|gif|pdf|mp4|mov|webm)$/i;

/**
 * Saguaro Radio — media sharing in channels (GroupTalk-parity).
 * POST multipart { channelId, file, caption? } — photos/PDFs/short video
 * posted into the talkgroup; renders inline (images) or as an open link.
 */
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'View');
  if (!g.ok) return g.res;
  const t = g.user.tenantId;
  try {
    const form = await req.formData();
    const channelId = String(form.get('channelId') || '');
    const caption = String(form.get('caption') || '').trim();
    const file = form.get('file') as File | null;
    if (!channelId || !file) return NextResponse.json({ error: 'channelId and file required' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File too large (50MB max)' }, { status: 413 });
    const safeName = String(file.name || 'share.jpg').replace(/[^\w.\-]+/g, '_');
    if (!ALLOWED.test(safeName)) return NextResponse.json({ error: 'Unsupported file type' }, { status: 415 });

    const db = createServerClient() as any;
    const { data: mem } = await db.from('radio_members').select('id').eq('tenant_id', t).eq('channel_id', channelId).eq('user_id', g.user.id).limit(1);
    if (!mem || !mem.length) return NextResponse.json({ error: 'Not a member of this channel' }, { status: 403 });
    const { data: ch } = await db.from('radio_channels').select('project_id, name').eq('tenant_id', t).eq('id', channelId).single();

    const path = `${t}/radio/${channelId}/${Date.now()}_${safeName}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await db.storage.from(BUCKET).upload(path, buffer, { contentType: file.type || 'application/octet-stream', upsert: false });
    if (upErr) throw upErr;

    const isImage = /\.(png|jpe?g|webp|heic|gif)$/i.test(safeName);
    const { data: msg, error } = await db.from('radio_messages').insert({
      tenant_id: t, channel_id: channelId, project_id: (ch as any)?.project_id ?? null,
      sender_user_id: g.user.id, sender_name: g.user.email || 'Team member',
      kind: 'image', image_path: path, body: caption || (isImage ? null : safeName),
    } as never).select().single();
    if (error) throw error;

    const { data: members } = await db.from('radio_members').select('user_id, monitoring').eq('tenant_id', t).eq('channel_id', channelId).not('user_id', 'is', null);
    runInBackground(Promise.all(((members || []) as any[])
      .filter((m) => m.user_id && m.user_id !== g.user.id && m.monitoring !== false)
      .map((m) => createNotification(t, m.user_id, 'radio_media', `Shared to ${(ch as any)?.name || 'Radio'}`, caption || safeName, `/app/radio?channel=${channelId}`, (ch as any)?.project_id ?? undefined))
    ), 'radio notify');

    return NextResponse.json({ message: msg }, { status: 201 });
  } catch (e) {
    return apiError('radio/media POST', e);
  }
}
