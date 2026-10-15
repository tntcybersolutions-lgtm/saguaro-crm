/**
 * Document kind → category, short code and "where it came from" link.
 * Drives the Documents library tiles, filters and Go to Record actions.
 * Colors stay inside the job palette (yellow / green / orange); the category
 * NAME carries the meaning, the color only groups.
 */

export type DocCategory = 'contracts' | 'billing' | 'compliance' | 'bidding' | 'field' | 'closeout' | 'other';

export const DOC_CATEGORY_LABEL: Record<DocCategory, string> = {
  contracts: 'Contracts & Bonds',
  billing: 'Billing',
  compliance: 'Compliance',
  bidding: 'Bidding',
  field: 'Field',
  closeout: 'Closeout',
  other: 'Other',
};

export const DOC_CATEGORY_COLOR: Record<DocCategory, string> = {
  contracts: '#E8FF2A',
  bidding: '#E8FF2A',
  billing: '#4ADE80',
  closeout: '#4ADE80',
  compliance: '#CBD5E1',
  field: '#CBD5E1',
  other: '#94A3B8',
};

const CATEGORY_BY_TYPE: Record<string, DocCategory> = {
  a101: 'contracts', g701: 'contracts', 'a310-bid-bond': 'contracts', 'a312-bond': 'contracts',
  'a312-performance-payment-bond': 'contracts', g707: 'contracts', subcontract: 'contracts',
  g702: 'billing', g703: 'billing', invoice: 'billing', purchase_order: 'billing',
  'coi-request': 'compliance', w9: 'compliance', wh347: 'compliance', 'wh347-certified-payroll': 'compliance',
  prevailing_wage: 'compliance', preliminary_notice: 'compliance',
  'bid-jacket': 'bidding',
  daily_report: 'field', jha: 'field', notice_to_proceed: 'field',
  'closeout-package': 'closeout', g704: 'closeout', g706: 'closeout', notice_of_completion: 'closeout',
  substantial_completion: 'closeout',
};

const CODE_BY_TYPE: Record<string, string> = {
  a101: 'A101', g701: 'G701', g702: 'G702', g703: 'G703', g704: 'G704', g706: 'G706', g707: 'G707',
  'a310-bid-bond': 'A310', 'a312-bond': 'A312', 'a312-performance-payment-bond': 'A312',
  invoice: 'INV', purchase_order: 'PO', subcontract: 'SUB',
  'coi-request': 'COI', w9: 'W-9', wh347: '347', 'wh347-certified-payroll': '347', prevailing_wage: 'PW',
  preliminary_notice: 'PN', notice_to_proceed: 'NTP', notice_of_completion: 'NOC', substantial_completion: 'SC',
  daily_report: 'DLY', jha: 'JHA', 'bid-jacket': 'BID', 'closeout-package': 'CLO',
};

export function docCategory(type: string | null | undefined): DocCategory {
  const t = String(type || '');
  if (t.startsWith('lien-waiver')) return 'compliance';
  return CATEGORY_BY_TYPE[t] || 'other';
}

export function docCode(type: string | null | undefined): string {
  const t = String(type || '');
  if (t.startsWith('lien-waiver')) return 'LW';
  return CODE_BY_TYPE[t] || t.replace(/[^a-z0-9]/gi, '').slice(0, 3).toUpperCase() || 'DOC';
}

/** The project screen that owns the record this PDF was generated from. */
export function docSourceHref(doc: { doc_type?: string | null; project_id?: string | null; source_id?: string | null }): string | null {
  const t = String(doc.doc_type || '');
  const p = doc.project_id;
  if (!p) return null;
  const base = `/app/projects/${p}`;
  if (t === 'bid-jacket') return doc.source_id ? `${base}/bid-packages/${doc.source_id}/jacket` : `${base}/bid-packages`;
  if (t.startsWith('lien-waiver')) return `${base}/lien-waivers`;
  const map: Record<string, string> = {
    g702: 'pay-apps', g703: 'pay-apps', invoice: 'invoices', purchase_order: 'purchase-orders', subcontract: 'contracts',
    a101: 'contracts', g701: 'change-orders', 'coi-request': 'insurance', w9: 'w9', wh347: 'payroll',
    'wh347-certified-payroll': 'payroll', prevailing_wage: 'payroll', daily_report: 'daily-logs', jha: 'safety',
    'closeout-package': 'closeout', g704: 'closeout', g706: 'closeout', g707: 'closeout',
    notice_of_completion: 'closeout', substantial_completion: 'closeout',
  };
  return map[t] ? `${base}/${map[t]}` : `${base}/overview`;
}
