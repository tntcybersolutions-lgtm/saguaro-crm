/**
 * lib/receipt-read.ts — what a photographed receipt or vendor invoice says,
 * in the shape the bill form takes.
 *
 * POST /api/bills/scan-receipt sends the image (or PDF) to the model with the
 * job's budget cost codes; the reply goes through normalizeReceipt, which
 * trusts nothing: money is parsed and rounded to cents, dates must be real
 * days, the cost code must be one of the job's (else only its CSI division is
 * kept), and the subtotal / tax / total are made to agree. The person then
 * checks the prefilled form and saves it as an ordinary bill.
 */
import { JSON_ONLY } from '@/lib/ai-json';

export type ReceiptFields = {
  vendor_name: string | null;
  vendor_email: string | null;
  bill_number: string | null;
  bill_date: string | null;
  due_date: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  description: string | null;
  cost_code: string | null;
  division: string | null;
  confidence: 'high' | 'medium' | 'low';
};

export function receiptPrompt(costCodes: Array<{ cost_code: string; description?: string | null }>): string {
  const codes = costCodes.length
    ? `This job's budget cost codes (choose the one this purchase belongs to, or null):\n${costCodes.slice(0, 120).map((c) => `- ${c.cost_code}${c.description ? ` — ${c.description}` : ''}`).join('\n')}`
    : 'This job has no cost-coded budget yet; leave cost_code null and give the two-digit CSI division.';
  return `You are reading a receipt or vendor invoice for a construction job so it can be entered as a bill.
Read only what is printed. Never guess a number that is not on the page — use null.

${codes}

Return this JSON object:
{
  "vendor_name": string|null,        // the business that was paid, as printed
  "vendor_email": string|null,
  "bill_number": string|null,        // invoice / receipt / transaction number
  "bill_date": "YYYY-MM-DD"|null,
  "due_date": "YYYY-MM-DD"|null,     // only if printed (e.g. "Due", "Net 30" with a date)
  "subtotal": number|null,           // before tax, in dollars
  "tax": number|null,
  "total": number|null,              // amount paid / due
  "description": string|null,        // a short plain summary of what was bought, under 120 characters
  "cost_code": string|null,          // exactly one of the job's codes above, or null
  "division": string|null,           // two-digit CSI division, e.g. "06" for lumber, "26" for electrical
  "confidence": "high"|"medium"|"low" // how legible and complete the document was
}
${JSON_ONLY}`;
}

const money = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};
const text = (v: unknown, max = 200): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s.slice(0, max) : null;
};
const day = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim().slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s;
};

/** Clean the model's reply into ReceiptFields. Pure. */
export function normalizeReceipt(raw: unknown, jobCostCodes: string[]): ReceiptFields {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  let subtotal = money(r.subtotal);
  let tax = money(r.tax);
  let total = money(r.total);
  // Make the three agree: two known → derive the third.
  if (total === null && subtotal !== null) total = Math.round((subtotal + (tax || 0)) * 100) / 100;
  if (subtotal === null && total !== null) subtotal = Math.round((total - (tax || 0)) * 100) / 100;
  if (tax === null && subtotal !== null && total !== null && total >= subtotal) tax = Math.round((total - subtotal) * 100) / 100;
  if (subtotal !== null && subtotal < 0) subtotal = null;

  const code = text(r.cost_code, 40);
  const cost_code = code && jobCostCodes.includes(code) ? code : null;
  const divRaw = String(r.division ?? cost_code ?? code ?? '').match(/\d{2}/)?.[0] ?? null;
  const email = text(r.vendor_email, 120);
  const conf = String(r.confidence || '').toLowerCase();

  return {
    vendor_name: text(r.vendor_name, 120),
    vendor_email: email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null,
    bill_number: text(r.bill_number, 60),
    bill_date: day(r.bill_date),
    due_date: day(r.due_date),
    subtotal,
    tax,
    total,
    description: text(r.description, 160),
    cost_code,
    division: divRaw,
    confidence: conf === 'high' || conf === 'medium' ? conf : 'low',
  };
}
