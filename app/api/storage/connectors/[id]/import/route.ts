import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { makeProvider, loadConnectorCtx } from '@/lib/storage-providers/registry';
import { signStoredUrl } from '@/lib/storage-signing';
import { classifyKind } from '@/lib/filekind';

import { apiError } from '@/lib/api-error';
export const runtime = 'nodejs';
/* eslint-disable @typescript-eslint/no-explicit-any */

const BUCKET = 'project-files';

/**
 * Import an external file INTO the platform: download it from the provider, store
 * it in our project-files bucket, create a project_files row (so it shows in the
 * media library + iOS), and record the link. POST { path, projectId?, folder? }.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ctx = await loadConnectorCtx(params.id, user.tenantId);
  if (!ctx) return NextResponse.json({ error: 'Connector not found' }, { status: 404 });
  try {
    const { path, projectId, folder } = await req.json();
    if (!path) return NextResponse.json({ error: 'path required' }, { status: 400 });

    const provider = await makeProvider(ctx);
    const { bytes, name, mime } = await provider.download(path);

    const admin = createServerClient() as any;
    const safeName = (name || 'file').replace(/[^\w.\-() ]+/g, '_');
    const contentType = mime || 'application/octet-stream';
    const key = `${user.tenantId}/projects/${projectId || 'unfiled'}/imports/${Date.now()}-${safeName}`;
    const { error: upErr } = await admin.storage.from(BUCKET).upload(key, bytes, { contentType, upsert: false });
    if (upErr) throw new Error(upErr.message);
    const publicUrl = admin.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;

    const { data: row, error: rowErr } = await admin.from('project_files').insert({
      tenant_id: user.tenantId, project_id: projectId || null, file_name: name || safeName,
      file_url: publicUrl, file_size: bytes.length, file_type: contentType, mime_type: contentType,
      kind: classifyKind(contentType, safeName), storage_bucket: BUCKET, storage_path: key,
      category: folder || 'imported', folder: folder || null, uploaded_by: user.id, uploaded_by_name: user.email,
      is_current: true, version_number: 1,
    }).select('*').single();
    if (rowErr) throw new Error(rowErr.message);

    await admin.from('external_file_links').insert({
      tenant_id: user.tenantId, connector_id: ctx.id, file_id: row.id,
      external_path: path, direction: 'import', size_bytes: bytes.length,
    });

    const url = await signStoredUrl(BUCKET, key, 3600);
    return NextResponse.json({ file: { ...row, url, file_url: url } });
  } catch (err: any) {
    return apiError('storage/connectors/id/import', err, "Import failed", 502);
  }
}
