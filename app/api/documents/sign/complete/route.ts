import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { token, signature_data } = body as { token?: string; signature_data?: string };

  if (!token || !signature_data) {
    return NextResponse.json({ error: 'Token and signature_data required' }, { status: 400 });
  }

  const db = createServerClient();

  // Look up the signature request by token
  const { data: request, error: reqErr } = await db
    .from('document_signature_requests')
    .select('id, signature_id, status, expires_at')
    .eq('token', token)
    .single();

  if (reqErr || !request) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 404 });
  }

  if (request.status === 'completed') {
    return NextResponse.json({ error: 'Document already signed' }, { status: 400 });
  }

  if (request.expires_at && new Date(request.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Signing link has expired' }, { status: 410 });
  }

  // Get IP address from headers
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown';

  const now = new Date().toISOString();

  // Upload signature data as a base64 URL (stored directly — in production you'd upload to storage)
  const signatureUrl = signature_data;

  // signature_id is nullable on the request row — a request with no linked
  // signature record can't be completed.
  if (!request.signature_id) {
    return NextResponse.json({ error: 'Signature record not found' }, { status: 404 });
  }

  // Update document_signatures
  const { error: sigErr } = await db
    .from('document_signatures')
    .update({
      status: 'signed',
      signature_url: signatureUrl,
      signed_at: now,
      ip_address: ip,
    })
    .eq('id', request.signature_id);

  if (sigErr) {
    return apiError('documents/sign/complete', sigErr, 'Your signature could not be recorded. Please try the link again.');
  }

  // Update document_signature_requests
  const { error: updateErr } = await db
    .from('document_signature_requests')
    .update({
      status: 'completed',
      completed_at: now,
    })
    .eq('id', request.id);

  if (updateErr) {
    return apiError('documents/sign/complete', updateErr, 'Your signature could not be recorded. Please try the link again.');
  }

  return NextResponse.json({ success: true });
}
