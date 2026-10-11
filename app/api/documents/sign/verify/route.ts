import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { must } from '@/lib/db-write';
import { onFirstViewed, SIGNATURE_EVENT_COLUMNS, type SignatureRow } from '@/lib/esign-events';

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
    .select('id, signature_id, status, message, expires_at, sent_at, viewed_at, view_count')
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
  if (request.status === 'declined') {
    return NextResponse.json({ valid: false, error: 'This was declined — ask the sender for a new link if that was a mistake.' }, { status: 400 });
  }

  // signature_id is nullable on the request row — no linked record means
  // there is nothing to verify against.
  if (!request.signature_id) {
    return NextResponse.json({ valid: false, error: 'Signature record not found' }, { status: 404 });
  }

  // Get the associated signature record with doc info
  const { data: signature, error: sigErr } = await db
    .from('document_signatures')
    .select(`${SIGNATURE_EVENT_COLUMNS}, pdf_url, signer_email, signer_company, signer_role, status`)
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
    await must(db
      .from('document_signatures')
      .update({ status: 'viewed' })
      .eq('id', signature.id), 'document_signatures write');
  }

  /* Opened tracking: when, and how many times. The first open tells the
     sender (and stamps a proposal's viewed_at) — lib/esign-events. */
  const now = new Date().toISOString();
  const firstView = !request.viewed_at;
  await must(db
    .from('document_signature_requests')
    .update({ viewed_at: request.viewed_at || now, last_viewed_at: now, view_count: (Number(request.view_count) || 0) + 1 })
    .eq('id', request.id), 'document_signature_requests write');
  // Telling the sender never stands between the signer and the document.
  if (firstView) {
    try { await onFirstViewed(db, signature as unknown as SignatureRow); }
    catch (e) { console.error('[documents/sign/verify] first-view step failed', e); }
  }

  /* A proposal is signed on its own terms: the page shows these when there is no PDF. */
  let proposal: Record<string, unknown> | null = null;
  if (signature.doc_type === 'proposal' && signature.source_id) {
    const { data: prop } = await db
      .from('proposals')
      .select('title, proposal_number, amount, total_amount, introduction, description, payment_terms, exclusions, valid_until, client_name')
      .eq('id', signature.source_id)
      .eq('tenant_id', signature.tenant_id)
      .maybeSingle();
    if (prop) {
      const p = prop as Record<string, unknown>;
      proposal = {
        title: p.title,
        number: p.proposal_number,
        amount: Number(p.amount) || Number(p.total_amount) || 0,
        introduction: p.introduction || null,
        scope: p.description || null,
        payment_terms: p.payment_terms || null,
        exclusions: p.exclusions || null,
        valid_until: p.valid_until || null,
      };
    }
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
    proposal,
  });
}
