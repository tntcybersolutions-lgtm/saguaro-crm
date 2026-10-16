/**
 * lib/pay-app-status.ts — the ONE way a pay application changes status.
 *
 * A pay app's status is not a label. Each move carries consequences:
 *   submitted  → the owner's approval link (owner_approval_token), submitted_at,
 *                the owner's email (onPayAppSubmitted)
 *   approved   → approved_at and the conditional lien-waiver cascade
 *                (onPayAppApproved)
 *   certified  → certified_at, the GC's notice (onPayAppCertified) — and, when
 *                the app was never approved first, the approval and its
 *                waiver cascade too (certifying IS approving it)
 *   paid       → the unsigned-waiver gate, payment_received_at, the prime
 *                contract's paid_amount and the unconditional waivers for
 *                every signed conditional
 *   rejected   → rejected_at + the reason; the GC edits and resubmits it
 *   draft      → withdrawn from the owner before a decision
 *
 * What it used to be: each of /submit, /approve, /certify and /paid wrote its
 * own stamps; the generic PATCH, the approvals inbox, the owner's link and the
 * legacy record-payment handler each wrote `status` their own way. A status
 * set through PATCH skipped the paid date and the certify notice, the owner's
 * reject stamped approved_at (so the resubmitted app could never be reviewed),
 * and paying twice added the payment to the contract twice. Every route now
 * calls transitionPayAppStatus().
 *
 * The status write is conditional on the status it read (`.eq('status', from)`),
 * so two clicks racing each other cannot both fire the cascade.
 */
import { randomUUID } from 'crypto';
import { must } from './db-write';
import { runInBackground } from './background';
import { onPayAppSubmitted, onPayAppApproved, onPayAppCertified } from './triggers';

export const PAY_APP_STATUSES = ['draft', 'submitted', 'approved', 'certified', 'paid', 'rejected'] as const;
export type PayAppStatus = (typeof PAY_APP_STATUSES)[number];

export function isPayAppStatus(s: unknown): s is PayAppStatus {
  return typeof s === 'string' && (PAY_APP_STATUSES as readonly string[]).includes(s);
}

/** Which statuses each target may be reached from. Same-status is a no-op. */
const FROM: Record<PayAppStatus, PayAppStatus[]> = {
  draft:     ['submitted', 'rejected'],
  submitted: ['draft', 'rejected'],
  approved:  ['draft', 'submitted', 'rejected'],
  certified: ['submitted', 'approved'],
  paid:      ['approved', 'certified'],
  rejected:  ['submitted', 'approved'],
};

export type TransitionOpts = {
  /** The signed-in user making the move; null for the owner's token link. */
  actorId?: string | null;
  /** Owner / reviewer note (approval_notes, or the rejection reason). */
  note?: string | null;
  /** Mark paid even though conditional waivers are unsigned. */
  overrideWaivers?: boolean;
  /** Optional payment details recorded with `paid`. */
  payment?: { amount?: number | null; method?: string | null; checkNumber?: string | null; receivedAt?: string | null };
};

export type TransitionResult =
  | { ok: true; changed: boolean; from: string; to: PayAppStatus; payApp: Record<string, unknown>; extra?: Record<string, unknown> }
  | { ok: false; status: number; error: string; extra?: Record<string, unknown> };

const LABEL: Record<PayAppStatus, string> = {
  draft: 'a draft', submitted: 'submitted', approved: 'approved', certified: 'certified', paid: 'paid', rejected: 'returned for revision',
};

/**
 * Move a pay application to `to`, writing its stamps and firing its side
 * effects exactly once. Tenant-scoped on every read and write.
 */
