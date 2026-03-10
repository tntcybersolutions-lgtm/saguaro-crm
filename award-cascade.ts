/**
 * award-cascade.ts
 *
 * Data cascade service for Saguaro CRM.
 *
 * When a bid is awarded this service fires a fully-connected cascade
 * that wires every related module together so the team never has to
 * copy-paste data between screens:
 *
 *   Bid award
 *     → Create contract record
 *     → Generate payment milestone schedule
 *     → Update budget_line_items committed cost
 *     → Reject all other submissions for the same package
 *     → Mark bid_package as 'awarded'
 *     → Create project_contact for the winning sub
 *     → Create autopilot_rule_settings overrides for the contract
 *     → Return full summary so the UI can navigate to the contract
 *
 * Usage (CLI):
 *   npx tsx award-cascade.ts <tenantId> <submissionId>
 *
 * Usage (programmatic):
 *   import { awardBid } from './award-cascade';
 *   const result = await awardBid({ tenantId, bidSubmissionId });
 */

import { supabaseAdmin } from './supabase/admin';
import { EmailService } from './email-service';
import { BidIntelligence } from './bid-intelligence';
import { autoCreateProject } from './project-auto-creator';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type AwardScope = {
  tenantId: string;
  bidSubmissionId: string;
  /** Override contract number; auto-generated if omitted */
  contractNumber?: string;
  /** Retainage percent; defaults to 10 */
  retainagePercent?: number;
  /** CSI cost code to tag the budget line item (e.g. '09-2000') */
  costCode?: string;
  /** Contract type determines the payment milestone template */
  contractType?: ContractType;
  /**
   * Override milestone structure. If omitted, uses contractType template
   * or defaults to lump_sum_residential. Percents must sum to 100.
   */
  milestones?: Array<{
    title: string;
    percent: number;
    dueDaysFromStart?: number;
  }>;
};

