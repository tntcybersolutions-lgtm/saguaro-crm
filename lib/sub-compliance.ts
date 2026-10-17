/**
 * Is this sub compliant? ONE rule, read by every screen and gate that asks.
 *
 * WHY. Four readers each answered from a different table:
 *   - the Compliance scorecard (/api/compliance) read subcontractors.w9_on_file
 *     plus insurance_certificates;
 *   - the W-9 screen read only w9_requests, so a sub whose W-9 the GC had
 *     marked on file (no request ever sent) showed "W-9 missing";
 *   - the sub portal's invoice gate read only portal_sub_compliance_docs, so a
 *     sub the scorecard called 100/100 compliant could not send an invoice;
 *   - the award gate read w9_on_file and the certificates.
 * Measured on production 17 Oct 2026: the four active subs on the Pima job
 * were "Compliant 100/100" on Compliance and "W-9 missing" on W-9 Requests.
 *
 * THE RULE. A sub is compliant when
 *   W-9 on file  — the directory says so (subcontractors.w9_on_file), or a W-9
 *                  request came back submitted, or the sub uploaded a W-9 in
 *                  their portal that the GC has not rejected; and
 *   insured      — a current General Liability coverage (lib/coi-coverage,
 *                  which already reads certificates and the directory's COI
 *                  date the one way), or a COI the sub uploaded in their portal
 *                  that is not rejected and not past its expiry day.
 * Anything else is a hold, and `missing` names what to collect.
 *
 * Leaf logic is pure; loadSubCompliance does the reads, pinned to the tenant.
 */
import { coiStatus, COI_CERT_COLUMNS, type CoiCertRow, type CoiStatus } from './coi-coverage';
import { daysUntilDay } from './calendar-day';

type Rec = Record<string, unknown>;
const str = (v: unknown) => (v == null ? '' : String(v)).trim();
const low = (v: unknown) => str(v).toLowerCase();

export type W9State = 'on_file' | 'requested' | 'missing';
export type InsuranceState = 'current' | 'expiring' | 'missing';
export type ComplianceNeed = 'w9' | 'insurance';

export type SubComplianceInput = {
  sub: { w9_on_file?: boolean | null; insurance_expiry?: string | null };
  certs?: CoiCertRow[] | null;
  /** w9_requests rows for this sub (matched by email or company name). */
  w9Requests?: Array<{ status?: unknown; submitted_at?: unknown }> | null;
  /** portal_sub_compliance_docs rows for this sub. */
  portalDocs?: Array<{ doc_type?: unknown; expiry_date?: unknown; status?: unknown }> | null;
};

export type SubCompliance = {
  compliant: boolean;
  missing: ComplianceNeed[];
  w9: W9State;
  insurance: InsuranceState;
  /** Soonest current expiry across what counted (YYYY-MM-DD), for display. */
  insuranceExpiry: string | null;
  coi: CoiStatus;
};

const DEAD_DOC = new Set(['rejected', 'expired', 'void', 'voided', 'deleted']);
const W9_DONE = new Set(['submitted', 'received', 'approved', 'complete', 'completed', 'on_file']);

/** A portal upload of `type` that still counts today. */
function livePortalDoc(docs: SubComplianceInput['portalDocs'], type: ComplianceNeed, today: string) {
  return (docs || []).filter((d) => {
    const t = low(d.doc_type);
    const isType = type === 'w9' ? (t === 'w9' || t === 'w-9') : (t === 'insurance' || t === 'coi');
    if (!isType || DEAD_DOC.has(low(d.status))) return false;
    const exp = str(d.expiry_date);
    if (!exp) return true;
    const days = daysUntilDay(exp, today);
    return days === null || days >= 0;
  });
}

