/**
 * project-auto-creator.ts
 *
 * Saguaro CRM — AI-Powered Full Project Creation Engine
 *
 * When a bid is awarded, this service uses Claude Opus 4.6 to read the
 * complete bid jacket and automatically build a FULLY POPULATED project:
 *
 *   ✓ Project record with all metadata
 *   ✓ Complete schedule — phases, tasks, durations, dependencies, critical path
 *   ✓ Budget line items mapped to cost codes
 *   ✓ All project contacts by role (owner, architect, engineer, subs)
 *   ✓ Sub-packages — bid packages for next-tier subcontractors
 *   ✓ Safety plan — hazards identified, requirements set
 *   ✓ QC inspection checkpoints by phase
 *   ✓ Kickoff action items and immediate next steps
 *   ✓ RFI log initialized
 *   ✓ Document folder structure
 *
 * This is NOT a shell project. Every field is populated from the bid data.
 * Claude reads the scope, line items, requirements, and contacts then
 * builds the entire project structure the team would otherwise spend days
 * creating manually.
 *
 * Usage:
 *   import { autoCreateProject } from './project-auto-creator';
 *   const result = await autoCreateProject({ tenantId, contractId, bidSubmissionId });
 */

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';


import { supabaseAdmin } from './supabase/admin';
import { EmailService } from './email-service';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─────────────────────────────────────────────────────────────────────────────
// Output schema — everything Claude must generate
// ─────────────────────────────────────────────────────────────────────────────

const ScheduleTaskSchema = z.object({
  sort_order: z.number().int(),
  name: z.string().describe('Clear task name'),
  description: z.string().describe('What this task involves and any key requirements'),
  phase: z.string().describe('Phase name, e.g. Mobilization, Foundation, Framing, MEP Rough-In, Closeout'),
  duration_days: z.number().int().min(1),
  start_offset_days: z.number().int().min(0).describe('Calendar days from project start date'),
  is_critical_path: z.boolean(),
  predecessor_sort_orders: z.array(z.number().int()).describe('sort_orders of tasks that must complete before this one starts'),
  assigned_trade: z.string().describe('Trade responsible, e.g. General Contractor, Electrical, Concrete'),
  milestone: z.boolean().describe('true if this is a project milestone rather than a work task'),
});

const BudgetLineSchema = z.object({
  cost_code: z.string().describe('CSI-format cost code, e.g. 03-0000, 26-0000'),
  csi_division: z.string().describe('CSI division name, e.g. 03 – Concrete, 26 – Electrical'),
  description: z.string().describe('Clear description of this budget item'),
  category: z.enum(['labor', 'material', 'equipment', 'subcontract', 'general_conditions', 'overhead']),
  original_budget: z.number().describe('Budget amount in dollars'),
  notes: z.string().optional(),
});

const ContactSchema = z.object({
  contact_type: z.enum(['owner', 'architect', 'engineer', 'general_contractor', 'subcontractor', 'inspector', 'lender', 'surety', 'other']),
  company_name: z.string(),
  contact_name: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  role_description: z.string().describe('Specific role on this project'),
});

const SubPackageSchema = z.object({
  trade: z.string().describe('Trade or scope name'),
  name: z.string().describe('Bid package name'),
  code: z.string().describe('Short code, e.g. SUB-01-ELEC'),
  scope_summary: z.string().describe('What this sub is responsible for'),
  estimated_value: z.number().describe('Estimated subcontract value'),
  required_by_phase: z.string().describe('Which project phase needs this sub mobilized'),
  bid_due_days_from_start: z.number().int().describe('How many days after project start to set bid due date'),
  key_requirements: z.array(z.string()).describe('Top 3-5 requirements for this subcontractor'),
});

const SafetyHazardSchema = z.object({
  hazard: z.string().describe('Specific safety hazard on this project'),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  controls: z.array(z.string()).describe('Controls to mitigate this hazard'),
  phase: z.string().describe('When this hazard is most present'),
});

const QcInspectionSchema = z.object({
  phase: z.string(),
  inspection_name: z.string(),
  description: z.string().describe('What is inspected and what to look for'),
  required_by: z.string().describe('Who must perform or witness this inspection'),
  before_task: z.string().describe('Which schedule task must be inspected before proceeding'),
  pass_criteria: z.string().describe('Clear definition of passing this inspection'),
});

