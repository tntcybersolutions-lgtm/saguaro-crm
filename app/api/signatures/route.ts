import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { must } from '@/lib/db-write';
import { apiError } from '@/lib/api-error';

// GET - List signature requests for a project
export async function GET(req: NextRequest) {
  try {
    // Auth + tenant scope — service-role bypasses RLS. Previously this listed
    // signature requests (and joined signatures) for ANY project_id/document_id
    // with no auth and no tenant filter, leaking every tenant's e-sign records.
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createServerClient();
    const projectId = req.nextUrl.searchParams.get('projectId');
    const documentId = req.nextUrl.searchParams.get('documentId');

    let query = supabase
      .from('document_signature_requests')
      .select('*, document_signatures(*)')
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false });

    if (projectId) query = query.eq('project_id', projectId);
    if (documentId) query = query.eq('document_id', documentId);

    const { data, error } = await query.limit(50);
    if (error) throw error;

    return NextResponse.json({ data: data || [] });
  } catch (e) {
    return apiError('signatures GET', e, 'Failed to load signatures');
  }
}

// POST - Create a signature request (send document for signing)
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createServerClient();
    const body = await req.json();
    const { projectId, documentId, documentType, documentUrl, documentTitle, recipientEmail, recipientName, recipientRole, message } = body;

    if (!projectId || !recipientEmail) {
      return NextResponse.json({ error: 'projectId and recipientEmail are required' }, { status: 400 });
    }

    const docType = documentType || 'general';
    const docTitle = documentTitle || `${docType} document`;

    // document_signature_requests.signature_id is NOT NULL and FKs to
    // document_signatures(id), so create the parent signature row first.
    const { data: sig, error: sigErr } = await supabase
      .from('document_signatures')
      .insert({
        tenant_id: user.tenantId,
        project_id: projectId,
        document_id: documentId || null,
        doc_type: docType,
        doc_title: docTitle,
        pdf_url: documentUrl || null,
        signer_name: recipientName || recipientEmail,
        signer_email: recipientEmail,
        signer_role: recipientRole || 'signer',
        status: 'pending',
        sent_by: user.id,
        sent_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (sigErr) throw sigErr;

    // Create signature request
    const { data: sigReq, error: reqErr } = await supabase
      .from('document_signature_requests')
      .insert({
        tenant_id: user.tenantId,
        signature_id: sig.id,
        project_id: projectId,
        document_id: documentId || null,
        document_type: docType,
        document_url: documentUrl || null,
        sent_by: user.id,
        recipient_email: recipientEmail,
        recipient_name: recipientName || '',
        recipient_role: recipientRole || 'signer',
        message: message || '',
        status: 'pending',
        sent_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
      })
      .select()
      .single();

    if (reqErr) throw reqErr;

    // Log to audit trail (fire-and-forget)
    try {
      await must(supabase.from('activity_log').insert({
        tenant_id: user.tenantId,
        user_id: user.id,
        project_id: projectId,
        action: 'signature_requested',
        entity_type: 'document_signature_request',
        entity_id: sigReq.id,
        details: { recipientEmail, documentType },
      }), 'activity_log insert');
    } catch { /* non-fatal */ }

    return NextResponse.json({ success: true, data: sigReq });
  } catch (err: unknown) {
    return apiError('signatures', err, 'Failed to create signature request');
  }
}

/**
 * PATCH - Sign a document (record signature)
 *
 * THIS HANDLER HAD NO AUTH. GET and POST in this same file both call
 * getUser(); PATCH did not, and it takes requestId straight from the body.
 * Anyone who knew or guessed a signature-request id could record a signature
 * against it and flip the document to 'signed' -- on a legal document, from
 * the open internet, with no session. The file "had auth". The handler that
 * mattered did not, which is exactly what a file-wide check cannot see.
 *
 * External signers are served by the token-validated /api/documents/sign
 * routes, where the link IS the credential. This one is internal, so it takes
 * a session and every query is scoped to that session's tenant.
 */
export async function PATCH(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const body = await req.json();
    const { requestId, signatureData, signerName, signerEmail, signerIp } = body;

    if (!requestId || !signatureData) {
      return NextResponse.json({ error: 'requestId and signatureData are required' }, { status: 400 });
    }

    // Get the request
    const { data: sigReq } = await supabase
      .from('document_signature_requests')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .eq('id', requestId)
      .single();

    if (!sigReq) return NextResponse.json({ error: 'Signature request not found' }, { status: 404 });
    if (sigReq.status === 'signed') return NextResponse.json({ error: 'Already signed' }, { status: 400 });
    if (!sigReq.signature_id) return NextResponse.json({ error: 'Signature record not found' }, { status: 404 });

    // doc_type / doc_title are NOT NULL on document_signatures; pull them from
    // the parent signature record (the document being signed) referenced by the request.
    const { data: parentSig } = await supabase
      .from('document_signatures')
      .select('doc_type, doc_title')
      .eq('tenant_id', user.tenantId)
      .eq('id', sigReq.signature_id)
      .single();

    // Upload signature image to storage
    const sigBuffer = Buffer.from(signatureData.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const sigPath = `${sigReq.project_id}/signatures/${requestId}.png`;

    await supabase.storage.from('blueprints').upload(sigPath, sigBuffer, {
      contentType: 'image/png',
      upsert: true,
    });

    const { data: { publicUrl: sigUrl } } = supabase.storage.from('blueprints').getPublicUrl(sigPath);

    // Record the signature
    const { data: sig, error: sigErr } = await supabase
      .from('document_signatures')
      .insert({
        tenant_id: sigReq.tenant_id,
        request_id: requestId,
        document_id: sigReq.document_id,
        doc_type: parentSig?.doc_type || sigReq.document_type || 'general',
        doc_title: parentSig?.doc_title || `${sigReq.document_type || 'general'} document`,
        signer_name: signerName || sigReq.recipient_name,
        signer_email: signerEmail || sigReq.recipient_email,
        signer_ip: signerIp || '',
        signature_url: sigUrl,
        signed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (sigErr) throw sigErr;

    // Update request status
    await must(supabase
      .from('document_signature_requests')
      .update({ status: 'signed', completed_at: new Date().toISOString() })
      .eq('tenant_id', user.tenantId)
      .eq('id', requestId), 'document_signature_requests write');

    return NextResponse.json({ success: true, data: sig });
  } catch (err: unknown) {
    return apiError('signatures', err, 'Failed to record signature');
  }
}
