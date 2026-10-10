/**
 * A sub's portal invoice, as the GC moves it along.
 *
 *   submitted ─▶ under_review ─▶ approved ─▶ paid
 *        └──────────┴──────────▶ rejected
 *
 * The sub files it from the portal (status 'submitted'); the GC reviews,
 * approves or sends it back, then marks it paid. Approved and paid are what
 * unlock the sub's conditional / unconditional lien waiver in the portal
 * (lib/sub-lien-waiver waiverTypeForInvoice). Paid and rejected are final:
 * a rejected invoice is re-filed as a new one, so the history stays honest.
 */

export type SubInvoiceStatus = 'submitted' | 'under_review' | 'approved' | 'paid' | 'rejected';
export type SubInvoiceAction = 'review' | 'approve' | 'reject' | 'paid';

const NEXT: Record<SubInvoiceAction, { to: SubInvoiceStatus; from: SubInvoiceStatus[] }> = {
  review: { to: 'under_review', from: ['submitted'] },
  approve: { to: 'approved', from: ['submitted', 'under_review'] },
  reject: { to: 'rejected', from: ['submitted', 'under_review', 'approved'] },
  paid: { to: 'paid', from: ['approved'] },
};

export function isSubInvoiceAction(a: unknown): a is SubInvoiceAction {
  return typeof a === 'string' && a in NEXT;
}

/** Normalised current status (unknown / blank reads as submitted — that is what the portal files). */
export function invoiceStatus(s: unknown): SubInvoiceStatus {
  const v = typeof s === 'string' ? s.trim().toLowerCase().replace(/[\s-]+/g, '_') : '';
  return (['submitted', 'under_review', 'approved', 'paid', 'rejected'] as const).find((x) => x === v) ?? 'submitted';
}

/** The status an action moves to, or why it can't from here. */
export function invoiceTransition(current: unknown, action: SubInvoiceAction): { ok: true; to: SubInvoiceStatus } | { ok: false; message: string } {
  const from = invoiceStatus(current);
  const step = NEXT[action];
  if (step.from.includes(from)) return { ok: true, to: step.to };
  const words: Record<SubInvoiceStatus, string> = {
    submitted: 'still waiting on review', under_review: 'under review', approved: 'already approved', paid: 'already paid', rejected: 'already sent back',
  };
  const verb: Record<SubInvoiceAction, string> = { review: 'start a review on', approve: 'approve', reject: 'send back', paid: 'mark paid' };
  return { ok: false, message: `This invoice is ${words[from]}, so you can't ${verb[action]} it.` };
}

/** What the GC can do next, in the order the buttons show. */
export function invoiceActions(current: unknown): SubInvoiceAction[] {
  const from = invoiceStatus(current);
  return (['review', 'approve', 'paid', 'reject'] as SubInvoiceAction[]).filter((a) => NEXT[a].from.includes(from));
}

export const INVOICE_STATUS_LABEL: Record<SubInvoiceStatus, string> = {
  submitted: 'Submitted', under_review: 'Under review', approved: 'Approved', paid: 'Paid', rejected: 'Sent back',
};
