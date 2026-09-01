import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import crypto from 'crypto';
import { apiError, apiFail } from '@/lib/api-error';
import { sendSignatureRequest } from '@/lib/email';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const db = createServerClient();

  // ─── Resend flow ───────────────────────────────────────────────────
  if (body.resend_signature_id) {
    // Tenant-scope the lookup — service-role bypasses RLS, so matching by
    // signature_id alone would let one tenant mint a fresh signing token for
    // ANOTHER tenant's document (cross-tenant IDOR + token forgery).
    const { data: existing } = await db
      .from('document_signature_requests')
      .select('id, signature_id')
      .eq('signature_id', body.resend_signature_id)
      .eq('tenant_id', user.tenantId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Signature request not found' }, { status: 404 });
    }

    const newToken = crypto.randomUUID();
    await db
      .from('document_signature_requests')
      .update({
        token: newToken,
        status: 'pending',
        sent_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .eq('tenant_id', user.tenantId);

    const { data: sig } = await db
      .from('document_signatures')
      .update({ status: 'pending', sent_at: new Date().toISOString() })
      .eq('id', body.resend_signature_id)
      .eq('tenant_id', user.tenantId)
      .select('project_id, doc_title, signer_name, signer_email')
      .single();

    if (sig) {
      const [{ data: proj }, { data: ten }] = await Promise.all([
        db.from('projects').select('name').eq('id', (sig as any).project_id).eq('tenant_id', user.tenantId).single(),
        db.from('tenants').select('name').eq('id', user.tenantId).single(),
      ]);
      await sendSignatureRequest({
        to: (sig as any).signer_email,
        signerName: (sig as any).signer_name,
        senderName: (ten as any)?.name || 'Your general contractor',
        docTitle: (sig as any).doc_title,
        projectName: (proj as any)?.name || 'the project',
        signUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://saguarocontrol.net'}/portals/sign/${newToken}`,
      });
    }

    return NextResponse.json({ success: true, resent: true });
  }

  // ─── Normal send flow ──────────────────────────────────────────────
  const {
    project_id,
    doc_type,
    doc_title,
    pdf_url,
    signers,
    message,
  } = body as {
    project_id: string;
    doc_type: string;
    doc_title: string;
    pdf_url: string;
    signers: { name: string; email: string; company: string; role: string }[];
    message?: string;
  };

  if (!project_id || !doc_type || !doc_title || !pdf_url || !signers?.length) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  /* Names for the email. The signer is a sub or an owner with no login here,
     so the message has to say who is asking and about what. */
  const { data: project } = await db
    .from('projects')
    .select('name')
    .eq('id', project_id)
    .eq('tenant_id', user.tenantId)
    .single();

  if (!project) return apiFail('Project not found', 404);

  const { data: tenant } = await db
    .from('tenants')
    .select('name')
    .eq('id', user.tenantId)
    .single();

  const senderName = (tenant as any)?.name || 'Your general contractor';
  const projectName = (project as any)?.name || 'the project';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://saguarocontrol.net';

  const created: any[] = [];

  for (const signer of signers) {
    // 1. Insert document_signatures
    const { data: sig, error: sigErr } = await db
      .from('document_signatures')
      .insert({
        project_id,
        tenant_id: user.tenantId,
        doc_type,
        doc_title,
        pdf_url,
        signer_name: signer.name,
        signer_email: signer.email,
        signer_company: signer.company || null,
        signer_role: signer.role || null,
        status: 'pending',
        sent_at: new Date().toISOString(),
        sent_by: user.id,
      })
      .select()
      .single();

    if (sigErr) return apiError('documents/sign/send', sigErr, 'Could not create the signature request.');

    // 2. Insert document_signature_requests
    const token = crypto.randomUUID();
    const { error: reqErr } = await db
      .from('document_signature_requests')
      .insert({
        tenant_id: user.tenantId,
        signature_id: sig.id,
        token,
        status: 'pending',
        message: message || null,
        field_placements: [],
        sent_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
      });

    if (reqErr) return apiError('documents/sign/send', reqErr, 'Could not create the signature request.');

    /* Send the link. A failure here is logged inside sendSignatureRequest and
       does not roll back the request — the row exists, and Resend can be
       retried from the status list. */
    await sendSignatureRequest({
      to: signer.email,
      signerName: signer.name,
      senderName,
      docTitle: doc_title,
      projectName,
      signUrl: `${appUrl}/portals/sign/${token}`,
      message: message || undefined,
    });

    created.push({ ...sig, token });
  }

  return NextResponse.json({ success: true, signatures: created });
}
