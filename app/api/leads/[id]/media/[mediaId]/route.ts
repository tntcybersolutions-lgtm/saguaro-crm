/**
 * DELETE /api/leads/[id]/media/[mediaId] — remove one deal file.
 *
 * The deal media hub could upload and download but never take a file back
 * (FOUND, 3 Oct). Bytes live in the private 'project-files' bucket under
 * deals/<leadId>/; deal_media is the index. Both go, in that order, scoped by
 * tenant and lead. Sales:Edit, like the upload.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

const BUCKET = 'project-files';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; mediaId: string }> }) {
  const g = await requirePermission(req, 'Sales', 'Edit');
  if (!g.ok) return g.res;
  const { id, mediaId } = await params;
  try {
    const db = createServerClient();
    // deal_media is not in the generated Database type (the list route has the same gap).
    const loose = db as unknown as { from: (t: string) => any };
    const { data: row, error } = await loose.from('deal_media').select('id, path')
      .eq('id', mediaId).eq('lead_id', id).eq('tenant_id', g.user.tenantId).maybeSingle();
    if (error) throw error;
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const path = (row as { path?: string | null }).path;
    if (path) {
      const { error: rmErr } = await db.storage.from(BUCKET).remove([path]);
      if (rmErr) throw rmErr;
    }
    const { error: delErr } = await loose.from('deal_media').delete().eq('id', mediaId).eq('tenant_id', g.user.tenantId);
    if (delErr) throw delErr;
    return NextResponse.json({ success: true, id: mediaId });
  } catch (e) {
    return apiError('leads/media/[mediaId]', e, 'Could not remove the file');
  }
}
