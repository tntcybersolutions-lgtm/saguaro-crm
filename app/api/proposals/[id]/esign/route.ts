import { NextRequest, NextResponse } from 'next/server';
import { apiError, apiFail } from '@/lib/api-error';
import { must } from '@/lib/db-write';
import { companyDisplayName } from '@/lib/company-name';
import { sendProposalSignatureRequest } from '@/lib/email';
import {
  guardProposal, buildSnapshot, snapshotHash, newSignToken, signingUrl, recordEvent, noteOnDeal,
  requestMeta, effectiveStatus, REQUEST_COLUMNS, DEFAULT_EXPIRY_DAYS, money,
  type SignatureRequestRow,
} from '@/lib/proposal-esign';

export const runtime = 'nodejs';

/**
 * /api/proposals/[id]/esign — the GC's side of proposal e-signature.
 *
 * GET  → every signature request on the proposal (newest first) with its
 *        effective status (sent / viewed / signed / declined / voided /
 *        expired) and its audit trail.
 * POST { action: 'send' | 'resend' | 'void', … }
 *   send   { signer_name, signer_email, signer_title?, message?, expires_days?, on_sign? }
 *          Freezes the proposal as it is now, mints a single-use link and
 *          emails it. 409 when a link is already open (use resend) or the
 *          proposal is signed.
 *   resend same body — voids the open link (if any) and sends a fresh one.
 *   void   withdraws the open link; it stops working at once.
 *
 * Tenant from getUser() via guardProposal; the role is Documents on a job's
 * proposal and Sales on a deal's.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const g = await guardProposal(req, id, 'View');
    if (!g.ok) return g.res;
    const { db, user } = g;
    const { data: reqs, error } = await db.from('proposal_signatures').select(REQUEST_COLUMNS)
      .eq('proposal_id', id).eq('tenant_id', user.tenantId).order('sent_at', { ascending: false });
    if (error) throw error;
    const rows = (reqs || []) as SignatureRequestRow[];
    const { data: events, error: evErr } = rows.length
      ? await db.from('proposal_signature_events').select('id, signature_id, event, actor, ip, user_agent, detail, created_at')
        .eq('proposal_id', id).eq('tenant_id', user.tenantId).order('created_at', { ascending: true })
      : { data: [], error: null };
    if (evErr) throw evErr;
    const now = Date.now();
    return NextResponse.json({
      proposal: { id: g.proposal.id, locked_at: g.proposal.locked_at, status: g.proposal.status },
      requests: rows.map((r) => ({ ...r, status: effectiveStatus(r, now), has_signed_pdf: !!r.signed_pdf_path, signed_pdf_path: undefined })),
      events: events || [],
    });
  } catch (e) {
    return apiError('proposals/esign GET', e, 'Could not load the signature status.');
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return apiFail('Send a JSON body.', 400);
  const action = body.action;
  if (action !== 'send' && action !== 'resend' && action !== 'void') return apiFail('action must be send, resend or void.', 400);

  try {
    const g = await guardProposal(req, id, 'Edit');
    if (!g.ok) return g.res;
    const { db, user, proposal } = g;
    const { ip, userAgent } = requestMeta(req);
    const nowIso = new Date().toISOString();

    const { data: openRows, error: openErr } = await db.from('proposal_signatures').select('id, status, expires_at, lead_id')
      .eq('proposal_id', id).eq('tenant_id', user.tenantId).in('status', ['sent', 'viewed']);
    if (openErr) throw openErr;
    const open = ((openRows || []) as Array<{ id: string; status: string; expires_at: string; lead_id: string | null }>)[0] ?? null;

    const voidOpen = async (reason: string) => {
      if (!open) return false;
      const { data: v, error: vErr } = await db.from('proposal_signatures')
        .update({ status: 'voided', voided_at: nowIso, voided_by: user.id })
        .eq('id', open.id).eq('tenant_id', user.tenantId).in('status', ['sent', 'viewed'])
        .select('id').maybeSingle();
      if (vErr) throw vErr;
      if (!v) return false; // signed or declined a moment ago — not ours to void
      await recordEvent(db, { tenantId: user.tenantId, signatureId: open.id, proposalId: id, event: 'voided', actor: 'sender', actorUserId: user.id, ip, userAgent, detail: { reason } });
      return true;
    };

    if (action === 'void') {
      if (!open) return apiFail('There is no open signing link to void.', 409);
      if (!(await voidOpen('voided by sender'))) return apiFail('The link was just signed or declined, so it cannot be voided.', 409);
      if (!proposal.locked_at) {
        await must(db.from('proposals').update({ status: 'draft' }).eq('id', id).eq('tenant_id', user.tenantId).in('status', ['sent', 'viewed']), 'proposals status after void');
      }
      await noteOnDeal(db, user.tenantId, proposal.lead_id, 'note', `Voided the signing link for "${proposal.title || 'the proposal'}".`, user.id);
      return NextResponse.json({ success: true, voided: open.id });
    }

    // send / resend
    if (proposal.locked_at) return apiFail('This proposal is already signed. Its terms are locked.', 409);
    if (action === 'send' && open) {
      return NextResponse.json({ error: 'A signing link is already out for this proposal. Resend it to replace the link, or void it first.', open_request_id: open.id }, { status: 409 });
    }

    const signer_name = clean(body.signer_name, 120);
    const signer_email = clean(body.signer_email, 254).toLowerCase();
    const signer_title = clean(body.signer_title, 120) || null;
    const message = clean(body.message, 2000) || null;
    if (!signer_name) return apiFail('signer_name is required.', 400);
    if (!EMAIL_RE.test(signer_email)) return apiFail('signer_email must be a valid email address.', 400);
    const days = body.expires_days === undefined ? DEFAULT_EXPIRY_DAYS : Math.round(Number(body.expires_days));
    if (!Number.isFinite(days) || days < 1 || days > 90) return apiFail('expires_days must be between 1 and 90.', 400);
    const on_sign = body.on_sign === 'win' ? 'win' : 'flag';

    // Who the proposal is for: the deal's company, else what the proposal says.
    let signerCompany: string | null = proposal.client_company || null;
    if (proposal.lead_id) {
      const { data: lead, error: lErr } = await db.from('lead_pipeline').select('company_name')
        .eq('id', proposal.lead_id).eq('tenant_id', user.tenantId).maybeSingle();
      if (lErr) throw lErr;
      signerCompany = (lead as { company_name?: string } | null)?.company_name || signerCompany;
    }
    const snapshot = await buildSnapshot(db, proposal, { name: signer_name, email: signer_email, company: signerCompany }, nowIso);
    if (!(snapshot.total > 0)) return apiFail('Add a line item or an amount before sending this proposal.', 400);
    const content_hash = snapshotHash(snapshot);

    if (action === 'resend') await voidOpen('replaced by a new link');

    const { token, hash } = newSignToken();
    const expires_at = new Date(Date.now() + days * 86_400_000).toISOString();
    const { data: created, error: insErr } = await db.from('proposal_signatures').insert({
      tenant_id: user.tenantId,
      proposal_id: id,
      lead_id: proposal.lead_id,
      project_id: proposal.project_id,
      token_hash: hash,
      status: 'sent',
      on_sign,
      signer_name, signer_email, signer_title, message,
      content_snapshot: snapshot,
      content_hash,
      expires_at,
      sent_at: nowIso,
      sent_by: user.id,
    }).select(REQUEST_COLUMNS).single();
    if (insErr) {
      if ((insErr as { code?: string }).code === '23505') return apiFail('Another signing link was just sent for this proposal. Refresh and try again.', 409);
      throw insErr;
    }
    const r = created as SignatureRequestRow;
    await recordEvent(db, {
      tenantId: user.tenantId, signatureId: r.id, proposalId: id, event: 'sent', actor: 'sender', actorUserId: user.id, ip, userAgent,
      detail: { to: signer_email, expires_at, on_sign, content_hash, resend: action === 'resend' },
    });
    await must(db.from('proposals').update({
      status: 'sent', sent_at: nowIso, client_name: signer_name, client_email: signer_email,
      ...(signerCompany ? { client_company: signerCompany } : {}),
      declined_at: null, decline_reason: null,
    }).eq('id', id).eq('tenant_id', user.tenantId), 'proposals status sent');

    const companyName = (await companyDisplayName(db, user.tenantId, user.id)) || snapshot.company.name;
    const url = signingUrl(token);
    const mail = await sendProposalSignatureRequest({
      to: signer_email, replyTo: user.email, signerName: signer_name, companyName,
      proposalTitle: snapshot.title, amount: snapshot.total, signUrl: url, expiresAt: expires_at, message,
    });
    await noteOnDeal(db, user.tenantId, proposal.lead_id, 'email',
      `${action === 'resend' ? 'Resent' : 'Sent'} "${snapshot.title}" (${money(snapshot.total)}) to ${signer_name} <${signer_email}> for signature${mail.sent ? '' : ' — the email did not go out'}.`, user.id);

    /* The link goes back to the sender only when the email did not go out, so
       they can deliver it themselves. Otherwise it lives in the email alone. */
    return NextResponse.json({
      success: true,
      request: { ...r, status: 'sent' },
      emailed: mail.sent,
      ...(mail.sent ? {} : { sign_url: url, warning: "The link was created but the email didn't go out. Copy the link and send it yourself, or resend." }),
    }, { status: 201 });
  } catch (e) {
    return apiError('proposals/esign POST', e, 'Could not send the proposal for signature.');
  }
}
