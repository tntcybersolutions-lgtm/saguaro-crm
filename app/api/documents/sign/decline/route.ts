import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { onDeclined, SIGNATURE_EVENT_COLUMNS, type SignatureRow } from '@/lib/esign-events';

export const runtime = 'nodejs';

/**
 * POST /api/documents/sign/decline — the signer says no, from the signing link.
 * Body: { token, reason? }. Token-authenticated like verify/complete (the
 * signer has no login). Marks the request and signature declined, and for a
 * proposal marks it declined with the reason; the sender is notified
 * (lib/esign-events).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const token = typeof body.token === 'string' ? body.token : '';
  const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 2000) : null;
  if (!token) return NextResponse.json({ error: 'token is required' }, { status: 400 });

  const db = createServerClient();
  const { data: request, error: reqErr } = await db
    .from('document_signature_requests')
    .select('id, signature_id, status, expires_at')
    .eq('token', token)
    .maybeSingle();
  if (reqErr) return apiError('documents/sign/decline', reqErr);
  if (!request || !request.signature_id) return NextResponse.json({ error: 'Invalid link' }, { status: 404 });
  if (request.status === 'completed') return NextResponse.json({ error: 'This is already signed.' }, { status: 400 });
  if (request.status === 'declined') return NextResponse.json({ error: 'This was already declined.' }, { status: 400 });
  if (request.expires_at && new Date(request.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This link has expired' }, { status: 410 });
  }

  const now = new Date().toISOString();
  try {
    const { error: rErr } = await db
      .from('document_signature_requests')
      .update({ status: 'declined', declined_at: now, decline_reason: reason })
      .eq('id', request.id);
    if (rErr) throw rErr;
    const { data: sig, error: sErr } = await db
      .from('document_signatures')
      .update({ status: 'declined', notes: reason })
      .eq('id', request.signature_id)
      .select(SIGNATURE_EVENT_COLUMNS)
      .maybeSingle();
    if (sErr) throw sErr;
    if (sig) await onDeclined(db, sig as unknown as SignatureRow, reason);
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('documents/sign/decline', e, 'Your answer could not be recorded. Please try the link again.');
  }
}
