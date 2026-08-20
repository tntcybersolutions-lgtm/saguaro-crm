import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');

  if (!token) {
    return NextResponse.json({ valid: false, error: 'Token required' }, { status: 400 });
  }

  const db = createServerClient();

  // Look up the request by token
  const { data: request, error: reqErr } = await db
    .from('document_signature_requests')
    .select('id, signature_id, status, message, expires_at, sent_at')
    .eq('token', token)
    .single();

  if (reqErr || !request) {
    return NextResponse.json({ valid: false, error: 'Invalid token' }, { status: 404 });
  }

  // Check if expired
  if (request.expires_at && new Date(request.expires_at) < new Date()) {
    return NextResponse.json({ valid: false, error: 'Token expired' }, { status: 410 });
  }

  // Check if already completed
  if (request.status === 'completed') {
    return NextResponse.json({ valid: false, error: 'Already signed' }, { status: 400 });
  }

  // Get the associated signature record with doc info
  const { data: signature, error: sigErr } = await db
    .from('document_signatures')
    .select('id, doc_title, doc_type, pdf_url, signer_name, signer_email, signer_company, signer_role, status, tenant_id')
    .eq('id', request.signature_id)
    .single();

  if (sigErr || !signature) {
    return NextResponse.json({ valid: false, error: 'Signature record not found' }, { status: 404 });
  }

  // Get company name from tenant
  let companyName = '';
  if (signature.tenant_id) {
    const { data: tenant } = await db
      .from('tenants')
      .select('name, settings')
      .eq('id', signature.tenant_id)
      .single();
    const t = tenant as any;
    companyName = t?.settings?.company_name || t?.name || '';
  }

  // Mark as viewed if still pending
  if (signature.status === 'pending') {
    await db
      .from('document_signatures')
      .update({ status: 'viewed' })
      .eq('id', signature.id);
  }

  return NextResponse.json({
    valid: true,
    signature: {
      id: signature.id,
      doc_title: signature.doc_title,
      doc_type: signature.doc_type,
      pdf_url: signature.pdf_url,
      signer_name: signature.signer_name,
      signer_email: signature.signer_email,
      signer_company: signature.signer_company,
      signer_role: signature.signer_role,
    },
    request: {
      id: request.id,
      message: request.message,
      sent_at: request.sent_at,
    },
    company_name: companyName,
  });
}
