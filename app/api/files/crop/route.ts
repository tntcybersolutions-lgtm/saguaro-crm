import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { signStoredUrl } from '@/lib/storage-signing';
import { cropAndRotate, type CropRect } from '@/lib/blueprint-processor';

import { apiError } from '@/lib/api-error';
export const runtime = 'nodejs';
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Server-side image crop/rotate for the media library (both surfaces can call it).
 * POST { fileId, cropRect?:{left,top,width,height}, rotate? } → edits the stored
 * object in place (new key, old removed — no orphan), updates dimensions. Original
 * bytes are replaced; use the client-side "duplicate first" if you need to keep it.
 */
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { fileId, cropRect, rotate } = (await req.json()) as { fileId: string; cropRect?: CropRect; rotate?: number };
    if (!fileId) return NextResponse.json({ error: 'fileId required' }, { status: 400 });

    const admin = createServerClient() as any;
    const { data: f } = await admin.from('project_files').select('*').eq('id', fileId).eq('tenant_id', user.tenantId).single();
    if (!f) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const bucket = (f as any).storage_bucket || 'project-files';
    const path = (f as any).storage_path;
    if (!path) return NextResponse.json({ error: 'File has no storage path' }, { status: 400 });

    const { data: blob, error: dlErr } = await admin.storage.from(bucket).download(path);
    if (dlErr || !blob) return NextResponse.json({ error: 'Could not read the original' }, { status: 500 });
    const inBuf = Buffer.from(await blob.arrayBuffer());

    const edited = await cropAndRotate(inBuf, cropRect || null, rotate || null);
    if (!edited) return NextResponse.json({ error: 'Image editing is unavailable on the server' }, { status: 500 });

    const dir = path.slice(0, path.lastIndexOf('/') + 1);
    const base = ((f as any).file_name || 'image').replace(/\.[^.]+$/, '').replace(/[^\w.\-() ]+/g, '_');
    const newPath = `${dir}${Date.now()}-${base}-edited.jpg`;
    const { error: upErr } = await admin.storage.from(bucket).upload(newPath, edited.buffer, { contentType: 'image/jpeg', upsert: false });
    if (upErr) return apiError('files/crop', upErr);
    await admin.storage.from(bucket).remove([path]).catch(() => {});

    const { data: updated, error: updErr } = await admin.from('project_files').update({
      storage_path: newPath, mime_type: 'image/jpeg', file_type: 'image/jpeg', kind: 'image',
      width: edited.width ?? null, height: edited.height ?? null, file_size: edited.buffer.length,
      updated_at: new Date().toISOString(),
    }).eq('id', fileId).eq('tenant_id', user.tenantId).select('*').single();
    if (updErr) throw updErr;

    const url = await signStoredUrl(bucket, newPath, 3600);
    return NextResponse.json({ file: { ...(updated as any), url, file_url: url } });
  } catch (err: any) {
    return apiError('files/crop', err, "Crop failed", 500);
  }
}
