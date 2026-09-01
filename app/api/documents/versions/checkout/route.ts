import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';

import { apiError } from '@/lib/api-error';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * POST /api/documents/versions/checkout
 * Server-side check-out / check-in lock.
 *   { documentId, action: 'checkout' }  -> acquire the lock (fails 409 if held by another)
 *   { documentId, action: 'checkin'  }  -> release the lock (only the holder may release)
 */
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const documentId: string = (body.documentId || '').toString();
    const action: string = (body.action || '').toString();
    if (!documentId || !['checkout', 'checkin'].includes(action)) {
      return NextResponse.json({ error: 'documentId and action (checkout|checkin) required' }, { status: 400 });
    }

    const db = createServerClient() as any;
    const { data: doc, error } = await db
      .from('document_control')
      .select('id, checked_out_by, checked_out_by_name')
      .eq('id', documentId)
      .eq('tenant_id', user.tenantId)
      .single();
    if (error || !doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

    if (action === 'checkout') {
      if (doc.checked_out_by && doc.checked_out_by !== user.id) {
        return NextResponse.json(
          { error: `Already checked out by ${doc.checked_out_by_name || 'another user'}` },
          { status: 409 },
        );
      }
      const { error: uErr } = await db
        .from('document_control')
        .update({ checked_out_by: user.id, checked_out_by_name: user.email, checked_out_at: new Date().toISOString() })
        .eq('id', documentId)
        .eq('tenant_id', user.tenantId);
      if (uErr) throw uErr;
      return NextResponse.json({ ok: true, checkedOutBy: user.email });
    }

    // checkin
    if (doc.checked_out_by && doc.checked_out_by !== user.id) {
      return NextResponse.json(
        { error: `Only ${doc.checked_out_by_name || 'the holder'} can check this in` },
        { status: 409 },
      );
    }
    const { error: uErr } = await db
      .from('document_control')
      .update({ checked_out_by: null, checked_out_by_name: null, checked_out_at: null })
      .eq('id', documentId)
      .eq('tenant_id', user.tenantId);
    if (uErr) throw uErr;
    return NextResponse.json({ ok: true, checkedOutBy: null });
  } catch (err: any) {
    console.error('[documents/versions/checkout]', err?.message);
    return apiError('documents/versions/checkout', err, "Lock update failed", 500);
  }
}