export async function transitionPayAppStatus(
  db: any,
  tenantId: string,
  id: string,
  to: PayAppStatus,
  opts: TransitionOpts = {},
): Promise<TransitionResult> {
  const { data: cur, error: readErr } = await db
    .from('pay_applications')
    .select('id, project_id, app_number, status, period_to, current_payment_due, owner_approval_token, approved_at, certified_at, deleted_at')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!cur || cur.deleted_at) return { ok: false, status: 404, error: 'Pay application not found.' };

  const from = String(cur.status || 'draft').toLowerCase();
  if (from === to) return { ok: true, changed: false, from, to, payApp: cur };
  if (!(FROM[to] as string[]).includes(from)) {
    return {
      ok: false,
      status: 409,
      error: `This pay application is ${isPayAppStatus(from) ? LABEL[from] : from} — it can't be marked ${LABEL[to]} from there.`,
    };
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: to };
  let runApproval = false;
  let paidCascade: { waivers: Array<{ id: string; sub_id: string | null; subcontractor_id?: string | null; amount: number | null; status: string | null }> } | null = null;
  let blockingCount = 0;

  if (to === 'submitted') {
    patch.submitted_at = now;
    if (opts.actorId) patch.submitted_by = opts.actorId;
    // The owner's review link. Reused across resubmissions so an email already
    // in the owner's inbox keeps working.
    patch.owner_approval_token = cur.owner_approval_token || randomUUID();
    patch.rejected_at = null;
    patch.rejection_reason = null;
  }
  if (to === 'approved' || (to === 'certified' && !cur.approved_at)) {
    patch.approved_at = now;
    if (opts.actorId) patch.approved_by = opts.actorId;
    if (opts.note) patch.approval_notes = opts.note;
    runApproval = true;
  }
  if (to === 'certified') {
    patch.certified_at = now;
    if (opts.actorId) patch.certified_by = opts.actorId;
  }
  if (to === 'rejected') {
    patch.rejected_at = now;
    patch.rejection_reason = opts.note || null;
  }
  if (to === 'draft') {
    // Withdrawn before a decision: the owner's link stops accepting a decision
    // because the status is no longer `submitted`.
  }
  if (to === 'paid') {
    // ── Waiver gate: unsigned conditionals hold the payment ──
    const { data: waivers, error: wErr } = await db
      .from('lien_waivers')
      .select('id, sub_id, subcontractor_id, status, amount, blocks_payment, claimant_name, company_name')
      .eq('pay_application_id', id)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);
    // A failed read must stop the payment, not wave it through.
    if (wErr) throw wErr;
    const blocking = ((waivers as any[]) || []).filter(
      (w) => w.blocks_payment !== false && (w.status === 'pending' || w.status === 'sent'),
    );
    blockingCount = blocking.length;
    if (blocking.length > 0 && !opts.overrideWaivers) {
      return {
        ok: false,
        status: 409,
        error: `Payment hold — ${blocking.length} lien waiver${blocking.length === 1 ? '' : 's'} not signed yet.`,
        extra: {
          waiverBlock: true,
          pending: blocking.map((w) => ({ name: w.company_name || w.claimant_name || 'Sub', amount: w.amount })),
        },
      };
    }
    patch.payment_received_at = opts.payment?.receivedAt || now;
    if (opts.payment?.amount != null && Number.isFinite(Number(opts.payment.amount))) patch.payment_amount = Number(opts.payment.amount);
    if (opts.payment?.method) patch.payment_method = opts.payment.method;
    if (opts.payment?.checkNumber) patch.check_number = opts.payment.checkNumber;
    paidCascade = { waivers: ((waivers as any[]) || []) };
  }

  const { data: updated, error: upErr } = await db
    .from('pay_applications')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .eq('status', cur.status)
    .select('*')
    .maybeSingle();
  if (upErr) throw upErr;
  if (!updated) {
    // Someone else moved it between our read and our write.
    return { ok: false, status: 409, error: 'This pay application was just changed by someone else. Reload and try again.' };
  }

  const extra: Record<string, unknown> = {};
  if (to === 'paid' && paidCascade) {
    // ── (1) the prime contract's paid_amount tracks reality ──
    const paDue = Number(cur.current_payment_due) || 0;
    if (paDue > 0 && cur.project_id) {
      const { data: prime, error: primeErr } = await db
        .from('contracts')
        .select('id, paid_amount')
        .eq('tenant_id', tenantId)
        .eq('project_id', cur.project_id)
        .eq('contract_type', 'prime')
        .limit(1)
        .maybeSingle();
      if (primeErr) throw primeErr;
      if (prime) {
        await must(db.from('contracts')
          .update({ paid_amount: (Number(prime.paid_amount) || 0) + paDue })
          .eq('tenant_id', tenantId)
          .eq('id', prime.id), 'contracts paid_amount');
      }
    }
    // ── (2) signed conditionals convert to unconditional partials ──
    const signed = paidCascade.waivers.filter((w) => w.status === 'signed');
    for (const w of signed) {
      await must(db.from('lien_waivers').insert({
        tenant_id: tenantId,
        project_id: cur.project_id,
        sub_id: w.sub_id,
        subcontractor_id: w.subcontractor_id ?? w.sub_id,
        pay_application_id: id,
        waiver_type: 'unconditional_progress',
        amount: w.amount || 0,
        through_date: cur.period_to,
        status: 'pending',
        converted_from_id: w.id,
      }), 'lien_waivers unconditional insert');
    }
    extra.unconditionalWaivers = signed.length;
    extra.overrode = blockingCount > 0 && !!opts.overrideWaivers;
  }

  if (to === 'submitted') runInBackground(onPayAppSubmitted(id), 'onPayAppSubmitted');
  if (runApproval) runInBackground(onPayAppApproved(id), 'onPayAppApproved');
  if (to === 'certified') runInBackground(onPayAppCertified(id), 'onPayAppCertified');

  return { ok: true, changed: true, from, to, payApp: updated, extra };
}
