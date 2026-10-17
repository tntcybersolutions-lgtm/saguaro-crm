/**
 * contract-fields — the blanks a GC fills in, and where each one comes from.
 *
 * The 23 document generators in this folder each derive every value from the
 * database and hand back a finished PDF. That is fire-and-forget: press a
 * button, a document appears, and there is nowhere to look at it or change a
 * number before it goes to a subcontractor. A GC will not sign off on that,
 * which is why the templates already in the product do not feel like templates.
 *
 * This is the layer in between. It describes each contract as a list of fields:
 * what to call it, what kind of control it wants, and — critically — what the
 * system already knows so the GC types as little as possible. Every field stays
 * editable; an autofilled value is a starting point, never a lock.
 *
 * The generators are unchanged in how they derive defaults. They gain an
 * `overrides` bag, and print `overrides.x ?? derived.x`. One source of truth,
 * one document, and the form only supplies what a person actually changed.
 */

export type FieldKind =
  | 'text'        // single line
  | 'textarea'    // scope, exclusions, special conditions
  | 'money'
  | 'percent'
  | 'date'
  | 'select'
  | 'checklist';  // standard exclusions — tick what does not apply

export interface ContractField {
  /** Key sent back in `overrides`. Matches the generator's own variable name. */
  key: string;
  label: string;
  kind: FieldKind;
  /** Shown under the field. Say what the value DOES, not what it is. */
  hint?: string;
  /** select / checklist only. */
  options?: string[];
  /** Blocks generation when empty. */
  required?: boolean;
  /** Groups fields into cards on the form. */
  section: string;
  /** Half-width on desktop. */
  half?: boolean;
}

/* ── shared option sets ──────────────────────────────────────────────────── */

export const CONTRACT_TYPES = [
  'Lump Sum',
  'Lump Sum GMP',
  'Cost Plus Fee',
  'Cost Plus with GMP',
  'Time & Materials',
  'Unit Price',
];

export const PAYMENT_TERMS = [
  'Net 30 after Owner payment',
  'Net 45 after Owner payment',
  'Net 30',
  'Net 45',
  'Net 60',
  'Pay-when-paid',
  'Pay-if-paid',
];

export const RETAINAGE_OPTIONS = ['0', '5', '7.5', '10'];

export const GL_LIMITS = [
  '$1,000,000 per occurrence / $2,000,000 aggregate',
  '$2,000,000 per occurrence / $4,000,000 aggregate',
  '$5,000,000 per occurrence / $5,000,000 aggregate',
];

/**
 * The exclusions that start most scope disputes. Offered as a checklist rather
 * than free text because the argument is never about wording — it is about
 * whether anyone thought to say it at all.
 */
export const STANDARD_EXCLUSIONS = [
  'Cutting, patching and repair of other trades’ work',
  'Temporary power, water and lighting',
  'Hoisting, cranes and material handling above grade',
  'Dumpsters and removal of debris beyond own trade',
  'Layout and survey control',
  'Winter conditions, heat and temporary enclosure',
  'Permits and fees other than the trade permit',
  'Engineering, stamped drawings and deferred submittals',
  'Overtime, shift work and premium time',
  'Testing, special inspections and third-party commissioning',
  'Fire-stopping and smoke sealing at penetrations',
  'Painting, finishing and touch-up',
  'Concrete pads, housekeeping pads and equipment bases',
  'Excavation, backfill and compaction',
  'Bonds (unless separately priced)',
];

/* ── the four contracts ──────────────────────────────────────────────────── */

const PARTIES = 'Parties';
const MONEY = 'Money & terms';
const SCOPE = 'Scope';
const DATES = 'Dates';
const INSURANCE = 'Insurance & bonds';

