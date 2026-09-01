import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { makeProvider, loadConnectorCtx } from '@/lib/storage-providers/registry';

import { apiError } from '@/lib/api-error';
export const runtime = 'nodejs';
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Export a platform file OUT to the external store: download our bytes, push them
 * to the provider, record the link. POST { fileId, destFolder? }.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ctx = await loadConnectorCtx(params.id, user.tenantId);
  if (!ctx) return NextResponse.json({ error: 'Connector not found' }, { status: 404 });
  try {
    const { fileId, destFolder } = await req.json();
    if (!fileId) return NextResponse.json({ error: 'fileId required' }, { status: 400 });
    const admin = createServerClient() as any;
    const { data: f } = await admin.from('project_files').select('*').eq('id', fileId).eq('tenant_id', user.tenantId).single();
    if (!f) return NextResponse.json({ error: 'File not found' }, { status: 404 });
    if (!f.storage_path) return NextResponse.json({ error: 'File has no stored object to export' }, { status: 400 });

    const { data: blob, error: dlErr } = await admin.storage.from(f.storage_bucket || 'project-files').download(f.storage_path);
    if (dlErr || !blob) throw new Error('Could not read the file');
    const bytes = Buffer.from(await blob.arrayBuffer());

    const provider = await makeProvider(ctx);
    const res = await provider.upload(destFolder ?? null, f.file_name || 'file', bytes, f.mime_type || f.file_type || undefined);

    await admin.from('external_file_links').insert({
      tenant_id: user.tenantId, connector_id: ctx.id, file_id: f.id,
      external_path: res.path, external_id: res.externalId || null, direction: 'export', size_bytes: bytes.length,
    });
    return NextResponse.json({ ok: true, external_path: res.path });
  } catch (err: any) {
    return apiError('storage/connectors/id/export', err, "Export failed", 502);
  }
}