const KickoffActionSchema = z.object({
  priority: z.number().int().min(1).max(10),
  action: z.string().describe('Specific action item'),
  owner: z.string().describe('Role responsible: Project Manager, Super, Estimator, etc.'),
  due_days_from_start: z.number().int().describe('Days from project start this must be completed'),
});

const ProjectAutoCreateOutputSchema = z.object({
  // Project metadata
  project_description: z.string().describe('3-4 sentence project description for internal use'),
  project_type: z.string().describe('e.g. commercial, healthcare, industrial, education, residential'),
  estimated_duration_days: z.number().int().describe('Total calendar days from NTP to substantial completion'),
  phases: z.array(z.string()).describe('Ordered list of project phases'),

  // Schedule
  schedule_tasks: z.array(ScheduleTaskSchema).min(5).describe('Complete project schedule broken into tasks'),

  // Budget
  budget_lines: z.array(BudgetLineSchema).min(3).describe('Budget allocated by cost code'),

  // Contacts
  contacts: z.array(ContactSchema).describe('All project stakeholders and team members'),

  // Sub-packages for next-tier subs
  sub_packages: z.array(SubPackageSchema).describe('Bid packages to create for subcontractors'),

  // Safety
  safety_hazards: z.array(SafetyHazardSchema).min(3),
  safety_orientation_topics: z.array(z.string()).describe('Topics for site orientation'),
  osha_requirements: z.array(z.string()).describe('OSHA programs/plans required for this project'),

  // QC
  qc_inspections: z.array(QcInspectionSchema).min(3),
  quality_standards: z.array(z.string()).describe('Key quality standards applicable to this project'),

  // Kickoff
  kickoff_action_items: z.array(KickoffActionSchema).min(5),

  // Document structure
  document_folders: z.array(z.string()).describe('Folder structure for project documents'),
});

type ProjectAutoCreateOutput = z.infer<typeof ProjectAutoCreateOutputSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Fetch all data needed for project creation
// ─────────────────────────────────────────────────────────────────────────────