export const SUBCONTRACT_FIELDS: ContractField[] = [
  { key: 'contractorName', label: 'Contractor', kind: 'text', section: PARTIES, required: true,
    hint: 'The entity signing as Contractor. Prints on every page and in the signature block.' },
  { key: 'subName', label: 'Subcontractor', kind: 'text', section: PARTIES, required: true },
  { key: 'subAddress', label: 'Subcontractor address', kind: 'text', section: PARTIES },
  { key: 'subLicense', label: 'License number', kind: 'text', section: PARTIES, half: true,
    hint: 'Prints on the contract and is checked against the sub record at award.' },
  { key: 'subTrade', label: 'Trade', kind: 'text', section: PARTIES, half: true },

  { key: 'scope', label: 'Scope of work', kind: 'textarea', section: SCOPE, required: true,
    hint: 'Article 2. Seeded from the bid package scope when the contract is raised from one.' },
  { key: 'inclusions', label: 'Specifically included', kind: 'textarea', section: SCOPE },
  { key: 'exclusions', label: 'Exclusions', kind: 'checklist', section: SCOPE, options: STANDARD_EXCLUSIONS,
    hint: 'Tick everything this sub is NOT doing. Unticked is not the same as unsaid — this list is where scope disputes start.' },
  { key: 'exclusionsOther', label: 'Other exclusions', kind: 'textarea', section: SCOPE },

  { key: 'subAmount', label: 'Subcontract sum', kind: 'money', section: MONEY, required: true,
    hint: 'Article 3. Seeded from the awarded bid amount.' },
  { key: 'contractType', label: 'Contract type', kind: 'select', options: CONTRACT_TYPES, section: MONEY, half: true },
  { key: 'retainagePct', label: 'Retainage %', kind: 'select', options: RETAINAGE_OPTIONS, section: MONEY, half: true,
    hint: 'Your portfolio standard unless this job differs.' },
  { key: 'paymentTerms', label: 'Payment terms', kind: 'select', options: PAYMENT_TERMS, section: MONEY,
    hint: 'Article 4. Pay-if-paid is unenforceable in some states — check before using it.' },

  { key: 'startDate', label: 'Start on site', kind: 'date', section: DATES, half: true },
  { key: 'completionDate', label: 'Substantial completion', kind: 'date', section: DATES, half: true,
    hint: 'Seeded from the project schedule.' },
  { key: 'liquidatedDamages', label: 'Liquidated damages / day', kind: 'money', section: DATES, half: true },

  { key: 'glLimits', label: 'General liability limits', kind: 'select', options: GL_LIMITS, section: INSURANCE },
  { key: 'bondRequired', label: 'Payment & performance bond', kind: 'select', section: INSURANCE, half: true,
    options: ['Not required', 'Required — 100% of subcontract sum', 'Required — 50% of subcontract sum'] },
  { key: 'specialConditions', label: 'Special conditions', kind: 'textarea', section: INSURANCE,
    hint: 'Anything this job needs that the standard articles do not cover.' },
];

export const PURCHASE_ORDER_FIELDS: ContractField[] = [
  { key: 'contractorName', label: 'Buyer', kind: 'text', section: PARTIES, required: true },
  { key: 'vendorName', label: 'Vendor', kind: 'text', section: PARTIES, required: true },
  { key: 'vendorAddress', label: 'Vendor address', kind: 'text', section: PARTIES },
  { key: 'shipTo', label: 'Ship to', kind: 'text', section: PARTIES,
    hint: 'Defaults to the project address.' },
  { key: 'description', label: 'Materials / description', kind: 'textarea', section: SCOPE, required: true },
  { key: 'poAmount', label: 'PO total', kind: 'money', section: MONEY, required: true },
  { key: 'paymentTerms', label: 'Payment terms', kind: 'select', options: PAYMENT_TERMS, section: MONEY, half: true },
  { key: 'taxable', label: 'Taxable', kind: 'select', options: ['Taxable', 'Tax exempt'], section: MONEY, half: true },
  { key: 'deliveryDate', label: 'Required on site', kind: 'date', section: DATES, half: true },
  { key: 'freightTerms', label: 'Freight', kind: 'select', section: DATES, half: true,
    options: ['FOB jobsite, freight prepaid', 'FOB origin, freight collect', 'Delivered, included in price'] },
];

