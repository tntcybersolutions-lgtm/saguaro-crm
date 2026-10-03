/**
 * closeout-doc-data — the facts a closeout document swears to, read from
 * where they actually live.
 *
 * The G706 went out reading "Final contract amount $0.00", a blank Owner, and
 * "deposes and says that he or she is the  (the Contractor)". Each blank had
 * the same cause: the route read ONE column (contract_amount, owner_entity.name,
 * body.gcName) and the data was somewhere else — the contract on a different
 * contract column or only on the accepted proposal, the owner on owner_name or
 * the proposal's client, and the contractor's name in tenant_settings, which
 * the route never looked at. A sworn affidavit with blanks in it is not a
 * draft, it is unusable.
 *
 * Rule for every field: read every place it can live, and if it is truly
 * unknown return '' so the PDF prints a blank line to fill in by hand — never
 * an invented value, and never today's date standing in for a completion
 * date nobody recorded.
 *
 * Every query is tenant-scoped; tenantId comes from the authenticated user.
 * MONEY rule: DB numerics can round-trip as strings — Number(x)||0 before math.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

const N = (v: unknown): number => Number(v) || 0;
const S = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** owner_entity / architect_entity are jsonb, but legacy rows carry a bare
 *  string, an empty object, or a JSON string of an object. */
function entityName(v: unknown): string {
  if (!v) return '';
  if (typeof v === 'string') {
    const t = v.trim();
    if (t.startsWith('{')) {
      try { return entityName(JSON.parse(t)); } catch { return ''; }
    }
    return t;
  }
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return S(o.name) || S(o.company_name) || S(o.company) || '';
  }
  return '';
}

function entityAddress(v: unknown): string {
  if (!v || typeof v !== 'object') return '';
  const o = v as Record<string, unknown>;
  return S(o.address);
}

/** The first non-zero value of a project's contract columns. The schema has
 *  accumulated several over time and different writers set different ones;
 *  the order prefers the ones the proposal-accept and setup flows write. */
const ORIGINAL_CONTRACT_COLUMNS = [
  'original_contract_amount',
  'contract_value',
  'original_contract',
  'contract_sum',
  'contract_amount',
  'original_contract_value',
  'total_contract_amount',
] as const;

export interface ContractSum {
  original: number;
  approvedCoTotal: number;
  approvedCoCount: number;
  /** original + approved change orders. */
  revised: number;
  /** Where `original` came from, for support and for the UI to be honest. */
  source: string;
}

/**
 * Original contract + approved change orders.
 *
 * Falls back across every contract column on projects, then the prime
 * contract, then the accepted proposal — a job whose only record of its
 * contract is the proposal the owner signed still has a contract.
 */
export async function contractSum(
  db: SupabaseClient<any>,
  tenantId: string,
  projectId: string,
  project?: Record<string, unknown> | null,
): Promise<ContractSum> {
  let p = project ?? null;
  if (!p) {
    const { data, error } = await db.from('projects').select('*')
      .eq('id', projectId).eq('tenant_id', tenantId).maybeSingle();
    if (error) throw error;
    p = (data as Record<string, unknown> | null) ?? {};
  }

  let original = 0;
  let source = '';
  for (const col of ORIGINAL_CONTRACT_COLUMNS) {
    const v = N(p?.[col]);
    if (v > 0) { original = v; source = `projects.${col}`; break; }
  }

  if (original <= 0) {
    const { data: prime, error } = await db.from('contracts')
      .select('original_amount, contract_amount, amount')
      .eq('tenant_id', tenantId).eq('project_id', projectId).eq('contract_type', 'prime')
      .limit(1);
    if (error) throw error;
    const c = (prime || [])[0] as Record<string, unknown> | undefined;
    const v = c ? N(c.original_amount) || N(c.contract_amount) || N(c.amount) : 0;
    if (v > 0) { original = v; source = 'contracts.prime'; }
  }

  if (original <= 0) {
    const { data: props, error } = await db.from('proposals')
      .select('total_amount, amount, accepted_at')
      .eq('tenant_id', tenantId).eq('project_id', projectId).eq('status', 'accepted')
      .order('accepted_at', { ascending: false, nullsFirst: false })
      .limit(1);
    if (error) throw error;
    const pr = (props || [])[0] as Record<string, unknown> | undefined;
    const v = pr ? N(pr.total_amount) || N(pr.amount) : 0;
    if (v > 0) { original = v; source = 'proposals.accepted'; }
  }

  const { data: cos, error: coErr } = await db.from('change_orders')
    .select('cost_impact, amount')
    .eq('tenant_id', tenantId).eq('project_id', projectId).eq('status', 'approved')
    .is('deleted_at', null);
  if (coErr) throw coErr;
  const approved = (cos || []) as Record<string, unknown>[];
  const approvedCoTotal = approved.reduce((s, c) => s + (N(c.cost_impact) || N(c.amount)), 0);

  return {
    original,
    approvedCoTotal,
    approvedCoCount: approved.length,
    revised: original + approvedCoTotal,
    source: source || 'none',
  };
}