export function subCompliance(input: SubComplianceInput, today: string): SubCompliance {
  const coi = coiStatus(input.certs || [], today, input.sub.insurance_expiry ?? null);

  const w9OnFile = input.sub.w9_on_file === true
    || (input.w9Requests || []).some((r) => W9_DONE.has(low(r.status)) || !!r.submitted_at)
    || livePortalDoc(input.portalDocs, 'w9', today).length > 0;
  const w9Asked = (input.w9Requests || []).length > 0;
  const w9: W9State = w9OnFile ? 'on_file' : w9Asked ? 'requested' : 'missing';

  const portalCoi = livePortalDoc(input.portalDocs, 'insurance', today);
  const insured = coi.hasGL || portalCoi.length > 0;
  let soonest = coi.soonestExpiry;
  for (const d of portalCoi) { const e = str(d.expiry_date).slice(0, 10); if (e && (!soonest || e < soonest)) soonest = e; }
  const days = soonest ? daysUntilDay(soonest, today) : null;
  const insurance: InsuranceState = !insured ? 'missing' : (coi.expiringCerts > 0 || (days !== null && days <= 30)) ? 'expiring' : 'current';

  const missing: ComplianceNeed[] = [];
  if (!insured) missing.push('insurance');
  if (!w9OnFile) missing.push('w9');
  return { compliant: missing.length === 0, missing, w9, insurance, insuranceExpiry: soonest, coi };
}

/** Plain words for what is missing ("W-9 and insurance certificate"). */
export function missingWords(missing: ComplianceNeed[]): string {
  return missing.map((m) => (m === 'w9' ? 'W-9' : 'insurance certificate')).join(' and ');
}

/* ── I/O ─────────────────────────────────────────────────────────────── */

type Db = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export type SubRow = { id: string; company_name?: string | null; email?: string | null; contact_email?: string | null; w9_on_file?: boolean | null; insurance_expiry?: string | null };

/**
 * The rule for each sub, keyed by sub id. Pass the subs' directory rows when
 * the caller already has them; otherwise ids are enough and they are read here.
 */
export async function loadSubCompliance(db: Db, tenantId: string, subsOrIds: Array<SubRow | string>, today: string): Promise<Map<string, SubCompliance>> {
  const out = new Map<string, SubCompliance>();
  let subs = subsOrIds.filter((s): s is SubRow => typeof s !== 'string');
  const ids = subsOrIds.filter((s): s is string => typeof s === 'string');
  if (ids.length) {
    const { data, error } = await db.from('subcontractors').select('id, company_name, email, contact_email, w9_on_file, insurance_expiry')
      .eq('tenant_id', tenantId).in('id', ids);
    if (error) throw error;
    subs = subs.concat((data || []) as SubRow[]);
  }
  if (!subs.length) return out;
  const subIds = subs.map((s) => s.id);
  const emails = Array.from(new Set(subs.flatMap((s) => [low(s.email), low(s.contact_email)]).filter(Boolean)));

  const [certs, docs, w9s] = await Promise.all([
    db.from('insurance_certificates').select(`sub_id, ${COI_CERT_COLUMNS}`).eq('tenant_id', tenantId).in('sub_id', subIds),
    db.from('portal_sub_compliance_docs').select('sub_id, doc_type, expiry_date, status').eq('tenant_id', tenantId).in('sub_id', subIds),
    db.from('w9_requests').select('vendor_email, vendor_name, status, submitted_at').eq('tenant_id', tenantId),
  ]);
  for (const r of [certs, docs, w9s]) if (r.error) throw r.error;

  const by = <T extends Rec>(rows: T[], key: string) => {
    const m = new Map<string, T[]>();
    for (const r of rows) { const k = str(r[key]); if (!k) continue; (m.get(k) || m.set(k, []).get(k)!).push(r); }
    return m;
  };
  const certMap = by((certs.data || []) as Rec[], 'sub_id');
  const docMap = by((docs.data || []) as Rec[], 'sub_id');
  const w9Rows = (w9s.data || []) as Rec[];
  const emailSet = new Set(emails);

  for (const s of subs) {
    const mineEmails = new Set([low(s.email), low(s.contact_email)].filter(Boolean));
    const name = low(s.company_name);
    const reqs = w9Rows.filter((r) => (emailSet.has(low(r.vendor_email)) && mineEmails.has(low(r.vendor_email))) || (name && low(r.vendor_name) === name));
    out.set(s.id, subCompliance({
      sub: s,
      certs: (certMap.get(s.id) || []) as CoiCertRow[],
      w9Requests: reqs,
      portalDocs: docMap.get(s.id) || [],
    }, today));
  }
  return out;
}
