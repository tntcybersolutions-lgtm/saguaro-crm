/**
 * project-context.ts
 *
 * The universal project context fetcher.
 * Every document generator, form auto-filler, and workflow step
 * calls getProjectContext() to get the full picture of a project.
 *
 * This is the single source of truth that eliminates duplicate data entry.
 * If it's in the database, it flows into every document automatically.
 *
 * Usage:
 *   import { getProjectContext } from './project-context';
 *   const ctx = await getProjectContext(tenantId, projectId);
 *   // ctx.project, ctx.owner, ctx.gc, ctx.subs, ctx.contracts, etc.
 */

import { supabaseAdmin } from './supabase/admin';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ProjectParty = {
  name:     string;
  address?: string;
  email?:   string;
  phone?:   string;
  license?: string;
  ein?:     string;
};

export type AwardedSub = {
  id:                  string;
  name:                string;
  address?:            string;
  email?:              string;
  phone?:              string;
  license_number?:     string;
  trade_category?:     string;
  contract_amount:     number;
  contract_id?:        string;
  contract_number?:    string;
  scope_of_work?:      string;
  retainage_pct:       number;
  has_insurance_coi:   boolean;
  has_w9:              boolean;
  insurance_expires?:  string;
};

export type ProjectContext = {
  // Core project fields
  project: {
    id:                     string;
    tenant_id:              string;
    name:                   string;
    address?:               string;
    location?:              string;
    project_type:           string;
    status:                 string;
    contract_amount:        number;
    retainage_pct:          number;
    prevailing_wage:        boolean;
    public_project:         boolean;
    state_jurisdiction?:    string;
    project_number?:        string;
    estimated_value?:       number;
    bid_date?:              string;
    award_date?:            string;
    notice_to_proceed_date?: string;
    substantial_date?:      string;
    final_completion_date?: string;
    budget?:                number;
    contract_type?:         string;
  };

  // Key parties (from project_contacts + project JSONB fields)
  owner:      ProjectParty | null;
  architect:  ProjectParty | null;
  engineer:   ProjectParty | null;
  gc:         ProjectParty | null;     // the GC (your company or the prime)
  lender:     ProjectParty | null;
  surety:     ProjectParty | null;

  // All awarded subcontractors with compliance status
  subs: AwardedSub[];

  // Latest approved pay application
  latestPayApp: {
    id:               string;
    app_number:       number;
    period_to:        string;
    total_completed:  number;
    prev_payments:    number;
    net_payment_due:  number;
    status:           string;
  } | null;

  // Financial summary
  financials: {
    total_contract_value:      number;
    net_change_orders:         number;
    contract_sum_to_date:      number;
    total_billed_to_date:      number;
    retainage_held:            number;
    total_paid:                number;
    balance_remaining:         number;
    pct_complete:              number;
  };

  // Active contracts summary
  contracts: Array<{
    id:              string;
    contract_number: string;
    title:           string;
    contract_value:  number;
    status:          string;
    sub_name?:       string;
  }>;

  // Open RFI count + last number
  rfiSummary: {
    total:          number;
    open:           number;
    last_number:    string;
    next_number:    string;
  };

  // Change order summary
  changeOrderSummary: {
    count:          number;
    approved_total: number;
    pending_total:  number;
    last_co_number: string;
    next_co_number: string;
  };

  // Compliance flags
  compliance: {
    all_cois_active:        boolean;
    all_w9s_collected:      boolean;
    prelim_notices_sent:    boolean;
    lien_waivers_current:   boolean;
    certified_payroll_current: boolean;
    open_issues:            string[];  // list of compliance gaps
  };

  // Today's date (for deadline calculations)
  today: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

export async function getProjectContext(
  tenantId: string,
  projectId: string,
): Promise<ProjectContext> {
  const today = new Date().toISOString().split('T')[0];

  // Fetch everything in parallel
  const [
    projectRes,
    contactsRes,
    contractsRes,
    payAppRes,
    changeOrdersRes,
    rfiRes,
    subsRes,
    coiRes,
    w9Res,
    prelimRes,
  ] = await Promise.all([
    supabaseAdmin
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('tenant_id', tenantId)
      .single(),

    supabaseAdmin
      .from('project_contacts')
      .select('*')
      .eq('project_id', projectId)
      .eq('tenant_id', tenantId),

    supabaseAdmin
      .from('contracts')
      .select('id, contract_number, title, contract_value, executed_value, status, subcontractor_company_id, scope_of_work, retainage_percent')
      .eq('project_id', projectId)
      .eq('tenant_id', tenantId)
      .order('created_at'),

    supabaseAdmin
      .from('pay_applications')
      .select('id, application_number, period_to, total_completed_and_stored, total_previous_payments, current_payment_due, status')
      .eq('project_id', projectId)
      .order('application_number', { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabaseAdmin
      .from('change_orders')
      .select('co_number, cost_impact, status')
      .eq('project_id', projectId)
      .eq('tenant_id', tenantId),

    supabaseAdmin
      .from('rfis')
      .select('id, number, status')
      .eq('project_id', projectId)
      .eq('tenant_id', tenantId),

    supabaseAdmin
      .from('subcontractor_companies')
      .select('id, name, primary_email, status')
      .eq('tenant_id', tenantId),

    supabaseAdmin
      .from('insurance_certificates')
      .select('subcontractor_company_id, status, gl_expiry')
      .eq('project_id', projectId)
      .eq('tenant_id', tenantId),

    supabaseAdmin
      .from('w9_requests')
      .select('subcontractor_company_id, status')
      .eq('project_id', projectId)
      .eq('tenant_id', tenantId),

    supabaseAdmin
      .from('preliminary_notices')
      .select('status, subcontractor_company_id')
      .eq('project_id', projectId)
      .eq('tenant_id', tenantId),
  ]);

  const project = projectRes.data as Record<string, unknown>;
  if (!project) throw new Error(`Project ${projectId} not found`);

  const contacts  = (contactsRes.data  ?? []) as Record<string,unknown>[];
  const contracts = (contractsRes.data ?? []) as Record<string,unknown>[];
  const rfiData   = (rfiRes.data       ?? []) as Record<string,unknown>[];
  const coData    = (changeOrdersRes.data ?? []) as Record<string,unknown>[];
  const allSubs   = (subsRes.data      ?? []) as Record<string,unknown>[];
  const coiData   = (coiRes.data       ?? []) as Record<string,unknown>[];
  const w9Data    = (w9Res.data        ?? []) as Record<string,unknown>[];
  const prelimData = (prelimRes.data   ?? []) as Record<string,unknown>[];

  // ── Extract parties from project_contacts ─────────────────────────────────
  function extractParty(contactType: string): ProjectParty | null {
    // First try project_contacts table
    const contact = contacts.find(c => c.contact_type === contactType);
    if (contact) {
      return {
        name:    (contact.company_name ?? contact.contact_name) as string,
        address: contact.address as string | undefined,
        email:   contact.email   as string | undefined,
        phone:   contact.phone   as string | undefined,
        license: contact.license_number as string | undefined,
      };
    }

    // Fall back to project JSONB fields
    const entityKey = `${contactType}_entity`;
    const entity = project[entityKey] as Record<string,string> | null;
    if (entity?.name) {
      return {
        name:    entity.name,
        address: entity.address,
        email:   entity.email,
        phone:   entity.phone,
        ein:     entity.ein,
      };
    }

    return null;
  }

  const owner     = extractParty('owner');
  const architect = extractParty('architect');
  const engineer  = extractParty('engineer');
  const gc        = extractParty('general_contractor') ?? {
    name: process.env.COMPANY_NAME ?? 'General Contractor',
  };
  const lender    = extractParty('lender');
  const surety    = extractParty('surety');

  // ── Build awarded subs with compliance status ──────────────────────────────
  const coiBySubId = new Map<string, Record<string,unknown>>();
  for (const coi of coiData) coiBySubId.set(coi.subcontractor_company_id as string, coi);

  const w9BySubId = new Map<string, boolean>();
  for (const w9 of w9Data) {
    if (w9.status === 'completed') w9BySubId.set(w9.subcontractor_company_id as string, true);
  }

  const subs: AwardedSub[] = contracts
    .filter(c => c.subcontractor_company_id)
    .map(c => {
      const subId  = c.subcontractor_company_id as string;
      const subCo  = allSubs.find(s => s.id === subId);
      const coi    = coiBySubId.get(subId);

      return {
        id:                 subId,
        name:               (subCo?.name ?? c.title) as string,
        email:              subCo?.primary_email as string | undefined,
        trade_category:     undefined,
        contract_amount:    Number(c.contract_value ?? 0),
        contract_id:        c.id as string,
        contract_number:    c.contract_number as string,
        scope_of_work:      c.scope_of_work as string | undefined,
        retainage_pct:      Number(c.retainage_percent ?? 10),
        has_insurance_coi:  coi ? ['active','expiring_soon'].includes(coi.status as string) : false,
        has_w9:             w9BySubId.get(subId) ?? false,
        insurance_expires:  coi?.gl_expiry as string | undefined,
      };
    });

  // ── Financial summary ──────────────────────────────────────────────────────
  const contractAmount    = Number(project.contract_amount ?? project.budget ?? 0);
  const retainagePct      = Number(project.retainage_pct ?? 10);
  const approvedCOs       = coData.filter(co => co.status === 'approved');
  const pendingCOs        = coData.filter(co => co.status !== 'approved' && co.status !== 'rejected');
  const netChangeOrders   = approvedCOs.reduce((s, co) => s + Number(co.cost_impact ?? 0), 0);
  const contractSumToDate = contractAmount + netChangeOrders;
  const latestPayApp      = payAppRes.data as Record<string,unknown> | null;
  const totalBilled       = Number(latestPayApp?.total_completed_and_stored ?? 0);
  const totalPaid         = Number(latestPayApp?.total_previous_payments ?? 0);
  const retainageHeld     = totalBilled * (retainagePct / 100);
  const pctComplete       = contractSumToDate > 0
    ? Math.round((totalBilled / contractSumToDate) * 100 * 10) / 10
    : 0;

  // ── RFI summary ───────────────────────────────────────────────────────────
  const openRfis  = rfiData.filter(r => !['closed','answered'].includes(r.status as string));
  const lastRfiNum = rfiData.length > 0
    ? (rfiData[rfiData.length - 1].number as string)
    : 'RFI-000';
  const nextRfiNum = `RFI-${String(rfiData.length + 1).padStart(3,'0')}`;

  // ── CO summary ────────────────────────────────────────────────────────────
  const lastCoNum  = coData.length > 0 ? (coData[coData.length - 1].co_number as string) : 'CO-000';
  const nextCoNum  = `CO-${String(coData.length + 1).padStart(3,'0')}`;

  // ── Compliance gaps ───────────────────────────────────────────────────────
  const complianceIssues: string[] = [];
  const subsNeedingCOI = subs.filter(s => !s.has_insurance_coi);
  const subsNeedingW9  = subs.filter(s => !s.has_w9);
  if (subsNeedingCOI.length > 0) complianceIssues.push(`${subsNeedingCOI.length} sub(s) missing active COI`);
  if (subsNeedingW9.length > 0)  complianceIssues.push(`${subsNeedingW9.length} sub(s) missing W-9`);

  const projectState = project.state_jurisdiction as string;
  const needsPrelim = ['AZ','CA','TX','NV','FL'].includes(projectState);
  const prelimSent  = prelimData.length >= subs.length;
  if (needsPrelim && !prelimSent) complianceIssues.push('Preliminary notices not sent to all subs');

  if (project.prevailing_wage) {
    complianceIssues.push('Prevailing wage project — certified payroll required weekly');
  }

  return {
    project: {
      id:                   project.id as string,
      tenant_id:            project.tenant_id as string,
      name:                 project.name as string,
      address:              (project.address ?? project.location) as string | undefined,
      location:             project.location as string | undefined,
      project_type:         (project.project_type ?? 'commercial') as string,
      status:               project.status as string,
      contract_amount:      contractAmount,
      retainage_pct:        retainagePct,
      prevailing_wage:      Boolean(project.prevailing_wage),
      public_project:       Boolean(project.public_project),
      state_jurisdiction:   project.state_jurisdiction as string | undefined,
      project_number:       project.project_number as string | undefined,
      estimated_value:      project.estimated_value as number | undefined,
      bid_date:             project.bid_date as string | undefined,
      award_date:           project.award_date as string | undefined,
      notice_to_proceed_date: project.notice_to_proceed_date as string | undefined,
      substantial_date:     project.substantial_date as string | undefined,
      final_completion_date: project.final_completion_date as string | undefined,
      budget:               project.budget as number | undefined,
      contract_type:        project.contract_type as string | undefined,
    },

    owner, architect, engineer, gc, lender, surety,
    subs,

    latestPayApp: latestPayApp ? {
      id:              latestPayApp.id as string,
      app_number:      Number(latestPayApp.application_number),
      period_to:       latestPayApp.period_to as string,
      total_completed: Number(latestPayApp.total_completed_and_stored ?? 0),
      prev_payments:   Number(latestPayApp.total_previous_payments ?? 0),
      net_payment_due: Number(latestPayApp.current_payment_due ?? 0),
      status:          latestPayApp.status as string,
    } : null,

    financials: {
      total_contract_value: contractAmount,
      net_change_orders:    netChangeOrders,
      contract_sum_to_date: contractSumToDate,
      total_billed_to_date: totalBilled,
      retainage_held:       retainageHeld,
      total_paid:           totalPaid,
      balance_remaining:    contractSumToDate - totalBilled,
      pct_complete:         pctComplete,
    },

    contracts: contracts.map(c => ({
      id:              c.id as string,
      contract_number: c.contract_number as string,
      title:           c.title as string,
      contract_value:  Number(c.contract_value ?? 0),
      status:          c.status as string,
      sub_name:        allSubs.find(s => s.id === c.subcontractor_company_id)?.name as string | undefined,
    })),

    rfiSummary: {
      total:       rfiData.length,
      open:        openRfis.length,
      last_number: lastRfiNum,
      next_number: nextRfiNum,
    },

    changeOrderSummary: {
      count:          coData.length,
      approved_total: approvedCOs.reduce((s,co) => s + Number(co.cost_impact ?? 0), 0),
      pending_total:  pendingCOs.reduce((s,co) => s + Number(co.cost_impact ?? 0), 0),
      last_co_number: lastCoNum,
      next_co_number: nextCoNum,
    },

    compliance: {
      all_cois_active:          subsNeedingCOI.length === 0,
      all_w9s_collected:        subsNeedingW9.length === 0,
      prelim_notices_sent:      !needsPrelim || prelimSent,
      lien_waivers_current:     true, // checked per-pay-app
      certified_payroll_current: !project.prevailing_wage,
      open_issues:              complianceIssues,
    },

    today,
  };
}
