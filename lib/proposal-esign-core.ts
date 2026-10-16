/**
 * lib/proposal-esign-core.ts — the pure half of proposal e-signature: line-item
 * math, the frozen content snapshot, its canonical serialization, the consent
 * wording and the status a request is really in. No database, no Node APIs, so
 * the deal page, the public signing page and the server all compute the same
 * total and read the same status. The server half is lib/proposal-esign.ts.
 */

export interface ProposalLineItem {
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
}

export interface SnapshotLine extends ProposalLineItem {
  amount: number;
}

/** Exactly what the customer is shown and signs. Frozen at send, hashed, never edited. */
export interface ProposalSnapshot {
  v: 1;
  proposal_id: string;
  title: string;
  number: string | null;
  company: { name: string; logo_url: string | null };
  prepared_for: { name: string; company: string | null; email: string };
  project_name: string | null;
  line_items: SnapshotLine[];
  total: number;
  introduction: string | null;
  scope: string | null;
  payment_terms: string | null;
  exclusions: string | null;
  valid_until: string | null;
  sent_at: string;
}

/** The ESIGN / UETA consent the signer ticks. Stored verbatim with the signature. */
export const ESIGN_CONSENT_TEXT =
  'I agree to sign electronically. I understand that my electronic signature on this proposal is legally binding, ' +
  'the same as a handwritten signature, and that I may ask the sender for a paper copy at no charge.';

export const MAX_LINE_ITEMS = 200;

const cents = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => {
  const n = typeof v === 'string' ? Number(v.replace(/[$,\s]/g, '')) : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Clean line items from any input: blank rows dropped, numbers coerced, text capped. */
export function normalizeLineItems(raw: unknown): ProposalLineItem[] {
  if (!Array.isArray(raw)) return [];
  const out: ProposalLineItem[] = [];
  for (const r of raw.slice(0, MAX_LINE_ITEMS)) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const description = text(o.description, 500);
    const quantity = cents(num(o.quantity ?? 1));
    const unit_price = cents(num(o.unit_price));
    if (!description && !unit_price) continue;
    out.push({ description, quantity, unit: text(o.unit, 24), unit_price });
  }
  return out;
}

export function lineAmount(l: ProposalLineItem): number {
  return cents(num(l.quantity) * num(l.unit_price));
}

/** The proposal's total: the line items when there are any, else the stored amount. */
export function proposalTotal(lines: ProposalLineItem[], fallbackAmount: unknown): number {
  if (lines.length) return cents(lines.reduce((s, l) => s + lineAmount(l), 0));
  return cents(num(fallbackAmount));
}

/**
 * Stable JSON: object keys sorted at every depth, so the same content always
 * serializes to the same bytes and therefore the same SHA-256.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const o = value as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
}

export type SignStatus = 'sent' | 'viewed' | 'signed' | 'declined' | 'voided' | 'expired';

/** What a request really is right now: an open link past its date is expired. */
export function effectiveStatus(row: { status: string; expires_at: string | null }, now = Date.now()): SignStatus {
  const s = row.status as SignStatus;
  if ((s === 'sent' || s === 'viewed') && row.expires_at && new Date(row.expires_at).getTime() <= now) return 'expired';
  return s;
}

export const SIGN_STATUS_LABEL: Record<SignStatus, string> = {
  sent: 'Sent', viewed: 'Viewed', signed: 'Signed', declined: 'Declined', voided: 'Voided', expired: 'Expired',
};

/** A sign token is 32 random bytes, base64url: 43 characters. Anything else is not one. */
export function looksLikeToken(t: unknown): t is string {
  return typeof t === 'string' && /^[A-Za-z0-9_-]{43}$/.test(t);
}

export function money(n: unknown): string {
  return '$' + num(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