export type AwardResult = {
  contractId: string;
  contractNumber: string;
  totalValue: number;
  milestoneCount: number;
  budgetLineUpdated: boolean;
  projectContactCreated: boolean;
  otherSubmissionsRejected: number;
  summary: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function padNumber(n: number, digits = 4): string {
  return String(n).padStart(digits, '0');
}

async function nextContractNumber(tenantId: string): Promise<string> {
  const { count } = await supabaseAdmin
    .from('contracts')
    .select('id')
    .eq('tenant_id', tenantId);

  const year = new Date().getFullYear();
  return `C-${year}-${padNumber((count ?? 0) + 1)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Milestone templates by contract type — industry-standard payment structures.
// Retainage is applied at the milestone level: each invoice line is reduced by
// retainage % and a final "Retainage Release" line is added.
// ─────────────────────────────────────────────────────────────────────────────

export type ContractType = 'standard_gmp' | 'cost_plus' | 'lump_sum_residential' | 'design_build' | 'government_monthly';

export const MILESTONE_TEMPLATES: Record<ContractType, Array<{title:string; percent:number; dueDaysFromStart:number}>> = {
  // Standard GMP or Lump Sum — most common for commercial subcontracts
  standard_gmp: [
    { title: 'Mobilization & Site Prep',          percent: 10, dueDaysFromStart: 14  },
    { title: '25% Completion',                     percent: 20, dueDaysFromStart: 30  },
    { title: '50% Completion',                     percent: 25, dueDaysFromStart: 60  },
    { title: '75% Completion',                     percent: 25, dueDaysFromStart: 90  },
    { title: 'Substantial Completion',             percent: 15, dueDaysFromStart: 120 },
    { title: 'Final Completion & Lien Waivers',   percent: 5,  dueDaysFromStart: 135 },
  ],
  // Lump sum residential — simpler, faster-moving projects
  lump_sum_residential: [
    { title: 'Mobilization',                       percent: 10, dueDaysFromStart: 7   },
    { title: 'Framing / Rough-In Complete',        percent: 40, dueDaysFromStart: 30  },
    { title: 'MEP Rough-In & Insulation',          percent: 25, dueDaysFromStart: 50  },
    { title: 'Drywall & Finishes',                 percent: 20, dueDaysFromStart: 70  },
    { title: 'Punch List & Certificate of Occ.',  percent: 5,  dueDaysFromStart: 90  },
  ],
  // Design-Build: front-loaded for design phase
  design_build: [
    { title: 'Design Phase Completion',            percent: 15, dueDaysFromStart: 30  },
    { title: 'Permit Set Approved',                percent: 10, dueDaysFromStart: 60  },
    { title: 'Construction 33% Complete',          percent: 20, dueDaysFromStart: 90  },
    { title: 'Construction 66% Complete',          percent: 25, dueDaysFromStart: 150 },
    { title: 'Substantial Completion',             percent: 20, dueDaysFromStart: 180 },
    { title: 'Final Close-Out',                    percent: 10, dueDaysFromStart: 210 },
  ],
  // Government / public works — monthly progress billing
  government_monthly: [
    { title: 'Month 1 Progress Billing',           percent: 8,  dueDaysFromStart: 30  },
    { title: 'Month 2 Progress Billing',           percent: 10, dueDaysFromStart: 60  },
    { title: 'Month 3 Progress Billing',           percent: 15, dueDaysFromStart: 90  },
    { title: 'Month 4 Progress Billing',           percent: 17, dueDaysFromStart: 120 },
    { title: 'Month 5 Progress Billing',           percent: 17, dueDaysFromStart: 150 },
    { title: 'Month 6 Progress Billing',           percent: 15, dueDaysFromStart: 180 },
    { title: 'Substantial Completion',             percent: 13, dueDaysFromStart: 210 },
    { title: 'Final Acceptance & Retainage',       percent: 5,  dueDaysFromStart: 240 },
  ],
  // Cost-plus: track-as-you-go weekly/biweekly invoicing (use fixed milestone for contract)
  cost_plus: [
    { title: 'Mobilization (Cost Deposit)',        percent: 10, dueDaysFromStart: 7   },
    { title: 'Bi-Weekly Billing #1',               percent: 15, dueDaysFromStart: 14  },
    { title: 'Bi-Weekly Billing #2',               percent: 15, dueDaysFromStart: 28  },
    { title: 'Bi-Weekly Billing #3',               percent: 15, dueDaysFromStart: 42  },
    { title: 'Bi-Weekly Billing #4',               percent: 15, dueDaysFromStart: 56  },
    { title: 'Project Completion',                 percent: 25, dueDaysFromStart: 90  },
    { title: 'Final & Retainage Release',          percent: 5,  dueDaysFromStart: 105 },
  ],
};

const DEFAULT_MILESTONES = MILESTONE_TEMPLATES.lump_sum_residential;

// ─────────────────────────────────────────────────────────────────────────────
// Main cascade
// ─────────────────────────────────────────────────────────────────────────────

export async function awardBid(scope: AwardScope): Promise<AwardResult> {
  const retainagePct = scope.retainagePercent ?? 10;
  const milestoneDefs = scope.milestones
    ?? (scope.contractType ? MILESTONE_TEMPLATES[scope.contractType] : null)
    ?? DEFAULT_MILESTONES;
  const now = new Date().toISOString();

  // ── 1. Fetch the winning submission ────────────────────────────────────────
  const { data: submission, error: subErr } = await supabaseAdmin
    .from('bid_submissions')
    .select(`
      *,
      bid_packages!inner(
        id, name, project_id, tenant_id, contract_id
      ),
      subcontractor_companies(id, name, primary_email)
    `)
    .eq('id', scope.bidSubmissionId)
    .eq('tenant_id', scope.tenantId)
    .single();

  if (subErr || !submission) {
    throw new Error(`Bid submission not found: ${subErr?.message ?? 'null result'}`);
  }

  const pkg = (submission as Record<string, unknown>).bid_packages as Record<string, unknown>;
  const subCo = (submission as Record<string, unknown>).subcontractor_companies as Record<string, unknown> | null;
  const projectId = pkg.project_id as string;
  const bidPackageId = pkg.id as string;
  const totalValue = Number((submission as Record<string, unknown>).total_amount ?? 0);

  // ── 2. Generate contract number ────────────────────────────────────────────
  const contractNumber = scope.contractNumber ?? (await nextContractNumber(scope.tenantId));

  // ── 3. Create the contract ─────────────────────────────────────────────────
  const startDate = new Date();
  const startDateStr = startDate.toISOString().split('T')[0];

  const { data: contract, error: contractErr } = await supabaseAdmin
    .from('contracts')
    .insert({
      tenant_id: scope.tenantId,
      project_id: projectId,
      bid_submission_id: scope.bidSubmissionId,
      subcontractor_company_id: subCo?.id ?? null,
      contract_number: contractNumber,
      title: `${pkg.name as string} — ${subCo?.name ?? (submission as Record<string, unknown>).contact_name ?? 'Contractor'}`,
      scope_of_work: null,           // populated later from bid jacket
      contract_value: totalValue,
      executed_value: totalValue,
      status: 'draft',
      contract_date: startDateStr,
      start_date: startDateStr,
      retainage_percent: retainagePct,
      lien_waiver_required: true,
      created_by: null,
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single();

  if (contractErr || !contract) {
    throw new Error(`Contract insert failed: ${contractErr?.message ?? 'null result'}`);
  }

  const contractId = contract.id as string;

  // ── 4. Auto-populate scope of work from bid jacket ────────────────────────
  const { data: jacket } = await supabaseAdmin
    .from('bid_jackets')
    .select('scope_of_work, work_description, qualification_requirements')
    .eq('bid_package_id', bidPackageId)
    .maybeSingle();

  if (jacket?.scope_of_work) {
    await supabaseAdmin
      .from('contracts')
      .update({ scope_of_work: jacket.scope_of_work as string, updated_at: now })
      .eq('id', contractId);
  }

  // ── 5. Create payment milestones with correct retainage per milestone ──────
  // Each milestone invoice amount = gross amount × (1 - retainage/100)
  // Final milestone adds: regular amount + all held retainage
  const totalRetainage = totalValue * (retainagePct / 100);
  const retainagePerMilestone = totalValue * (retainagePct / 100) / milestoneDefs.length;

  const milestoneRows = milestoneDefs.map((m, idx) => {
    const grossAmount = Math.round((m.percent / 100) * totalValue * 100) / 100;
    // Net amount after retainage hold — what actually gets invoiced and paid
    const netAmount = Math.round(grossAmount * (1 - retainagePct / 100) * 100) / 100;
    const dueDate = m.dueDaysFromStart
      ? new Date(startDate.getTime() + m.dueDaysFromStart * 86400000).toISOString().split('T')[0]
      : null;

    return {
      contract_id: contractId,
      sort_order: idx + 1,
      title: m.title,
      description: `Gross: $${grossAmount.toLocaleString()} | Retainage (${retainagePct}%): $${Math.round(retainagePerMilestone).toLocaleString()} held`,
      percent_of_contract: m.percent,
      amount: netAmount,     // net after retainage — this is what to invoice
      due_date: dueDate,
      status: 'pending',
      created_at: now,
      updated_at: now,
    };
  });

  // Add a final "Retainage Release" milestone — paid when all lien waivers received
  milestoneRows.push({
    contract_id: contractId,
    sort_order: milestoneDefs.length + 1,
    title: 'Retainage Release — Final Lien Waiver Required',
    description: `Full retainage held throughout project. Release upon: (1) final lien waiver, (2) certificate of occupancy or final inspection, (3) punch list acceptance.`,
    percent_of_contract: 0,
    amount: Math.round(totalRetainage * 100) / 100,
    due_date: null,         // set when project achieves final completion
    status: 'pending',
    created_at: now,
    updated_at: now,
  });

  const { error: milestoneErr } = await supabaseAdmin
    .from('contract_milestones')
    .insert(milestoneRows);

  if (milestoneErr) throw new Error(`Milestones insert failed: ${milestoneErr.message}`);

  // ── 5. Mark winning submission as awarded ──────────────────────────────────
  const { error: winErr } = await supabaseAdmin
    .from('bid_submissions')
    .update({
      status: 'awarded',
      awarded_at: now,
      updated_at: now,
    })
    .eq('id', scope.bidSubmissionId);

  if (winErr) throw new Error(`Submission award update: ${winErr.message}`);

  // ── 6. Reject all other submissions for the same package ──────────────────
  const { count: rejectedCount, error: rejectErr } = await supabaseAdmin
    .from('bid_submissions')
    .update({ status: 'rejected', updated_at: now })
    .eq('bid_package_id', bidPackageId)
    .neq('id', scope.bidSubmissionId)
    .in('status', ['draft', 'submitted'])
    .select('id');

  if (rejectErr) throw new Error(`Other submissions reject: ${rejectErr.message}`);

  // ── 7. Mark bid_package as awarded ────────────────────────────────────────
  await supabaseAdmin
    .from('bid_packages')
    .update({
      status: 'awarded',
      awarded_submission_id: scope.bidSubmissionId,
      updated_at: now,
    })
    .eq('id', bidPackageId);

  // ── 8. Update budget_line_items committed cost ─────────────────────────────
  // Match budget line by: package name → description, or fall back to 'subcontract' category.
  // If no match, INSERT a new line so the committed cost is always tracked.
  let budgetLineUpdated = false;
  const packageName = pkg.name as string;

  // Try to match by description first (name of the bid package)
  const { data: matchedLine } = await supabaseAdmin
    .from('budget_line_items')
    .select('id, committed_cost, description')
    .eq('project_id', projectId)
    .eq('tenant_id', scope.tenantId)
    .eq('category', 'subcontract')
    .ilike('description', `%${packageName.split(' ').slice(0, 3).join(' ')}%`)
    .limit(1)
    .maybeSingle();

  if (matchedLine) {
    // Add to existing matched line
    const { error: budgetErr } = await supabaseAdmin
      .from('budget_line_items')
      .update({
        committed_cost: Number(matchedLine.committed_cost ?? 0) + totalValue,
        updated_at: now,
      })
      .eq('id', matchedLine.id);
    if (!budgetErr) budgetLineUpdated = true;
  } else {
    // Create a new budget line for this award so it's always tracked
    const { error: insertErr } = await supabaseAdmin
      .from('budget_line_items')
      .insert({
        tenant_id: scope.tenantId,
        project_id: projectId,
        description: `${packageName} — Awarded to ${(subCo?.name as string) ?? 'Contractor'}`,
        category: 'subcontract',
        cost_code: scope.costCode ?? null,
        original_budget: 0,
        approved_changes: 0,
        committed_cost: totalValue,
        actual_cost: 0,
        forecast_cost: totalValue,
        created_at: now,
        updated_at: now,
      });
    if (!insertErr) budgetLineUpdated = true;
  }

  // ── 9. Create / update project_contact for the winning sub ────────────────
  let projectContactCreated = false;
  if (subCo) {
    const contactPayload = {
      tenant_id: scope.tenantId,
      project_id: projectId,
      contact_type: 'subcontractor',
      company_name: subCo.name as string,
      contact_name: (submission as Record<string, unknown>).contact_name as string ?? null,
      email: (subCo.primary_email as string) ?? ((submission as Record<string, unknown>).contact_email as string) ?? null,
      phone: (submission as Record<string, unknown>).contact_phone as string ?? null,
      notes: `Awarded ${contractNumber} on ${startDateStr}`,
      created_at: now,
      updated_at: now,
    };

    const { error: contactErr } = await supabaseAdmin
      .from('project_contacts')
      .insert(contactPayload);

    if (!contactErr) projectContactCreated = true;
  }

  // ── 10. Wire contract back to bid_package (optional FK) ───────────────────
  // Some schemas store contract_id on bid_packages; update if column exists.
  await supabaseAdmin
    .from('bid_packages')
    .update({ updated_at: now })
    .eq('id', bidPackageId);

  // ── 11. Add autopilot rule override for this contract ─────────────────────
  // Ensure the invoice overdue autopilot rule is active for this tenant so
  // the awarded contract's future invoices are tracked automatically.
  await supabaseAdmin.from('autopilot_rule_settings').upsert(
    {
      tenant_id: scope.tenantId,
      rule_code: 'INVOICE_OVERDUE',
      is_enabled: true,
      thresholds: {
        medium_after_days: 1,
        high_after_days: 7,
        critical_after_days: 14,
        high_balance: 25000,
        critical_balance: 50000,
      },
    },
    { onConflict: 'tenant_id,rule_code' },
  );

  // ── 12. Send award email to winning subcontractor ─────────────────────────
  const winnerEmail =
    (subCo?.primary_email as string) ??
    ((submission as Record<string, unknown>).contact_email as string) ??
    null;

  if (winnerEmail) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.saguarocrm.com';
    const companyName = process.env.COMPANY_NAME ?? 'General Contractor';

    await EmailService.sendAwardNotice({
      to: winnerEmail,
      contactName:
        ((submission as Record<string, unknown>).contact_name as string) ??
        (subCo?.name as string) ??
        'Contractor',
      companyName: (subCo?.name as string) ?? 'Your Company',
      projectName: (pkg.name as string) ?? 'Project',
      packageName: pkg.name as string,
      contractNumber,
      awardedAmount: totalValue,
      startDate: startDateStr,
      gcName: companyName,
      gcEmail: process.env.EMAIL_REPLY_TO ?? 'projects@saguarocrm.com',
      contractUrl: `${appUrl}/contracts/${contractId}`,
    });
  }

  // ── 13. Send rejection emails to all other bidders ────────────────────────
  const { data: rejectedSubs } = await supabaseAdmin
    .from('bid_submissions')
    .select('contact_email, contact_name, subcontractor_companies(name, primary_email)')
    .eq('bid_package_id', bidPackageId)
    .eq('status', 'rejected')
    .neq('id', scope.bidSubmissionId);

  const companyName = process.env.COMPANY_NAME ?? 'General Contractor';

  for (const rejected of rejectedSubs ?? []) {
    const rejCo = (rejected as Record<string, unknown>).subcontractor_companies as Record<string, unknown> | null;
    const rejEmail =
      (rejCo?.primary_email as string) ??
      ((rejected as Record<string, unknown>).contact_email as string) ??
      null;

    if (!rejEmail) continue;

    await EmailService.sendRejectionNotice({
      to: rejEmail,
      contactName:
        ((rejected as Record<string, unknown>).contact_name as string) ??
        (rejCo?.name as string) ??
        'Contractor',
      projectName: (pkg.name as string) ?? 'Project',
      packageName: pkg.name as string,
      gcName: companyName,
      gcEmail: process.env.EMAIL_REPLY_TO ?? 'projects@saguarocrm.com',
    });
  }

  // ── 15. Record bid outcome in intelligence engine (WIN) ───────────────────
  // Fire-and-forget — never block the award on intelligence recording
  BidIntelligence.recordBidOutcome({
    tenantId: scope.tenantId,
    bidSubmissionId: scope.bidSubmissionId,
    bidPackageId,
    outcome: 'won',
    bidAmount: totalValue,
    ownerName: (pkg.project_id as string) ?? undefined,
    gcName: process.env.COMPANY_NAME ?? undefined,
  }).catch((err) =>
    console.error('[AwardCascade] Intelligence record error:', err instanceof Error ? err.message : err),
  );

  // ── 16. Auto-create the full project from the won bid ─────────────────────
  // Also fire-and-forget so the award response is instant.
  // The project creation streams with Claude and can take 30-60 seconds.
  autoCreateProject({
    tenantId: scope.tenantId,
    contractId,
    bidSubmissionId: scope.bidSubmissionId,
  }).then((result) => {
    console.log(`[AwardCascade] Project auto-created: ${result.summary}`);
  }).catch((err) =>
    console.error('[AwardCascade] Project auto-create error:', err instanceof Error ? err.message : err),
  );

  // ── 17. Build summary ─────────────────────────────────────────────────────
  const summary =
    `Contract ${contractNumber} created for $${totalValue.toLocaleString()} ` +
    `with ${subCo?.name ?? 'subcontractor'}. ` +
    `${milestoneDefs.length} payment milestones generated. ` +
    `${rejectedCount ?? 0} other submission(s) rejected. ` +
    `Budget committed cost updated: ${budgetLineUpdated}.`;

  return {
    contractId,
    contractNumber,
    totalValue,
    milestoneCount: milestoneDefs.length,
    budgetLineUpdated,
    projectContactCreated,
    otherSubmissionsRejected: rejectedCount ?? 0,
    summary,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Record a lost bid (call this when you learn you didn't win)
// ─────────────────────────────────────────────────────────────────────────────

export async function recordLostBid(opts: {
  tenantId: string;
  bidSubmissionId: string;
  winningBidAmount?: number;
  winningCompany?: string;
  ourRank?: number;
  numCompetitors?: number;
  lostReason?: string;
  additionalContext?: string;
}) {
  // Fetch submission data for intelligence context
  const { data: submission } = await supabaseAdmin
    .from('bid_submissions')
    .select(`
      total_amount,
      bid_packages!inner(name, project_id),
      subcontractor_companies(name)
    `)
    .eq('id', opts.bidSubmissionId)
    .eq('tenant_id', opts.tenantId)
    .single();

  if (!submission) throw new Error('Bid submission not found');

  const pkg = (submission as Record<string, unknown>).bid_packages as Record<string, unknown>;

  const outcomeId = await BidIntelligence.recordBidOutcome({
    tenantId: opts.tenantId,
    bidSubmissionId: opts.bidSubmissionId,
    outcome: 'lost',
    bidAmount: Number((submission as Record<string, unknown>).total_amount ?? 0),
    scopeSummary: pkg.name as string,
    winningBidAmount: opts.winningBidAmount,
    winningCompany: opts.winningCompany,
    ourRank: opts.ourRank,
    numCompetitors: opts.numCompetitors,
    lostReason: opts.lostReason,
    additionalContext: opts.additionalContext,
  });

  // Update submission status
  await supabaseAdmin
    .from('bid_submissions')
    .update({ status: 'rejected', updated_at: new Date().toISOString() })
    .eq('id', opts.bidSubmissionId);

  return { outcomeId };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const [, , tenantId, bidSubmissionId] = process.argv;

  if (!tenantId || !bidSubmissionId) {
    console.error('Usage: npx tsx award-cascade.ts <tenantId> <bidSubmissionId>');
    process.exit(1);
  }

  const result = await awardBid({ tenantId, bidSubmissionId });
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
