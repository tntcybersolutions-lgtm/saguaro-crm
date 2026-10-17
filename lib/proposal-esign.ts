/**
 * lib/proposal-esign.ts — in-app e-signature on proposals, server side.
 *
 * Flow:  send (GC) → viewed (customer opens /portals/proposal/[token]) →
 *        signed | declined (customer)      — or voided / expired.
 *
 *  - The link token is 32 random bytes (base64url). Only its SHA-256 is stored
 *    (proposal_signatures.token_hash); the token itself exists in the email
 *    and nowhere else, so a database read cannot sign anything.
 *  - What is sent is frozen in content_snapshot and fingerprinted
 *    (content_hash = SHA-256 of its canonical JSON). The customer is shown the
 *    snapshot, the signature binds to the hash, and the signed PDF prints it.
 *  - Signing is ONE conditional update (status still sent/viewed, not expired),
 *    so a token signs once, and never after a decline, a void or its date.
 *  - Every step is an append-only event (proposal_signature_events).
 *  - Drawn signatures and signed PDFs live in the private 'esign' bucket and
 *    leave only as short-lived signed URLs.
 *
 * Service-role client bypasses RLS → every query here is tenant-scoped, and the
 * public routes take the tenant from the token's row, never from the request.
 */
import { createHash, randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { companyDisplayName } from '@/lib/company-name';
import { type AuthedUser, requireAnyPermission, PROPOSAL_MONEY } from '@/lib/permissions';
import { createNotification } from '@/lib/notifications';
import { acceptProposal } from '@/lib/proposal-accept';
import { stageStamps } from '@/lib/lead-stages';
import { must, tryWrite } from '@/lib/db-write';
import { resolveBrandingValues } from '@/lib/document-templates/report-theme';
import { renderSignedProposalPdf } from '@/lib/document-templates/proposal-signed-generator';
import {
  canonicalJson, lineAmount, normalizeLineItems, proposalTotal, looksLikeToken, money,
  type ProposalSnapshot,
} from '@/lib/proposal-esign-core';

export * from '@/lib/proposal-esign-core';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LooseDb = any;

export const ESIGN_BUCKET = 'esign';
export const DEFAULT_EXPIRY_DAYS = 30;
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://saguarocontrol.net';

/** Columns safe to hand the GC (never token_hash). */
export const REQUEST_COLUMNS =
  'id, tenant_id, proposal_id, lead_id, project_id, status, on_sign, signer_name, signer_email, signer_title, message, content_hash, ' +
  'expires_at, sent_at, sent_by, viewed_at, last_viewed_at, view_count, signed_at, signed_name, signed_title, signature_method, ' +
  'signer_ip, signer_user_agent, signed_pdf_path, signed_pdf_sha256, declined_at, decline_reason, voided_at, created_at';

export interface SignatureRequestRow {
  id: string;
  tenant_id: string;
  proposal_id: string;
  lead_id: string | null;
  project_id: string | null;
  status: string;
  on_sign: 'flag' | 'win';
  signer_name: string;
  signer_email: string;
  signer_title: string | null;
  message: string | null;
  content_snapshot?: ProposalSnapshot;
  content_hash: string;
  expires_at: string;
  sent_at: string;
  sent_by: string | null;
  viewed_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
  signed_at: string | null;
  signed_name: string | null;
  signed_title: string | null;
  signature_method: 'drawn' | 'typed' | null;
  signature_path?: string | null;
  signer_ip: string | null;
  signer_user_agent: string | null;
  consent_text?: string | null;
  signed_pdf_path: string | null;
  signed_pdf_sha256: string | null;
  declined_at: string | null;
  decline_reason: string | null;
  voided_at: string | null;
}

export function sha256Hex(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

export function newSignToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: sha256Hex(token) };
}

export function hashToken(token: string): string {
  return sha256Hex(token);
}

export const snapshotHash = (s: ProposalSnapshot) => sha256Hex(canonicalJson(s));

export function signingUrl(token: string): string {
  return `${APP_URL}/portals/proposal/${token}`;
}