export interface CloseoutParties {
  ownerName: string;
  ownerAddress: string;
  contractorName: string;
  contractorAddress: string;
  architectName: string;
  /** '' when nobody has recorded one — the form prints a line to fill in. */
  substantialCompletionDate: string;
  finalCompletionDate: string;
  contractDate: string;
}

const isoDay = (v: unknown): string => {
  const s = S(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
};

/**
 * Owner, contractor (this tenant), architect and the recorded completion
 * dates for a project.
 *
 * Contractor is the tenant's company, from tenant_settings (Settings →
 * Company), then the tenant record, then the project's own gc_name. The old
 * route took it from the request body, which the closeout page never sent.
 */
export async function closeoutParties(
  db: SupabaseClient<any>,
  tenantId: string,
  project: Record<string, unknown>,
): Promise<CloseoutParties> {
  const projectId = String(project.id || '');
  const [settingsQ, tenantQ, proposalQ] = await Promise.all([
    db.from('tenant_settings')
      .select('company_name, company_address, company_city, company_state, company_zip')
      .eq('tenant_id', tenantId).limit(1),
    db.from('tenants').select('name, company_name').eq('id', tenantId).maybeSingle(),
    db.from('proposals').select('client_company, client_name')
      .eq('tenant_id', tenantId).eq('project_id', projectId).eq('status', 'accepted')
      .order('accepted_at', { ascending: false, nullsFirst: false }).limit(1),
  ]);
  if (settingsQ.error) throw settingsQ.error;
  if (tenantQ.error) throw tenantQ.error;
  if (proposalQ.error) throw proposalQ.error;

  const ts = ((settingsQ.data || [])[0] || {}) as Record<string, unknown>;
  const tn = (tenantQ.data || {}) as Record<string, unknown>;
  const pr = ((proposalQ.data || [])[0] || {}) as Record<string, unknown>;

  const cityLine = [S(ts.company_city), [S(ts.company_state), S(ts.company_zip)].filter(Boolean).join(' ')]
    .filter(Boolean).join(', ');
  const contractorAddress = [S(ts.company_address), cityLine].filter(Boolean).join(', ')
    || S(project.gc_address);

  return {
    ownerName:
      S(project.owner_name) || entityName(project.owner_entity)
      // The client on the proposal the owner accepted is the owner.
      || S(pr.client_company) || S(pr.client_name),
    ownerAddress: S(project.owner_address) || entityAddress(project.owner_entity),
    contractorName:
      S(ts.company_name) || S(tn.company_name) || S(tn.name)
      || S(project.gc_name) || entityName(project.gc_entity),
    contractorAddress,
    architectName:
      S(project.architect_name) || S(project.architect_firm) || S(project.architect)
      || entityName(project.architect_entity),
    substantialCompletionDate:
      isoDay(project.substantial_completion_date) || isoDay(project.substantial_completion),
    finalCompletionDate:
      isoDay(project.final_completion_date) || isoDay(project.final_completion),
    contractDate:
      isoDay(project.contract_date) || isoDay(project.contract_execution_date) || isoDay(project.start_date),
  };
}
