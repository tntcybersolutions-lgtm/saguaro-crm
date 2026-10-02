import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { signUrl } from '@/lib/storage-signing';

/**
 * Deal media hub — files/photos/docs/videos attached to one deal (lead).
 *
 * Bytes go to the existing PRIVATE 'project-files' bucket under
 * deals/<leadId>/; deal_media is the index. GET lists + signs each object for
 * download ("up = down" — what you upload is what you get back, in place).
 * POST takes a multipart upload. Reads need Sales:View, writes Sales:Edit;
 * both tenant-scoped, and the lead's tenant ownership is checked first.
 */
export const runtime = 'nodejs';
export const maxDuration = 60;
const BUCKET = 'project-files';

async function assertLead(db: ReturnType<typeof createServerClient>, id: string, tenantId: string) {
  const { data } = await db.from('lead_pipeline').select('id').eq('id', id).eq('tenant_id', tenantId).maybeSingle();
  return !!data;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Sales', 'View');
  if (!g.ok) return g.res;
  const { id } = await params;
  try {
    const db = createServerClient();
    if (!(await assertLead(db, id, g.user.tenantId))) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

    const { data, error } = await db.from('deal_media').select('*')
      .eq('tenant_id', g.user.tenantId).eq('lead_id', id).order('created_at', { ascending: false });
    if (error) throw error;

    const media = await Promise.all((data ?? []).map(async (m: any) => ({
      id: m.id, name: m.name, content_type: m.content_type, size_bytes: m.size_bytes,
      created_at: m.created_at,
      url: await signUrl(`/storage/v1/object/public/${BUCKET}/${m.path}`, 3600),
    })));
    return NextResponse.json({ media });
  } catch (e) {
    return apiError('leads/media', e, 'Could not load the deal files');
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Sales', 'Edit');
  if (!g.ok) return g.res;
  const { id } = await params;
  try {
    const db = createServerClient();
    if (!(await assertLead(db, id, g.user.tenantId))) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

    const form = await req.formData();
    const file = (form.get('file') ?? form.get('upload')) as File | null;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const safeName = (file.name || `file-${Date.now()}`).replace(/[^\w.\-]+/g, '_').slice(0, 120);
    const path = `deals/${id}/${Date.now()}-${safeName}`;
    const bytes = Buffer.from(await file.arrayBuffer());

    const { error: upErr } = await db.storage.from(BUCKET).upload(path, bytes, {
      contentType: file.type || 'application/octet-stream',
    });
    if (upErr) return apiError('leads/media', upErr, 'Upload failed');

    const { data: row, error } = await db.from('deal_media').insert({
      tenant_id: g.user.tenantId, lead_id: id, name: safeName, path,
      content_type: file.type || null, size_bytes: bytes.length, uploaded_by: g.user.id,
    } as never).select().single();
    if (error) {
      // No row would orphan the object — remove it so a failed upload leaves nothing.
      await db.storage.from(BUCKET).remove([path]).then(() => {}, () => {});
      return apiError('leads/media', error, 'Could not save the file');
    }

    const url = await signUrl(`/storage/v1/object/public/${BUCKET}/${path}`, 3600);
    return NextResponse.json({ media: { id: (row as any).id, name: safeName, content_type: file.type, size_bytes: bytes.length, created_at: (row as any).created_at, url } }, { status: 201 });
  } catch (e) {
    return apiError('leads/media', e, 'Could not upload the file');
  }
}
