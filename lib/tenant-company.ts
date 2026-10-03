/**
 * tenant-company — the GC's own name, office address and license, for documents
 * that go out under the contractor's letterhead (bid jackets, compliance packets).
 *
 * WHY: generated documents read `projects.gc_name`, which is null on almost every
 * project because the GC is the tenant — nobody types their own company name into
 * each job. The jacket cover then said "GENERAL CONTRACTOR" with the JOB address
 * underneath as if it were the contractor's office. The company record lives in
 * tenant_settings (company_name / company_address / city / state / zip /
 * license_number), with tenants.settings.company_name (Branding page) and
 * tenants.name as older fallbacks.
 *
 * Resolution order, most specific first:
 *   name:    project.gc_name → tenant_settings.company_name → tenants.settings.company_name
 *            → tenants.company_name → tenants.name
 *   address: project.gc_address → tenant_settings address lines
 *   license: project.gc_license / gc_license_number → tenant_settings.license_number
 * The project address is NEVER used as the contractor's address — it is the job site.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface TenantCompany {
  name: string;
  address: string;
  license: string;
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export async function resolveTenantCompany(
  db: any,
  tenantId: string,
  project: Record<string, any> | null | undefined,
): Promise<TenantCompany> {
  const proj = project || {};
  let settingsRow: Record<string, any> = {};
  let tenantRow: Record<string, any> = {};
  try {
    const [{ data: ts, error: tsErr }, { data: t, error: tErr }] = await Promise.all([
      db.from('tenant_settings')
        .select('company_name, company_address, company_city, company_state, company_zip, license_number')
        .eq('tenant_id', tenantId)
        .maybeSingle(),
      db.from('tenants').select('name, company_name, settings').eq('id', tenantId).maybeSingle(),
    ]);
    if (tsErr) console.warn('[tenant-company] tenant_settings read failed:', tsErr.message);
    if (tErr) console.warn('[tenant-company] tenants read failed:', tErr.message);
    settingsRow = (ts as Record<string, any>) || {};
    tenantRow = (t as Record<string, any>) || {};
  } catch (e) {
    // Non-fatal: a document with a generic label beats no document. Logged, not swallowed.
    console.warn('[tenant-company] company lookup failed:', e instanceof Error ? e.message : e);
  }

  const name =
    str(proj.gc_name) ||
    str(settingsRow.company_name) ||
    str(tenantRow.settings?.company_name) ||
    str(tenantRow.company_name) ||
    str(tenantRow.name) ||
    'General Contractor';

  const cityLine = [str(settingsRow.company_city), [str(settingsRow.company_state), str(settingsRow.company_zip)].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  const officeAddress = [str(settingsRow.company_address), cityLine].filter(Boolean).join(', ');
  const address = str(proj.gc_address) || officeAddress;

  const license = str(proj.gc_license) || str(proj.gc_license_number) || str(settingsRow.license_number);

  return { name, address, license };
}
