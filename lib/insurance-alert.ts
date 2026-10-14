/**
 * Who hears about an expiring insurance certificate, and under what name.
 *
 * The trigger (lib/triggers.ts onInsuranceExpiring) used to embed
 * `subcontractors(name, email)`. subcontractors has no `name` column — it is
 * company_name — so PostgREST rejected the whole select ("column
 * subcontractors_1.name does not exist"), the error was never read, the cert
 * came back null, and the COI-expiring email never went out.
 *
 * Live columns, read from information_schema on 10 Oct 2026:
 *   subcontractors: company_name, contact_name, email, contact_email
 *   insurance_certificates: sub_id (FK → subcontractors), sub_name (NOT NULL),
 *     policy_type, expiry_date, project_id (FK → projects), last_checked_at
 *   projects: name, gc_email, pm_email, tenant_id (gc_email is rarely filled in;
 *     the project PM stands in for the GC)
 */

export const INSURANCE_ALERT_SELECT =
  '*, subcontractors(company_name, email, contact_email), projects(name, gc_email, pm_email, tenant_id)';

type Embedded<T> = T | T[] | null | undefined;
const one = <T>(v: Embedded<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const clean = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s || null;
};

export interface InsuranceAlertParties {
  subName: string;
  subEmail: string | null;
  gcEmail: string | null;
  projectName: string | null;
  tenantId: string | null;
}

/**
 * Recipients and display name from one certificate row fetched with
 * INSURANCE_ALERT_SELECT. Null when the certificate has no project, because
 * the alert has nowhere to point.
 */
export function insuranceAlertParties(cert: {
  sub_name?: unknown;
  subcontractors?: Embedded<{ company_name?: unknown; email?: unknown; contact_email?: unknown }>;
  projects?: Embedded<{ name?: unknown; gc_email?: unknown; pm_email?: unknown; tenant_id?: unknown }>;
}): InsuranceAlertParties | null {
  const project = one(cert.projects);
  if (!project) return null;
  const sub = one(cert.subcontractors);
  return {
    // The roster company name; otherwise the name typed on the certificate itself.
    subName: clean(sub?.company_name) || clean(cert.sub_name) || 'Subcontractor',
    subEmail: clean(sub?.email) || clean(sub?.contact_email),
    gcEmail: clean(project.gc_email) || clean(project.pm_email),
    projectName: clean(project.name),
    tenantId: clean(project.tenant_id),
  };
}
