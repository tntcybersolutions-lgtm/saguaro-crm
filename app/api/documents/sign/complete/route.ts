import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

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

  // Get IP address and user agent from headers
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown';
  const userAgent = req.headers.get('user-agent') || 'unknown';

  const now = new Date().toISOString();

  // Upload signature data as a base64 URL (stored directly — in production you'd upload to storage)
  const signatureUrl = signature_data;

  // Update document_signatures
  const { error: sigErr } = await db
    .from('document_signatures')
    .update({
      status: 'signed',
      signature_url: signatureUrl,
      signed_at: now,
      ip_address: ip,
      user_agent: userAgent,
    })
    .eq('id', request.signature_id);

  if (sigErr) {
    return NextResponse.json({ error: sigErr.message }, { status: 500 });
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
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Auto-update linked lien_waiver if this is a lien_waiver signature
  try {
    const { data: sig } = await db
      .from('document_signatures')
      .select('doc_type, pdf_url, signer_name')
      .eq('id', request.signature_id)
      .single();

    if (sig && sig.doc_type === 'lien_waiver' && sig.pdf_url) {
      // Find the lien waiver by matching pdf_url and pending status
      await db
        .from('lien_waivers')
        .update({
          status: 'signed',
          signed_at: now,
          signed_by: sig.signer_name || 'E-Signature',
          signer_name: sig.signer_name || null,
        })
        .eq('pdf_url', sig.pdf_url)
        .eq('status', 'pending');
    }
  } catch { /* Non-fatal: lien waiver auto-update is best-effort */ }

  return NextResponse.json({ success: true });
}
