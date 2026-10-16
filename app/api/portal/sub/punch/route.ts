import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { signStoredUrl } from '@/lib/storage-signing';
import { must } from '@/lib/db-write';
import { apiError } from '@/lib/api-error';

const BUCKET = 'project-files';

async function authenticateSubPortal(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') || req.headers.get('x-portal-token');
  if (!token) return null;
  const db = createServerClient();
  const { data: session } = await db
    .from('portal_sub_sessions')
    .select('*')
    .eq('token', token)
    .eq('status', 'active')
    .single();
  return session;
}

/** GET — punch items on the sub's project (open first), photos signed. */
export async function GET(req: NextRequest) {
  try {
    const session = await authenticateSubPortal(req);
    if (!session) return NextResponse.json({ error: 'Invalid or expired portal token' }, { status: 401 });
    const db = createServerClient();

    const { data: items, error } = await db
      .from('portal_punch_items')
      .select('*')
      .eq('project_id', session.project_id!)
      .eq('tenant_id', session.tenant_id)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const signed = await Promise.all(
      (items || []).map(async (it) => {
        const urls = Array.isArray((it as { photo_urls?: unknown }).photo_urls) ? ((it as { photo_urls: string[] }).photo_urls) : [];
        return { ...it, photo_urls: await Promise.all(urls.map((u) => signStoredUrl(BUCKET, u, 3600).catch(() => u))) };
      }),
    );
    return NextResponse.json({ punch_items: signed });
  } catch (e) {
    return apiError('portal/sub/punch GET', e);
  }
}

/** POST — complete a punch item WITH photo proof (multipart: item_id, note?, photo?). */
export async function POST(req: NextRequest) {
  try {
    const session = await authenticateSubPortal(req);
    if (!session) return NextResponse.json({ error: 'Invalid or expired portal token' }, { status: 401 });
    const db = createServerClient();

    const form = await req.formData();
    const itemId = String(form.get('item_id') || '');
    const note = String(form.get('note') || '');
    const photo = form.get('photo') as File | null;
    if (!itemId) return NextResponse.json({ error: 'item_id required' }, { status: 400 });

    const { data: item } = await db
      .from('portal_punch_items')
      .select('*')
      .eq('id', itemId)
      .eq('tenant_id', session.tenant_id)
      .eq('project_id', session.project_id!)
      .single();
    if (!item) return NextResponse.json({ error: 'Punch item not found' }, { status: 404 });

    let photoUrl: string | null = null;
    if (photo && photo.size > 0) {
      const safe = (photo.name || 'proof.jpg').replace(/[^\w.\-]+/g, '_');
      const path = `${session.tenant_id}/projects/${session.project_id}/sub-portal/punch/${itemId}/${Date.now()}-${safe}`;
      const buf = Buffer.from(await photo.arrayBuffer());
      const { error: upErr } = await db.storage.from(BUCKET).upload(path, buf, { contentType: photo.type || 'image/jpeg', upsert: false });
      if (upErr) throw upErr;
      photoUrl = db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    }

    const photos = [...(((item as { photo_urls?: string[] }).photo_urls) || []), ...(photoUrl ? [photoUrl] : [])];
    const { error: updErr } = await db
      .from('portal_punch_items')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        photo_urls: photos,
        ...(note ? { client_signoff_notes: note } : {}),
      } as never)
      .eq('id', itemId)
      .eq('tenant_id', session.tenant_id);
    if (updErr) throw updErr;

    await must(db.from('portal_activity').insert({
      tenant_id: session.tenant_id,
      project_id: session.project_id,
      session_id: session.id,
      action: 'punch_completed',
      description: `Completed punch item${photoUrl ? ' (with photo)' : ''}`,
      metadata: { item_id: itemId, description: (item as { description?: string }).description, withPhoto: !!photoUrl, by: session.sub_company },
    } as never), 'portal_activity insert');

    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('portal/sub/punch POST', e, 'Could not complete the punch item. Please try again.');
  }
}