/** Client IP + user agent for the audit trail. */
export function requestMeta(req: NextRequest): { ip: string | null; userAgent: string | null } {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null;
  return { ip, userAgent: (req.headers.get('user-agent') || '').slice(0, 500) || null };
}

// ─── GC side: who may touch this proposal ────────────────────────────────────

export type ProposalRow = {
  id: string; tenant_id: string; project_id: string | null; lead_id: string | null; title: string | null;
  proposal_number: string | null; amount: number | string | null; total_amount: number | string | null;
  line_items: unknown; introduction: string | null; description: string | null; payment_terms: string | null;
  exclusions: string | null; valid_until: string | null; client_name: string | null; client_email: string | null;
  client_company: string | null; status: string | null; locked_at: string | null; signed_at: string | null;
  signed_by: string | null; created_at: string;
};
export const PROPOSAL_COLUMNS =
  'id, tenant_id, project_id, lead_id, title, proposal_number, amount, total_amount, line_items, introduction, description, ' +
  'payment_terms, exclusions, valid_until, client_name, client_email, client_company, status, locked_at, signed_at, signed_by, created_at';

/**
 * Load a proposal of the caller's company and check their role for it: a
 * proposal on a job is a Documents record of that job; one on a deal is Sales.
 * 404 for another company's id (indistinguishable from one that does not exist).
 */
