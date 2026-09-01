import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';

import { apiError } from '@/lib/api-error';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/* eslint-disable @typescript-eslint/no-explicit-any */

const ROLES = ['viewer', 'editor', 'admin'];

/**
 * Per-document access grants.
 *   POST   { documentId, grantee, role }   -> grant / update (upsert on document+grantee)
 *   DELETE { grantId }                      -> revoke
 * Both tenant-scoped via getUser + explicit .eq(tenant_id).
 */
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const documentId: string = (body.documentId || '').toString();
    const grantee: string = (body.grantee || '').toString().trim();
    const role: string = ROLES.includes(body.role) ? body.role : 'viewer';
    if (!documentId || !grantee) return NextResponse.json({ error: 'documentId and grantee required' }, { status: 400 });

    const db = createServerClient() as any;
    // Confirm the document is in the caller's tenant before granting.
    const { data: doc } = await db
      .from('document_control')
      .select('id')
      .eq('id', documentId)
      .eq('tenant_id', user.tenantId)
      .single();
    if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

    const { data: grant, error } = await db
      .from('document_control_grants')
      .upsert(
        { tenant_id: user.tenantId, document_id: documentId, grantee, role, created_by: user.id },
        { onConflict: 'document_id,grantee' },
      )
      .select('*')
      .single();
    if (error) throw error;

    return NextResponse.json({ grant: { userId: grant.id, name: grant.grantee, role: grant.role } });
  } catch (err: any) {
    console.error('[documents/versions/access POST]', err?.message);
    return apiError('documents/versions/access', err, "Failed to grant access", 500);
  }
}

export async function DELETE(req: NextRequest) {
  const g = await requirePermission(req, 'Documents', 'Full');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { searchParams } = new URL(req.url);
    const grantId = searchParams.get('grantId');
    if (!grantId) return NextResponse.json({ error: 'grantId required' }, { status: 400 });
    const db = createServerClient() as any;
    const { error } = await db
      .from('document_control_grants')
      .delete()
      .eq('id', grantId)
      .eq('tenant_id', user.tenantId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[documents/versions/access DELETE]', err?.message);
    return apiError('documents/versions/access', err, "Failed to revoke access", 500);
  }
}