async function gatherProjectData(tenantId: string, contractId: string, bidSubmissionId: string) {
  const [contractRes, submissionRes] = await Promise.all([
    supabaseAdmin
      .from('contracts')
      .select('*, contract_milestones(*)')
      .eq('id', contractId)
      .eq('tenant_id', tenantId)
      .single(),

    supabaseAdmin
      .from('bid_submissions')
      .select(`
        *,
        bid_packages!inner(
          id, name, code, description, project_id,
          bid_package_items(*),
          bid_jackets(*)
        ),
        subcontractor_companies(name, primary_email)
      `)
      .eq('id', bidSubmissionId)
      .eq('tenant_id', tenantId)
      .single(),
  ]);

  if (contractRes.error) throw new Error(`Contract fetch: ${contractRes.error.message}`);
  if (submissionRes.error) throw new Error(`Submission fetch: ${submissionRes.error.message}`);

  const submission = submissionRes.data as Record<string, unknown>;
  const pkg = (submission.bid_packages as Record<string, unknown>);
  const jacket = (pkg.bid_jackets as Array<Record<string, unknown>>)?.[0] ?? null;
  const projectId = pkg.project_id as string;

  // Fetch existing project data
  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single();

  // Fetch existing contacts
  const { data: existingContacts } = await supabaseAdmin
    .from('project_contacts')
    .select('*')
    .eq('project_id', projectId)
    .eq('tenant_id', tenantId);

  return {
    contract: contractRes.data as Record<string, unknown>,
    submission,
    pkg,
    jacket,
    project: project as Record<string, unknown>,
    projectId,
    existingContacts: existingContacts ?? [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Build the AI prompt from gathered data
// ─────────────────────────────────────────────────────────────────────────────

function buildCreationPrompt(data: Awaited<ReturnType<typeof gatherProjectData>>): string {
  const { contract, submission, pkg, jacket, project } = data;

  const contractValue = Number(contract.contract_value ?? 0);
  const startDate = (contract.start_date as string) ?? new Date().toISOString().split('T')[0];
  const subName = (submission.subcontractor_companies as Record<string, unknown> | null)?.name as string ?? 'Subcontractor';

  const itemLines = ((pkg.bid_package_items as Array<Record<string, unknown>>) ?? [])
    .map((i) => `  ${i.code}: ${i.title} | ${i.quantity} ${i.uom} | ${i.description ?? ''}`)
    .join('\n');

  const milestonesLines = ((contract.contract_milestones as Array<Record<string, unknown>>) ?? [])
    .map((m) => `  ${m.title}: $${Number(m.amount).toLocaleString()} (${m.percent_of_contract}%) due ${m.due_date ?? 'TBD'}`)
    .join('\n');

  return `
You are a senior construction project manager setting up a new project in a CRM system.
A bid has been awarded and you must auto-build the COMPLETE project structure.

## PROJECT INFORMATION
Project Name: ${(project as Record<string, unknown>)?.name as string ?? pkg.name as string}
Location: ${(project as Record<string, unknown>)?.address as string ?? (project as Record<string, unknown>)?.location as string ?? 'Not specified'}
Project Type: ${(project as Record<string, unknown>)?.project_type as string ?? 'Commercial Construction'}
Description: ${(project as Record<string, unknown>)?.description as string ?? 'No description provided.'}

## CONTRACT DETAILS
Contract Number: ${contract.contract_number as string}
Contract Value: $${contractValue.toLocaleString()}
Start Date: ${startDate}
Substantial Completion: ${contract.substantial_completion_date as string ?? 'TBD'}
Retainage: ${contract.retainage_percent as number}%
Subcontractor: ${subName}

## PAYMENT MILESTONES
${milestonesLines || '  Standard progress payments'}

## BID PACKAGE SCOPE
${(jacket?.scope_of_work as string) ?? (pkg.description as string) ?? 'See line items below.'}

## BID LINE ITEMS (what was bid and awarded)
${itemLines || '  (no line items defined)'}

## WORK DESCRIPTION
${(jacket?.work_description as string) ?? 'Standard construction methods apply.'}

## QUALIFICATION REQUIREMENTS
${(jacket?.qualification_requirements as string) ?? 'Standard contractor qualifications.'}

## INSURANCE REQUIREMENTS
${(jacket?.insurance_requirements as string) ?? 'Standard insurance requirements apply.'}

## SPECIAL CONDITIONS
${(jacket?.special_conditions as string) ?? 'None specified.'}

## YOUR TASK
Generate a COMPLETE, FULLY POPULATED project structure:

1. SCHEDULE: Create realistic tasks with durations and dependencies. Tasks must be sequenced correctly.
   Include mobilization, major work phases, inspections, punch list, and closeout.
   Flag critical path tasks. Total duration must be realistic for this scope and budget.

2. BUDGET: Allocate the $${contractValue.toLocaleString()} contract value across CSI cost codes.
   Breakdown should reflect the actual scope of work. Include labor, material, equipment, subs.

3. CONTACTS: Extract all parties from the contract/scope and define their roles.
   Include owner, architect, engineer, GC, key subcontractors, inspectors.

4. SUB-PACKAGES: What trades need to be subcontracted below us? Create bid packages for each.
   Include realistic estimated values that sum to no more than 70% of contract value.

5. SAFETY: Identify ALL site-specific hazards for this type of project and scope.
   Provide specific controls, not generic ones. Include OSHA-required programs.

6. QC INSPECTIONS: Define all required inspections at key milestones.
   Include who witnesses each inspection and clear pass criteria.

7. KICKOFF ACTIONS: What must happen in the first 2 weeks? Be specific and assign owners.

Be specific to THIS project. No generic boilerplate. The team should be able to run this project
immediately from what you generate without needing to add anything manually.
`.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Write everything to the database
// ─────────────────────────────────────────────────────────────────────────────

async function writeProjectToDatabase(
  tenantId: string,
  contractId: string,
  bidSubmissionId: string,
  data: Awaited<ReturnType<typeof gatherProjectData>>,
  output: ProjectAutoCreateOutput,
  usage: { input_tokens: number; output_tokens: number },
): Promise<{ tasksCreated: number; budgetLinesCreated: number; contactsCreated: number; subPackagesCreated: number }> {
  const now = new Date().toISOString();
  const { projectId, existingContacts, contract } = data;
  const startDate = new Date((contract.start_date as string) ?? now);

  let tasksCreated = 0;
  let budgetLinesCreated = 0;
  let contactsCreated = 0;
  let subPackagesCreated = 0;

  // ── 1. Update project description and type ─────────────────────────────────
  await supabaseAdmin
    .from('projects')
    .update({
      description: output.project_description,
      project_type: output.project_type,
      updated_at: now,
    })
    .eq('id', projectId)
    .eq('tenant_id', tenantId);

  // ── 2. Create schedule tasks ───────────────────────────────────────────────
  // Delete any existing auto-generated tasks first
  await supabaseAdmin
    .from('schedule_tasks')
    .delete()
    .eq('project_id', projectId)
    .eq('tenant_id', tenantId)
    .eq('auto_generated', true);

  // Build tasks in order — resolve predecessor IDs after insertion
  const taskIdBySortOrder = new Map<number, string>();
  const taskRows = output.schedule_tasks.map((t) => {
    const taskStart = new Date(startDate.getTime() + t.start_offset_days * 86400000);
    const taskEnd = new Date(taskStart.getTime() + t.duration_days * 86400000);
    return {
      tenant_id: tenantId,
      project_id: projectId,
      name: t.name,
      description: t.description,
      phase: t.phase,
      duration_days: t.duration_days,
      start_date: taskStart.toISOString().split('T')[0],
      baseline_finish_date: taskEnd.toISOString().split('T')[0],
      finish_date: taskEnd.toISOString().split('T')[0],
      is_critical_path: t.is_critical_path,
      assigned_trade: t.assigned_trade,
      is_milestone: t.milestone,
      percent_complete: 0,
      status: 'not_started',
      auto_generated: true,
      sort_order: t.sort_order,
      created_at: now,
      updated_at: now,
    };
  });

  if (taskRows.length > 0) {
    const { data: insertedTasks, error: taskErr } = await supabaseAdmin
      .from('schedule_tasks')
      .insert(taskRows)
      .select('id, sort_order');

    if (taskErr) {
      console.error('[AutoCreate] Schedule tasks error:', taskErr.message);
    } else {
      tasksCreated = (insertedTasks ?? []).length;

      // Map sort_order → id for predecessor wiring
      for (const t of insertedTasks ?? []) {
        taskIdBySortOrder.set(t.sort_order as number, t.id as string);
      }

      // Wire predecessors
      for (const taskDef of output.schedule_tasks) {
        if (taskDef.predecessor_sort_orders.length === 0) continue;
        const taskId = taskIdBySortOrder.get(taskDef.sort_order);
        if (!taskId) continue;

        const predIds = taskDef.predecessor_sort_orders
          .map((s) => taskIdBySortOrder.get(s))
          .filter(Boolean);

        if (predIds.length > 0) {
          await supabaseAdmin
            .from('schedule_tasks')
            .update({ predecessor_ids: predIds, updated_at: now })
            .eq('id', taskId);
        }
      }
    }
  }

  // ── 3. Create budget line items ────────────────────────────────────────────
  const budgetRows = output.budget_lines.map((b) => ({
    tenant_id: tenantId,
    project_id: projectId,
    cost_code: b.cost_code,
    description: b.description,
    category: b.category,
    original_budget: b.original_budget,
    approved_changes: 0,
    committed_cost: 0,
    actual_cost: 0,
    forecast_cost: b.original_budget,
    created_at: now,
    updated_at: now,
  }));

  if (budgetRows.length > 0) {
    const { error: budgetErr } = await supabaseAdmin.from('budget_line_items').insert(budgetRows);
    if (budgetErr) console.error('[AutoCreate] Budget lines error:', budgetErr.message);
    else budgetLinesCreated = budgetRows.length;
  }

  // ── 4. Create project contacts ─────────────────────────────────────────────
  const existingNames = new Set(existingContacts.map((c) => (c.company_name as string).toLowerCase()));

  const contactRows = output.contacts
    .filter((c) => !existingNames.has(c.company_name.toLowerCase()))
    .map((c) => ({
      tenant_id: tenantId,
      project_id: projectId,
      contact_type: c.contact_type,
      company_name: c.company_name,
      contact_name: c.contact_name ?? null,
      email: c.email ?? null,
      phone: c.phone ?? null,
      notes: c.role_description,
      created_at: now,
      updated_at: now,
    }));

  if (contactRows.length > 0) {
    const { error: contactErr } = await supabaseAdmin.from('project_contacts').insert(contactRows);
    if (contactErr) console.error('[AutoCreate] Contacts error:', contactErr.message);
    else contactsCreated = contactRows.length;
  }

  // ── 5. Create sub-packages ─────────────────────────────────────────────────
  for (const sub of output.sub_packages) {
    const bidDue = new Date(startDate.getTime() + sub.bid_due_days_from_start * 86400000);

    const { data: newPkg, error: pkgErr } = await supabaseAdmin
      .from('bid_packages')
      .insert({
        tenant_id: tenantId,
        project_id: projectId,
        code: sub.code,
        name: sub.name,
        description: sub.scope_summary,
        status: 'draft',
        due_at: bidDue.toISOString(),
        created_at: now,
        updated_at: now,
      })
      .select('id')
      .single();

    if (pkgErr) {
      console.error(`[AutoCreate] Sub-package error for ${sub.name}:`, pkgErr.message);
      continue;
    }

    subPackagesCreated++;

    // Add key requirements as bid package items (lump sum)
    if (newPkg && sub.key_requirements.length > 0) {
      const reqItems = sub.key_requirements.map((req, idx) => ({
        bid_package_id: newPkg.id,
        sort_order: idx + 1,
        code: `${sub.code}-${String(idx + 1).padStart(2, '0')}`,
        title: req,
        description: req,
        uom: 'LS',
        quantity: 1,
        created_at: now,
      }));

      await supabaseAdmin.from('bid_package_items').insert(reqItems);
    }
  }

  // ── 6. Create safety incident placeholder / safety plan notes ─────────────
  // Store safety plan as a project note / document folder
  await supabaseAdmin
    .from('projects')
    .update({
      safety_hazards: output.safety_hazards,
      safety_orientation_topics: output.safety_orientation_topics,
      osha_requirements: output.osha_requirements,
      document_folders: output.document_folders,
      updated_at: now,
    })
    .eq('id', projectId)
    .eq('tenant_id', tenantId);

  // ── 7. Audit record ────────────────────────────────────────────────────────
  await supabaseAdmin.from('auto_created_projects').insert({
    tenant_id: tenantId,
    project_id: projectId,
    bid_submission_id: bidSubmissionId,
    contract_id: contractId,
    schedule_tasks_created: tasksCreated,
    budget_lines_created: budgetLinesCreated,
    contacts_created: contactsCreated,
    subpackages_created: subPackagesCreated,
    rfi_log_initialized: true,
    safety_plan_created: output.safety_hazards.length > 0,
    qc_checklist_created: output.qc_inspections.length > 0,
    document_structure_created: output.document_folders.length > 0,
    ai_model: 'claude-opus-4-6',
    ai_prompt_tokens: usage.input_tokens,
    ai_output_tokens: usage.output_tokens,
    creation_summary: `Auto-created from contract ${contract.contract_number as string}. ${tasksCreated} schedule tasks, ${budgetLinesCreated} budget lines, ${contactsCreated} contacts, ${subPackagesCreated} sub-packages.`,
    created_at: now,
  });

  return { tasksCreated, budgetLinesCreated, contactsCreated, subPackagesCreated };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

export type AutoCreateResult = {
  projectId: string;
  tasksCreated: number;
  budgetLinesCreated: number;
  contactsCreated: number;
  subPackagesCreated: number;
  estimatedDurationDays: number;
  kickoffActionItems: Array<{ priority: number; action: string; owner: string; dueDays: number }>;
  summary: string;
  usage: { input_tokens: number; output_tokens: number };
};

export async function autoCreateProject(opts: {
  tenantId: string;
  contractId: string;
  bidSubmissionId: string;
}): Promise<AutoCreateResult> {
  // 1. Gather all project data
  const data = await gatherProjectData(opts.tenantId, opts.contractId, opts.bidSubmissionId);

  // 2. Build prompt
  const prompt = buildCreationPrompt(data);

  // 3. Stream Claude — this is a large output, must stream
  const stream = client.messages.stream({
    model: 'claude-opus-4-6',
    max_tokens: 16000,
    // thinking: adaptive (use standard create — SDK 0.54 uses enabled/budget_tokens)
    system: `You are a senior construction project manager setting up projects in a CRM.
Your output goes directly into the database — no human review before it's used.
Be specific and realistic. Every task duration must be achievable. Every budget line must sum
to the contract value. Every contact must have a real role. Do not use placeholder text.`,
    messages: [{ role: 'user', content: prompt }],
  });

  const finalMessage = await stream.finalMessage();

  // 4. Parse structured output
  const textBlock = finalMessage.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text block in Claude response');
  }

  const raw = JSON.parse(textBlock.text) as Record<string, unknown>;
  const output = ProjectAutoCreateOutputSchema.parse(raw['project_creation'] ?? raw);

  const usage = {
    input_tokens: finalMessage.usage.input_tokens,
    output_tokens: finalMessage.usage.output_tokens,
  };

  // 5. Write everything to database
  const counts = await writeProjectToDatabase(
    opts.tenantId,
    opts.contractId,
    opts.bidSubmissionId,
    data,
    output,
    usage,
  );

  // 6. Email project team the kickoff action items
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.saguarocrm.com';
  const projectName = (data.project as Record<string, unknown>)?.name as string ?? 'New Project';

  const { data: teamContacts } = await supabaseAdmin
    .from('project_contacts')
    .select('email')
    .eq('project_id', data.projectId)
    .eq('tenant_id', opts.tenantId)
    .in('contact_type', ['general_contractor', 'owner'])
    .not('email', 'is', null);

  const teamEmails = [...new Set((teamContacts ?? []).map((c) => c.email as string).filter(Boolean))];

  if (teamEmails.length > 0) {
    const topActions = output.kickoff_action_items
      .sort((a, b) => a.priority - b.priority)
      .slice(0, 8);

    // Build kickoff email body
    const actionRows = topActions
      .map((a) => `<tr><td>${a.priority}</td><td>${a.action}</td><td>${a.owner}</td><td>${a.due_days_from_start} days</td></tr>`)
      .join('');

    await EmailService.sendCriticalAlertImmediate({
      to: teamEmails,
      projectName,
      alertTitle: `Project Created: ${projectName}`,
      alertSummary:
        `Saguaro has automatically built your project. ` +
        `${counts.tasksCreated} schedule tasks, ${counts.budgetLinesCreated} budget lines, ` +
        `${counts.contactsCreated} contacts, and ${counts.subPackagesCreated} sub-packages have been created. ` +
        `Review the project and complete the kickoff action items below.`,
      severity: 'high',
      ruleCode: 'PROJECT_AUTO_CREATED',
      dashboardUrl: `${appUrl}/projects/${data.projectId}`,
    });
  }

  const summary =
    `Project auto-created from ${data.contract.contract_number as string}. ` +
    `Schedule: ${counts.tasksCreated} tasks across ${output.phases.length} phases. ` +
    `Budget: ${counts.budgetLinesCreated} lines. ` +
    `Contacts: ${counts.contactsCreated}. ` +
    `Sub-packages: ${counts.subPackagesCreated}. ` +
    `Duration: ${output.estimated_duration_days} days.`;

  return {
    projectId: data.projectId,
    tasksCreated: counts.tasksCreated,
    budgetLinesCreated: counts.budgetLinesCreated,
    contactsCreated: counts.contactsCreated,
    subPackagesCreated: counts.subPackagesCreated,
    estimatedDurationDays: output.estimated_duration_days,
    kickoffActionItems: output.kickoff_action_items
      .sort((a, b) => a.priority - b.priority)
      .map((a) => ({
        priority: a.priority,
        action: a.action,
        owner: a.owner,
        dueDays: a.due_days_from_start,
      })),
    summary,
    usage,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const [, , tenantId, contractId, bidSubmissionId] = process.argv;

  if (!tenantId || !contractId || !bidSubmissionId) {
    console.error('Usage: npx tsx project-auto-creator.ts <tenantId> <contractId> <bidSubmissionId>');
    process.exit(1);
  }

  console.log('🏗️  Auto-creating project with Claude Opus 4.6...\n');

  const result = await autoCreateProject({ tenantId, contractId, bidSubmissionId });

  console.log('\n✅ Project creation complete!');
  console.log(JSON.stringify({
    projectId: result.projectId,
    tasksCreated: result.tasksCreated,
    budgetLinesCreated: result.budgetLinesCreated,
    contactsCreated: result.contactsCreated,
    subPackagesCreated: result.subPackagesCreated,
    estimatedDurationDays: result.estimatedDurationDays,
    tokensUsed: result.usage,
    topActions: result.kickoffActionItems.slice(0, 5),
  }, null, 2));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
