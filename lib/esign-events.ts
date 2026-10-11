/**
 * lib/esign-events.ts — what the sender hears when a signer acts on a link
 * sent from Saguaro (POST /api/documents/sign/send): first opened, signed,
 * declined. One place for all three so the signing routes stay thin.
 *
 * A proposal (doc_type 'proposal', source_id = the proposal) also moves on its
 * own row: opened stamps proposals.viewed_at; signing runs lib/proposal-accept
 * (contract, phase, budget, win); declining marks it declined with the reason.
 *
 * Service-role client bypasses RLS → every query is explicitly tenant-scoped.
 */
import { createNotification } from '@/lib/notifications';
import { acceptProposal } from '@/lib/proposal-accept';

export interface SignatureRow {
  id: string;
  tenant_id: string;
  project_id: string | null;
  doc_type: string | null;
  doc_title: string | null;
  signer_name: string | null;
  sent_by: string | null;
  source_id: string | null;
}

export const SIGNATURE_EVENT_COLUMNS = 'id, tenant_id, project_id, doc_type, doc_title, signer_name, sent_by, source_id';

const isProposal = (s: SignatureRow) => s.doc_type === 'proposal' && !!s.source_id;

/** Where the sender reads about it. */
function linkFor(s: SignatureRow): string | undefined {
  if (!s.project_id) return undefined;
  return isProposal(s) ? `/app/projects/${s.project_id}/proposal` : `/app/projects/${s.project_id}/contracts`;
}

function notify(s: SignatureRow, type: string, title: string, body: string) {
  return createNotification(s.tenant_id, s.sent_by, type, title, body, linkFor(s), s.project_id || undefined);
}

/** First time the signer opened the link. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function onFirstViewed(db: any, s: SignatureRow): Promise<void> {
  if (isProposal(s)) {
    const { error } = await db
      .from('proposals')
      .update({ viewed_at: new Date().toISOString() })
      .eq('id', s.source_id)
      .eq('tenant_id', s.tenant_id)
      .is('viewed_at', null);
    if (error) throw error;
  }
  await notify(s, 'document_viewed', `${s.signer_name || 'The signer'} opened ${s.doc_title || 'your document'}`, 'They have the link open now — nothing is signed yet.');
}

/** The signer signed. For a proposal this is the contract. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function onSigned(db: any, s: SignatureRow, sig: { ip: string; signatureData: string }): Promise<void> {
  if (isProposal(s)) {
    await acceptProposal(db, s.tenant_id, String(s.source_id), {
      signedBy: s.signer_name || 'Client',
      signedIp: sig.ip,
      signatureData: sig.signatureData,
    });
    await notify(s, 'proposal_signed', `${s.signer_name || 'Your client'} signed ${s.doc_title || 'the proposal'}`, 'It is now the contract: the job is won, the contract amount is set, and the budget is started from the takeoff where there was none.');
    return;
  }
  await notify(s, 'document_signed', `${s.signer_name || 'The signer'} signed ${s.doc_title || 'your document'}`, 'The signed copy is on the job.');
}

/** The signer declined, optionally saying why. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function onDeclined(db: any, s: SignatureRow, reason: string | null): Promise<void> {
  if (isProposal(s)) {
    const { error } = await db
      .from('proposals')
      .update({ status: 'declined', declined_at: new Date().toISOString(), decline_reason: reason })
      .eq('id', s.source_id)
      .eq('tenant_id', s.tenant_id);
    if (error) throw error;
  }
  await notify(s, 'document_declined', `${s.signer_name || 'The signer'} declined ${s.doc_title || 'your document'}`, reason ? `Reason: ${reason}` : 'No reason given.');
}