export const CHANGE_ORDER_FIELDS: ContractField[] = [
  { key: 'contractorName', label: 'Contractor', kind: 'text', section: PARTIES, required: true },
  { key: 'counterparty', label: 'Issued to', kind: 'text', section: PARTIES, required: true,
    hint: 'The owner on a prime change order, the sub on a subcontract one.' },
  { key: 'coNumber', label: 'Change order number', kind: 'text', section: PARTIES, half: true,
    hint: 'Next in this project’s sequence.' },
  { key: 'reason', label: 'Reason for change', kind: 'select', section: SCOPE, half: true,
    options: ['Owner-directed change', 'Design clarification', 'Unforeseen condition', 'Code or authority requirement', 'Schedule acceleration', 'Error or omission'] },
  { key: 'description', label: 'Description of change', kind: 'textarea', section: SCOPE, required: true },
  { key: 'costImpact', label: 'Cost impact', kind: 'money', section: MONEY, required: true,
    hint: 'Negative for a credit.' },
  { key: 'scheduleImpactDays', label: 'Schedule impact (days)', kind: 'text', section: MONEY, half: true },
  { key: 'newContractSum', label: 'Revised contract sum', kind: 'money', section: MONEY, half: true,
    hint: 'Original sum plus every executed change to date, including this one.' },
];

export const PRIME_CONTRACT_FIELDS: ContractField[] = [
  { key: 'ownerName', label: 'Owner', kind: 'text', section: PARTIES, required: true },
  { key: 'ownerAddress', label: 'Owner address', kind: 'text', section: PARTIES },
  { key: 'contractorName', label: 'Contractor', kind: 'text', section: PARTIES, required: true },
  { key: 'architectName', label: 'Architect', kind: 'text', section: PARTIES, half: true },
  { key: 'architectEmail', label: 'Architect email', kind: 'text', section: PARTIES, half: true },
  { key: 'scope', label: 'The work', kind: 'textarea', section: SCOPE, required: true },
  { key: 'contractSum', label: 'Contract sum', kind: 'money', section: MONEY, required: true },
  { key: 'contractType', label: 'Contract type', kind: 'select', options: CONTRACT_TYPES, section: MONEY, half: true },
  { key: 'retainagePct', label: 'Retainage %', kind: 'select', options: RETAINAGE_OPTIONS, section: MONEY, half: true },
  { key: 'paymentTerms', label: 'Payment terms', kind: 'select', options: PAYMENT_TERMS, section: MONEY },
  { key: 'awardDate', label: 'Date of agreement', kind: 'date', section: DATES, half: true },
  { key: 'ntpDate', label: 'Notice to proceed', kind: 'date', section: DATES, half: true },
  { key: 'substantialDate', label: 'Substantial completion', kind: 'date', section: DATES, half: true },
  { key: 'liquidatedDamages', label: 'Liquidated damages / day', kind: 'money', section: DATES, half: true },
  { key: 'glLimits', label: 'General liability limits', kind: 'select', options: GL_LIMITS, section: INSURANCE },
  { key: 'specialConditions', label: 'Special conditions', kind: 'textarea', section: INSURANCE },
];

export type ContractKind = 'subcontract' | 'purchase-order' | 'change-order' | 'prime-contract';

export const CONTRACT_FORMS: Record<ContractKind, { title: string; blurb: string; fields: ContractField[] }> = {
  'subcontract': {
    title: 'Subcontract',
    blurb: 'AIA-shaped subcontract agreement. Seven articles, your scope and exclusions.',
    fields: SUBCONTRACT_FIELDS,
  },
  'purchase-order': {
    title: 'Purchase order',
    blurb: 'Materials and equipment, with delivery and freight terms.',
    fields: PURCHASE_ORDER_FIELDS,
  },
  'change-order': {
    title: 'Change order',
    blurb: 'Cost and schedule impact against the current contract sum.',
    fields: CHANGE_ORDER_FIELDS,
  },
  'prime-contract': {
    title: 'Prime contract',
    blurb: 'Owner–Contractor agreement, with the architect named.',
    fields: PRIME_CONTRACT_FIELDS,
  },
};

/** Fields grouped into the cards the form renders. Order follows the array. */
export function sectionsFor(kind: ContractKind): Array<{ section: string; fields: ContractField[] }> {
  const out: Array<{ section: string; fields: ContractField[] }> = [];
  for (const f of CONTRACT_FORMS[kind].fields) {
    let group = out.find((g) => g.section === f.section);
    if (!group) { group = { section: f.section, fields: [] }; out.push(group); }
    group.fields.push(f);
  }
  return out;
}
