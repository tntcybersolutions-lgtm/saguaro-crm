/**
 * The subcontractors working a project.
 *
 * There is no `subcontractors.project_id`, and there should not be: a sub works
 * a dozen jobs at once, so the link belongs on the join table. Four call sites —
 * the auto-document engine, the closeout package, the pay-app PDF engine and the
 * document triggers — each filtered `subcontractors` by `project_id` anyway.
 * PostgREST rejects the whole query when a filter names a column that does not
 * exist, so all four got an error instead of a crew: no conditional waivers
 * generated on a pay app, no sub rows on the closeout package, an empty
 * subcontractor block on the printed pay application.
 *
 * This is the one place that knows how the link actually works.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type ProjectSub = {
  /** subcontractors.id — the sub itself, stable across projects. */
  id: string;
  company_name: string;
  email: string | null;
  phone: string | null;
  /** Needed verbatim on a lien waiver — it names the claimant of record. */
  address: string | null;
  trade: string | null;
  status: string | null;
  w9_on_file: boolean | null;
  /** From project_subcontractors: what this sub is contracted for HERE. */
  contract_amount: number;
  /** project_subcontractors.id, for anything that needs to write back. */
  assignment_id: string | null;
  is_compliant: boolean | null;
};

/**
 * Every sub assigned to `projectId`, with the project-specific contract value
 * merged in. Pass `tenantId` wherever the caller has it: these run on the
 * service-role client, which bypasses RLS, so the filter is the only isolation
 * there is. Returns [] when nobody is assigned — never "every sub in the tenant".
 */
export async function subsOnProject(
  db: SupabaseClient<any, any, any>,
  projectId: string,
  tenantId?: string | null,
  opts?: { includeInactive?: boolean },
): Promise<ProjectSub[]> {
  let aq = db
    .from('project_subcontractors')
    .select('id, subcontractor_id, contract_amount, is_compliant')
    .eq('project_id', projectId);
  if (tenantId) aq = aq.eq('tenant_id', tenantId);

  const { data: assignments, error: aErr } = await aq;
  if (aErr) throw aErr;

  const bySub = new Map<string, { assignment_id: string; contract: number; is_compliant: boolean | null }>();
  for (const a of (assignments || []) as any[]) {
    if (!a.subcontractor_id) continue;
    const cur = bySub.get(a.subcontractor_id);
    // A sub can hold more than one contract on the same job (two scopes, two
    // packages). Sum them; the pay app cares about the total exposure.
    if (cur) {
      cur.contract += Number(a.contract_amount) || 0;
      if (a.is_compliant === false) cur.is_compliant = false;
    } else {
      bySub.set(a.subcontractor_id, {
        assignment_id: a.id,
        contract: Number(a.contract_amount) || 0,
        is_compliant: a.is_compliant ?? null,
      });
    }
  }
  if (bySub.size === 0) return [];

  let sq = db
    .from('subcontractors')
    .select('id, company_name, email, phone, address, trade, status, w9_on_file')
    .in('id', [...bySub.keys()]);
  if (tenantId) sq = sq.eq('tenant_id', tenantId);
  if (!opts?.includeInactive) sq = sq.neq('status', 'inactive');

  const { data: subs, error: sErr } = await sq;
  if (sErr) throw sErr;

  return ((subs || []) as any[])
    .map((s) => {
      const link = bySub.get(s.id)!;
      return {
        id: s.id,
        company_name: s.company_name || '',
        email: s.email ?? null,
        phone: s.phone ?? null,
        address: s.address ?? null,
        trade: s.trade ?? null,
        status: s.status ?? null,
        w9_on_file: s.w9_on_file ?? null,
        contract_amount: link.contract,
        assignment_id: link.assignment_id,
        is_compliant: link.is_compliant,
      };
    })
    .sort((a, b) => a.company_name.localeCompare(b.company_name));
}
