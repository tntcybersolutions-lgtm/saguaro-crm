import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { signStoredUrl } from '@/lib/storage-signing';

import { apiError } from '@/lib/api-error';
export const runtime = 'nodejs';
/* eslint-disable @typescript-eslint/no-explicit-any */

// project_files' new media columns + file_shares post-date the generated Database
// types — use an untyped service client (same pattern as the fleet routes).
async function loadFile(admin: any, id: string, tenantId: string) {
  const { data } = await admin.from('project_files').select('*').eq('id', id).eq('tenant_id', tenantId).single();
  return data as any;
}

/**
 * PUT = rename / move / relink. `folder` is a logical move (metadata). A rename
 * also moves the underlying storage object so its key matches (best-effort — the
 * DB name always updates even if the object move fails). Restore via {restore:true}.
 */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const admin = createServerClient() as any;
    const f = await loadFile(admin, params.id, user.tenantId);
    if (!f) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const body = await req.json().catch(() => ({}));
    const patch: any = { updated_at: new Date().toISOString() };

    if (typeof body.folder === 'string') patch.folder = body.folder || null;
    if (typeof body.category === 'string') patch.category = body.category || null;
    if (typeof body.entity_type === 'string') { patch.entity_type = body.entity_type || null; patch.entity_id = body.entity_id || null; }
    if (body.restore === true) patch.deleted_at = null;

    // Rename: update display name + move the storage object to a matching key.
    if (typeof body.file_name === 'string' && body.file_name.trim() && body.file_name !== f.file_name) {
      patch.file_name = body.file_name.trim();
      const bucket = f.storage_bucket || 'project-files';
      if (f.storage_path) {
        const dir = f.storage_path.slice(0, f.storage_path.lastIndexOf('/') + 1);
        const safe = body.file_name.trim().replace(/[^\w.\-() ]+/g, '_');
        const newPath = `${dir}${Date.now()}-${safe}`;
        const { error: mvErr } = await admin.storage.from(bucket).move(f.storage_path, newPath);
        if (!mvErr) patch.storage_path = newPath;
      }
    }

    const { data: updated, error } = await admin.from('project_files').update(patch).eq('id', params.id).eq('tenant_id', user.tenantId).select('*').single();
    if (error) throw error;
    const url = await signStoredUrl(updated.storage_bucket || 'project-files', updated.storage_path || updated.file_url, 3600);
    return NextResponse.json({ file: { ...updated, url, file_url: url } });
  } catch (err: any) {
    return apiError('files/id', err, "Update failed", 500);
  }
}

/**
 * DELETE = soft by default (deleted_at, keeps the object for restore). `?hard=1`
 * removes the storage object first, THEN the row — closing the orphaned-object
 * gap the audit found across the platform.
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requirePermission(req, 'Documents', 'Full');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const admin = createServerClient() as any;
    const hard = new URL(req.url).searchParams.get('hard') === '1';
    const f = await loadFile(admin, params.id, user.tenantId);
    if (!f) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (hard) {
      if (f.storage_path) await admin.storage.from(f.storage_bucket || 'project-files').remove([f.storage_path]);
      const { error } = await admin.from('project_files').delete().eq('id', params.id).eq('tenant_id', user.tenantId);
      if (error) throw error;
      return NextResponse.json({ deleted: true, hard: true });
    }
    const { error } = await admin.from('project_files').update({ deleted_at: new Date().toISOString() }).eq('id', params.id).eq('tenant_id', user.tenantId);
    if (error) throw error;
    return NextResponse.json({ deleted: true, hard: false });
  } catch (err: any) {
    return apiError('files/id', err, "Delete failed", 500);
  }
}
