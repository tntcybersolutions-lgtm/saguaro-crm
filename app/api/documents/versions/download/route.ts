import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';

import { apiError } from '@/lib/api-error';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/* eslint-disable @typescript-eslint/no-explicit-any */

const BUCKET = 'documents';

/**
 * POST /api/documents/versions/download
 * Return a short-lived SIGNED URL for a specific version's object in the private
 * `documents` bucket. Never uses getPublicUrl. Tenant-scoped: the version must
 * belong to the caller's tenant.
 *
 * Body: { versionId }  ->  { url, fileName }
 */
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const versionId: string = (body.versionId || '').toString();
    if (!versionId) return NextResponse.json({ error: 'versionId is required' }, { status: 400 });

    const db = createServerClient() as any;
    const { data: ver, error } = await db
      .from('document_control_versions')
      .select('file_path, file_name')
      .eq('id', versionId)
      .eq('tenant_id', user.tenantId)
      .single();
    if (error || !ver) return NextResponse.json({ error: 'Version not found' }, { status: 404 });

    const { data: signed, error: sErr } = await db.storage
      .from(BUCKET)
      .createSignedUrl(ver.file_path, 300, { download: ver.file_name });
    if (sErr || !signed?.signedUrl) throw sErr || new Error('Could not sign URL');

    return NextResponse.json({ url: signed.signedUrl, fileName: ver.file_name });
  } catch (err: any) {
    console.error('[documents/versions/download]', err?.message);
    return apiError('documents/versions/download', err, "Failed to create download URL", 500);
  }
}
