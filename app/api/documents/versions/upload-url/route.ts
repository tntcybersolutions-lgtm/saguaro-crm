import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';

import { apiError } from '@/lib/api-error';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/* eslint-disable @typescript-eslint/no-explicit-any */

const BUCKET = 'documents';

/**
 * POST /api/documents/versions/upload-url
 * Mint a short-lived SIGNED UPLOAD URL for the private `documents` bucket so the
 * browser can PUT the file bytes directly to storage (no getPublicUrl, no 4.5MB
 * serverless body cap). The object key is tenant-prefixed for RLS safety.
 *
 * Body: { fileName, documentId? }
 * Returns: { bucket, path, token, signedUrl }
 * The client uploads via supabase.storage.from(bucket).uploadToSignedUrl(path, token, file),
 * then calls POST /api/documents/versions with { path, ... } to record the version.
 */
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const rawName: string = (body.fileName || '').toString();
    if (!rawName.trim()) return NextResponse.json({ error: 'fileName is required' }, { status: 400 });
    const safeName = rawName.replace(/[^\w.\-() ]+/g, '_').slice(0, 180) || `file-${Date.now()}`;
    const scope = body.documentId ? String(body.documentId).replace(/[^\w-]/g, '') || 'doc' : 'new';
    const path = `${user.tenantId}/document-control/${scope}/${Date.now()}-${safeName}`;

    const db = createServerClient() as any;
    const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error) throw error;

    return NextResponse.json({ bucket: BUCKET, path, token: data.token, signedUrl: data.signedUrl });
  } catch (err: any) {
    console.error('[documents/versions/upload-url]', err?.message);
    return apiError('documents/versions/upload-url', err, "Failed to create upload URL", 500);
  }
}