export async function guardProposal(
  req: NextRequest, proposalId: string, level: 'View' | 'Edit',
): Promise<{ ok: true; user: AuthedUser; db: LooseDb; proposal: ProposalRow } | { ok: false; res: NextResponse }> {
  const user = await getUser(req);
  if (!user) return { ok: false, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const db = createServerClient() as LooseDb;
  if (!/^[0-9a-f-]{36}$/i.test(proposalId)) return { ok: false, res: NextResponse.json({ error: 'Proposal not found' }, { status: 404 }) };
  const { data, error } = await db.from('proposals').select(PROPOSAL_COLUMNS).eq('id', proposalId).eq('tenant_id', user.tenantId).maybeSingle();
  if (error) throw error;
  if (!data) return { ok: false, res: NextResponse.json({ error: 'Proposal not found' }, { status: 404 }) };
  const p = data as ProposalRow;
  /* Proposal dollars and the signer's name, email and IP: Sales or Budget,
     on a job's proposal and a deal's alike (PROPOSAL_MONEY — the same rule as
     role_gate_*_proposals and _proposal_signatures in the database). It was
     Documents on a job, so a Subcontractor could read the amounts. */
  const g = await requireAnyPermission(req, PROPOSAL_MONEY, level, { projectId: p.project_id || null, db });
  if (!g.ok) return g;
  return { ok: true, user: g.user, db, proposal: p };
}

// ─── Snapshot ────────────────────────────────────────────────────────────────

export async function buildSnapshot(
  db: LooseDb, p: ProposalRow, signer: { name: string; email: string; company: string | null }, sentAt: string,
): Promise<ProposalSnapshot> {
  const lines = normalizeLineItems(p.line_items);
  const [brand, project] = await Promise.all([
    resolveBrandingValues({ tenantId: p.tenant_id }),
    p.project_id
      ? db.from('projects').select('name').eq('id', p.project_id).eq('tenant_id', p.tenant_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (project.error) throw project.error;
  const company = (await companyDisplayName(db, p.tenant_id)) || brand.companyName;
  const t = (v: string | null) => (v && v.trim() ? v.trim() : null);
  return {
    v: 1,
    proposal_id: p.id,
    title: t(p.title) || 'Proposal',
    number: t(p.proposal_number),
    company: { name: company, logo_url: brand.logoUrl || null },
    prepared_for: { name: signer.name, company: signer.company, email: signer.email },
    project_name: (project.data as { name?: string } | null)?.name || null,
    line_items: lines.map((l) => ({ ...l, amount: lineAmount(l) })),
    total: proposalTotal(lines, p.total_amount ?? p.amount),
    introduction: t(p.introduction),
    scope: t(p.description),
    payment_terms: t(p.payment_terms),
    exclusions: t(p.exclusions),
    valid_until: p.valid_until || null,
    sent_at: sentAt,
  };
}

// ─── Audit trail ─────────────────────────────────────────────────────────────

export async function recordEvent(db: LooseDb, e: {
  tenantId: string; signatureId: string; proposalId: string;
  event: 'sent' | 'viewed' | 'signed' | 'declined' | 'voided';
  actor: 'sender' | 'signer'; actorUserId?: string | null;
  ip?: string | null; userAgent?: string | null; detail?: Record<string, unknown>;
}): Promise<void> {
  await must(db.from('proposal_signature_events').insert({
    tenant_id: e.tenantId, signature_id: e.signatureId, proposal_id: e.proposalId,
    event: e.event, actor: e.actor, actor_user_id: e.actorUserId ?? null,
    ip: e.ip ?? null, user_agent: e.userAgent ?? null, detail: e.detail ?? {},
  }), 'proposal_signature_events insert');
}

/** A line on the deal's own activity trail, when the proposal is on a deal. */
export async function noteOnDeal(db: LooseDb, tenantId: string, leadId: string | null, type: 'email' | 'note', description: string, userId?: string | null) {
  if (!leadId) return;
  await tryWrite(db.from('lead_activities').insert({
    tenant_id: tenantId, lead_id: leadId, activity_type: type, description, created_by: userId ?? null,
    completed_at: new Date().toISOString(),
  }), 'proposal esign: lead activity');
}

/** Where the GC reads about it. */
export function gcLink(r: { lead_id: string | null; project_id: string | null }): string | undefined {
  if (r.lead_id) return `/app/leads/${r.lead_id}`;
  if (r.project_id) return `/app/projects/${r.project_id}/proposal`;
  return undefined;
}

// ─── Public side: the token ──────────────────────────────────────────────────

/** The request a link points at, or null. Never trusts anything but the token. */
export async function requestByToken(db: LooseDb, token: unknown): Promise<(SignatureRequestRow & { content_snapshot: ProposalSnapshot }) | null> {
  if (!looksLikeToken(token)) return null;
  const { data, error } = await db
    .from('proposal_signatures')
    .select(`${REQUEST_COLUMNS}, content_snapshot, consent_text, signature_path`)
    .eq('token_hash', hashToken(token))
    .maybeSingle();
  if (error) throw error;
  return (data as (SignatureRequestRow & { content_snapshot: ProposalSnapshot }) | null) ?? null;
}

// ─── After signing ───────────────────────────────────────────────────────────

/**
 * What a signature means for the record: the proposal's terms are locked and
 * it reads Signed. Only when the sender chose "win on signature" does it go
 * further — a job proposal becomes the contract (lib/proposal-accept), a deal
 * moves to Won. Otherwise the deal page offers the one-tap Mark Won.
 */
export async function applySignature(db: LooseDb, r: SignatureRequestRow, signedAt: string): Promise<{ won: boolean }> {
  await must(db.from('proposals').update({
    locked_at: signedAt,
    status: 'signed',
    signed_by: r.signed_name,
    signed_at: signedAt,
    signed_ip: r.signer_ip,
    signature_data: r.signature_path ? `${ESIGN_BUCKET}/${r.signature_path}` : null,
    client_name: r.signer_name,
    client_email: r.signer_email,
  }).eq('id', r.proposal_id).eq('tenant_id', r.tenant_id), 'proposals lock on signature');

  if (r.on_sign !== 'win') return { won: false };

  const { data: prop, error: pErr } = await db.from('proposals').select('project_id, lead_id')
    .eq('id', r.proposal_id).eq('tenant_id', r.tenant_id).maybeSingle();
  if (pErr) throw pErr;
  const projectId = (prop as { project_id?: string | null } | null)?.project_id ?? null;
  const leadId = (prop as { lead_id?: string | null } | null)?.lead_id ?? r.lead_id;
  if (projectId) {
    await acceptProposal(db, r.tenant_id, r.proposal_id, {
      signedBy: r.signed_name || r.signer_name,
      signedIp: r.signer_ip || 'unknown',
      signatureData: r.signature_path ? `${ESIGN_BUCKET}/${r.signature_path}` : '',
    });
  } else {
    await must(db.from('proposals').update({ status: 'accepted', accepted_at: signedAt })
      .eq('id', r.proposal_id).eq('tenant_id', r.tenant_id), 'proposals accept on signature');
  }
  if (leadId) {
    const { data: lead, error: lErr } = await db.from('lead_pipeline').select('stage')
      .eq('id', leadId).eq('tenant_id', r.tenant_id).maybeSingle();
    if (lErr) throw lErr;
    const stamps = stageStamps((lead as { stage?: string } | null)?.stage, 'Won', signedAt);
    if (lead && stamps) {
      await must(db.from('lead_pipeline').update({ stage: 'Won', ...stamps, updated_at: signedAt })
        .eq('id', leadId).eq('tenant_id', r.tenant_id), 'lead_pipeline win on signature');
    }
  }
  return { won: true };
}

/**
 * Render the signed PDF (proposal + certificate), store it in the private
 * bucket and record its path and SHA-256 on the request. Idempotent: a request
 * that already has one returns it.
 */
export async function ensureSignedPdf(db: LooseDb, signatureId: string, tenantId: string): Promise<{ path: string; sha256: string }> {
  const { data, error } = await db.from('proposal_signatures')
    .select(`${REQUEST_COLUMNS}, content_snapshot, consent_text, signature_path`)
    .eq('id', signatureId).eq('tenant_id', tenantId).maybeSingle();
  if (error) throw error;
  const r = data as (SignatureRequestRow & { content_snapshot: ProposalSnapshot }) | null;
  if (!r || r.status !== 'signed') throw new Error('signed PDF requested for a request that is not signed');
  if (r.signed_pdf_path && r.signed_pdf_sha256) return { path: r.signed_pdf_path, sha256: r.signed_pdf_sha256 };

  let signaturePng: Uint8Array | null = null;
  if (r.signature_path) {
    const dl = await db.storage.from(ESIGN_BUCKET).download(r.signature_path);
    if (dl.error) throw dl.error;
    signaturePng = new Uint8Array(await (dl.data as Blob).arrayBuffer());
  }
  const { data: events, error: evErr } = await db.from('proposal_signature_events')
    .select('event, actor, created_at, ip, detail').eq('signature_id', r.id).eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });
  if (evErr) throw evErr;
  const brand = await resolveBrandingValues({ tenantId });
  const bytes = await renderSignedProposalPdf({
    snapshot: r.content_snapshot,
    contentHash: r.content_hash,
    requestId: r.id,
    branding: { ...brand, companyName: r.content_snapshot.company.name || brand.companyName },
    signer: {
      name: r.signed_name || r.signer_name,
      title: r.signed_title || r.signer_title,
      email: r.signer_email,
      method: r.signature_method === 'typed' ? 'typed' : 'drawn',
      signaturePng,
      signedAt: r.signed_at || new Date().toISOString(),
      ip: r.signer_ip,
      userAgent: r.signer_user_agent,
      consentText: r.consent_text || '',
    },
    events: (events || []) as Array<{ event: string; actor: string; created_at: string; ip: string | null; detail: Record<string, unknown> | null }>,
  });
  const path = `${tenantId}/proposals/${r.proposal_id}/${r.id}/signed-proposal.pdf`;
  const up = await db.storage.from(ESIGN_BUCKET).upload(path, bytes, { contentType: 'application/pdf', upsert: true });
  if (up.error) throw up.error;
  const sha256 = sha256Hex(bytes);
  await must(db.from('proposal_signatures').update({ signed_pdf_path: path, signed_pdf_sha256: sha256 })
    .eq('id', r.id).eq('tenant_id', tenantId).is('signed_pdf_path', null), 'proposal_signatures signed pdf');
  return { path, sha256 };
}

/** Tell the sender, in the app (createNotification also pushes and emails them). */
export async function notifySender(r: SignatureRequestRow, type: string, title: string, body: string): Promise<void> {
  await createNotification(r.tenant_id, r.sent_by, type, title, body, gcLink(r), r.project_id || undefined);
}

export const describeAmount = (s: ProposalSnapshot) => money(s.total);
