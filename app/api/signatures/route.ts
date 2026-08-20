import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

// GET - List signature requests for a project
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createServerClient();
    const projectId = req.nextUrl.searchParams.get('projectId');
    const documentId = req.nextUrl.searchParams.get('documentId');

    let query = supabase
      .from('project_documents')
      .select('*, document_signatures(*)')
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false });

    if (projectId) query = query.eq('project_id', projectId);
    if (documentId) query = query.eq('document_id', documentId);

    const { data, error } = await query.limit(50);
    if (error) throw error;

    return NextResponse.json({ data: data || [] });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to load signatures' }, { status: 500 });
  }
}

// POST - Create a signature request (send document for signing)
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createServerClient();
    const body = await req.json();
    const { projectId, documentId, documentType, documentUrl, recipientEmail, recipientName, recipientRole, message } = body;

    if (!projectId || !recipientEmail) {
      return NextResponse.json({ error: 'projectId and recipientEmail are required' }, { status: 400 });
    }

    // Create signature request
    const { data: sigReq, error: reqErr } = await supabase
      .from('project_documents')
      .insert({
        tenant_id: user.tenantId,
        project_id: projectId,
        document_id: documentId || null,
        document_type: documentType || 'general',
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
      await supabase.from('activity_events').insert({
        tenant_id: user.tenantId,
        user_id: user.id,
        project_id: projectId,
        action: 'signature_requested',
        entity_type: 'document_signature_request',
        entity_id: sigReq.id,
        details: { recipientEmail, documentType },
      });
    } catch { /* non-fatal */ }

    return NextResponse.json({ success: true, data: sigReq });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to create signature request' }, { status: 500 });
  }
}

// PATCH - Sign a document (record signature)
export async function PATCH(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createServerClient();
    const body = await req.json();
    const { requestId, signatureData, signerName, signerEmail, signerIp } = body;

    if (!requestId || !signatureData) {
      return NextResponse.json({ error: 'requestId and signatureData are required' }, { status: 400 });
    }

    // Get the request
    const { data: sigReq } = await supabase
      .from('project_documents')
      .select('*')
      .eq('id', requestId)
      .eq('tenant_id', user.tenantId)
      .single();

    if (!sigReq) return NextResponse.json({ error: 'Signature request not found' }, { status: 404 });
    if (sigReq.status === 'signed') return NextResponse.json({ error: 'Already signed' }, { status: 400 });

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
      .from('project_documents')
      .insert({
        tenant_id: sigReq.tenant_id,
        request_id: requestId,
        document_id: sigReq.document_id,
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
    await supabase
      .from('project_documents')
      .update({ status: 'signed', completed_at: new Date().toISOString() })
      .eq('id', requestId)
      .eq('tenant_id', user.tenantId);

    return NextResponse.json({ success: true, data: sig });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to record signature' }, { status: 500 });
  }
}
