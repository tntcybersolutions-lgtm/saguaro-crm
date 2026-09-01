import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';

import { apiError } from '@/lib/api-error';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/* eslint-disable @typescript-eslint/no-explicit-any */

const NEXT: Record<string, string> = { submit: 'Under Review', approve: 'Approved' };

/**
 * POST /api/documents/versions/approve
 * Advance a version through the review workflow and mirror the state onto the
 * parent document.
 *   { documentId, versionId, action: 'submit'  } -> Draft -> Under Review
 *   { documentId, versionId, action: 'approve' } -> Under Review -> Approved (stamps approver)
 */
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Documents', 'Full');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const documentId: string = (body.documentId || '').toString();
    const versionId: string = (body.versionId || '').toString();
    const action: string = (body.action || '').toString();
    const nextStatus = NEXT[action];
    if (!documentId || !versionId || !nextStatus) {
      return NextResponse.json({ error: 'documentId, versionId and action (submit|approve) required' }, { status: 400 });
    }

    const db = createServerClient() as any;
    const { data: ver, error } = await db
      .from('document_control_versions')
      .select('id, document_id, status')
      .eq('id', versionId)
      .eq('document_id', documentId)
      .eq('tenant_id', user.tenantId)
      .single();
    if (error || !ver) return NextResponse.json({ error: 'Version not found' }, { status: 404 });

    const patch: any = { status: nextStatus };
    if (action === 'approve') {
      patch.approved_by = user.email;
      patch.approved_at = new Date().toISOString();
    }
    const { error: vErr } = await db
      .from('document_control_versions')
      .update(patch)
      .eq('id', versionId)
      .eq('tenant_id', user.tenantId);
    if (vErr) throw vErr;

    const { error: dErr } = await db
      .from('document_control')
      .update({ status: nextStatus })
      .eq('id', documentId)
      .eq('tenant_id', user.tenantId);
    if (dErr) throw dErr;

    return NextResponse.json({ ok: true, status: nextStatus });
  } catch (err: any) {
    console.error('[documents/versions/approve]', err?.message);
    return apiError('documents/versions/approve', err, "Approval failed", 500);
  }
}
