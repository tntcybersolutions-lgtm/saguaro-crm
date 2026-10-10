/**
 * A job's subcontractors, as the job's Subcontractors page shows them.
 *
 * The company lives once in the tenant directory (`subcontractors`); being on
 * a job is a `project_subcontractors` row, which carries what the company is
 * contracted for on that job. A company can hold more than one row on the same
 * job (two scopes, two awarded packages) — the page shows one line per company
 * with the amounts summed, like lib/project-subs does for the pay-app engine.
 */

/** The company fields the job page reads and edits (real `subcontractors` columns). */
export const COMPANY_FIELDS = ['company_name', 'trade', 'contact_name', 'contact_email', 'contact_phone', 'license_number'] as const;
export type CompanyField = (typeof COMPANY_FIELDS)[number];

export interface JobLinkRow {
  id: string;
  subcontractor_id: string;
  contract_amount: number | string | null;
  status: string | null;
  bid_package_id: string | null;
  created_at: string | null;
  subcontractors: Record<string, unknown> | null;
}

export interface JobSub {
  /** subcontractors.id — the company. */
  id: string;
  company_name: string;
  trade: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  license_number: string | null;
  insurance_expiry: string | null;
  w9_on_file: boolean | null;
  /** The company's directory status (active, prequalified, suspended…). */
  status: string | null;
  /** Summed over this company's rows on this job. */
  contract_amount: number;
  /** Their invoices on this job marked Paid in the sub portal. */
  paid_amount: number;
  /** project_subcontractors ids on this job. */
  assignment_ids: string[];
  /** At least one row came from a bid-package award. */
  from_award: boolean;
  added_at: string | null;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string | null => (v == null || v === '' ? null : String(v));

/** Trimmed text, or null when blank. */
export function cleanText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

/** A dollar amount from a form: blank → null, "$12,500" → 12500, negative or junk → 'invalid'. */
export function parseAmount(v: unknown): number | null | 'invalid' {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? v : 'invalid';
  const s = String(v).replace(/[$,\s]/g, '');
  if (!s) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return 'invalid';
  return Number(s);
}

/**
 * What an Add or Edit changes on the company: the fields sent that differ from
 * what is on file. Blank never clears a field here — clearing is an explicit
 * edit (`allowClear`), not a side effect of adding a company to a job.
 */
export function companyUpdates(body: Record<string, unknown>, current: Record<string, unknown>, allowClear = false): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const k of COMPANY_FIELDS) {
    const raw = k === 'company_name' ? (body.company_name ?? body.name) : body[k];
    if (raw === undefined) continue;
    const v = cleanText(raw);
    if (v === null && (!allowClear || k === 'company_name')) continue;
    if (v !== (current[k] ?? null)) out[k] = v;
  }
  // The older email/phone columns, read by screens that predate contact_*,
  // follow the contact's only when they were empty or the same as before.
  if ('contact_email' in out && (!current.email || current.email === current.contact_email)) out.email = out.contact_email;
  if ('contact_phone' in out && (!current.phone || current.phone === current.contact_phone)) out.phone = out.contact_phone;
  return out;
}

/** One line per company on the job, amounts summed, paid totals attached. */
export function groupJobSubs(
  links: JobLinkRow[],
  paid: { sub_id: string | null; amount: number | string | null; net_amount: number | string | null }[] = [],
): JobSub[] {
  const paidBySub = new Map<string, number>();
  for (const p of paid) {
    if (!p.sub_id) continue;
    paidBySub.set(p.sub_id, (paidBySub.get(p.sub_id) || 0) + num(p.net_amount ?? p.amount));
  }
  const bySub = new Map<string, JobSub>();
  for (const l of links) {
    const s = l.subcontractors;
    if (!l.subcontractor_id || !s) continue;
    const cur = bySub.get(l.subcontractor_id);
    if (cur) {
      cur.contract_amount += num(l.contract_amount);
      cur.assignment_ids.push(l.id);
      cur.from_award = cur.from_award || !!l.bid_package_id;
      continue;
    }
    bySub.set(l.subcontractor_id, {
      id: l.subcontractor_id,
      company_name: str(s.company_name) || '',
      trade: str(s.trade),
      contact_name: str(s.contact_name),
      contact_email: str(s.contact_email) ?? str(s.email),
      contact_phone: str(s.contact_phone) ?? str(s.phone),
      license_number: str(s.license_number),
      insurance_expiry: str(s.insurance_expiry),
      w9_on_file: s.w9_on_file == null ? null : s.w9_on_file === true,
      status: str(s.status),
      contract_amount: num(l.contract_amount),
      paid_amount: paidBySub.get(l.subcontractor_id) || 0,
      assignment_ids: [l.id],
      from_award: !!l.bid_package_id,
      added_at: l.created_at,
    });
  }
  return [...bySub.values()].sort((a, b) => a.company_name.localeCompare(b.company_name));
}
