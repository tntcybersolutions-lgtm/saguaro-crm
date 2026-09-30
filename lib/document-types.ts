/**
 * document-types — the slug a generator files a document under, and the words
 * a human should see for it.
 *
 * WHY THIS IS A MODULE AND NOT A CONST IN THE PAGE.
 *
 * The Documents library kept its own slug -> label map. Twelve of its
 * twenty-three keys named slugs that nothing in the product ever writes
 * ('a310', 'a312', 'ntp', 'closeout', 'daily-report', 'purchase-order',
 * 'lien-waiver', 'preliminary-notice', 'notice-completion', 'prevailing-wage',
 * 'pay-application', 'wh347-certified-payroll' was missing entirely) because
 * the map was written from memory rather than from the saveDocument() calls.
 * Every one of those rows fell through to the prettifier and rendered as
 * "Wh347 Certified Payroll", "Coi Request" or "Notice To Proceed".
 *
 * The labels now live next to the filer, so a new generator picks up its label
 * by filing under a slug that is listed here, and the library and the filer can
 * never disagree about what a document is called.
 *
 * Keys below are the exact strings passed to saveDocument(). Do not add a key
 * without a call site that writes it.
 */

export const DOC_TYPE_LABELS: Record<string, string> = {
  /* AIA contract forms */
  a101: 'AIA A101 Owner–Contractor Agreement',
  'a310-bid-bond': 'AIA A310 Bid Bond',
  'a312-bond': 'AIA A312 Bond',
  'a312-performance-payment-bond': 'AIA A312 Performance & Payment Bond',
  g701: 'AIA G701 Change Order',
  g702: 'AIA G702 Application for Payment',
  g703: 'AIA G703 Continuation Sheet',
  g704: 'AIA G704 Certificate of Substantial Completion',
  g706: "AIA G706 Contractor's Affidavit",
  g707: 'AIA G707 Consent of Surety',

  /* Money */
  invoice: 'Invoice',
  purchase_order: 'Purchase Order',
  subcontract: 'Subcontract',

  /* Payroll & labour compliance */
  wh347: 'WH-347 Certified Payroll',
  'wh347-certified-payroll': 'WH-347 Certified Payroll',
  prevailing_wage: 'Prevailing Wage Statement',
  w9: 'IRS Form W-9',

  /* Notices & lien chain */
  notice_to_proceed: 'Notice to Proceed',
  notice_of_completion: 'Notice of Completion',
  preliminary_notice: 'Preliminary Notice',
  substantial_completion: 'Certificate of Substantial Completion',

  /* Field & safety */
  daily_report: 'Daily Report',
  jha: 'Job Hazard Analysis',

  /* Packages */
  'bid-jacket': 'Bid Jacket',
  'closeout-package': 'Closeout Package',
  'coi-request': 'Insurance Certificate Request',
};

/**
 * Slug families whose suffix carries a variant, e.g.
 * 'lien-waiver-conditional_progress'. Longest prefix wins.
 */
const PREFIX_LABELS: Array<[string, string]> = [
  ['lien-waiver-', 'Lien Waiver'],
];

const prettify = (t: string) =>
  t.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** Human label for a doc_type slug. Never returns empty. */
export function docTypeLabel(t: string | null | undefined): string {
  if (!t) return 'Document';
  const exact = DOC_TYPE_LABELS[t];
  if (exact) return exact;

  let best: string | null = null;
  let bestLen = 0;
  for (const [prefix, label] of PREFIX_LABELS) {
    if (t.startsWith(prefix) && prefix.length > bestLen) { best = label; bestLen = prefix.length; }
  }
  if (best) {
    const variant = t.slice(bestLen);
    return variant ? `${best} — ${prettify(variant)}` : best;
  }
  return prettify(t);
}
