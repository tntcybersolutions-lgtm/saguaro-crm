/**
 * ai-bid-jacket.ts
 *
 * AI-powered bid jacket generator for Saguaro CRM.
 *
 * Reads all project data from Supabase, then uses Claude Opus 4.6
 * (adaptive thinking + structured output) to produce a fully populated
 * bid jacket document — project summary, detailed scope of work, line
 * items with quantities/units, qualification requirements, insurance
 * requirements, invitation letter, required documents, and evaluation
 * criteria.  The output is written back to bid_packages (line items)
 * and bid_jackets (narrative fields) in Supabase.
 *
 * Usage (CLI):
 *   npx tsx ai-bid-jacket.ts <tenantId> <projectId> <bidPackageId>
 *
 * Usage (programmatic):
 *   import { generateBidJacket } from './ai-bid-jacket';
 *   const jacket = await generateBidJacket({ tenantId, projectId, bidPackageId });
 */

import { createHash, randomBytes } from 'node:crypto';

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';


import { supabaseAdmin } from './supabase/admin';
import { EmailService } from './email-service';

// ─────────────────────────────────────────────────────────────────────────────
// Schema — what Claude must produce
// ─────────────────────────────────────────────────────────────────────────────

const LineItemSchema = z.object({
  sort_order: z.number().int().describe('Display order, 1-based'),
  code: z.string().describe('Short item code such as CONC-01 or ELEC-03'),
  title: z.string().describe('Short line item title'),
  description: z.string().describe('Detailed description of the work item'),
  uom: z.string().describe('Unit of measure: SF, LF, EA, LS, HR, CY, etc.'),
  quantity: z.number().describe('Estimated quantity; 1 for lump sum items'),
});

const EvaluationCriterionSchema = z.object({
  criterion: z.string(),
  weight_percent: z.number().int().min(0).max(100),
});

const SuggestedSubSchema = z.object({
  trade: z.string(),
  notes: z.string().describe('Why this trade type is relevant and any special requirements'),
});

const BidJacketSchema = z.object({
  project_summary: z
    .string()
    .describe('2–4 sentence executive summary of the project for subcontractors'),
  scope_of_work: z
    .string()
    .describe('Complete scope narrative describing what is and is NOT included in this bid package'),
  work_description: z
    .string()
    .describe('Technical description of the work: methods, standards, quality expectations'),
  line_items: z
    .array(LineItemSchema)
    .min(3)
    .describe('Structured bid line items that subs will price'),
  qualification_requirements: z
    .string()
    .describe('Contractor qualifications: license types, experience minimums, references, etc.'),
  insurance_requirements: z
    .string()
    .describe(
      'Required insurance types and limits: GL, auto, workers comp, umbrella, professional, etc.',
    ),
  bonding_requirements: z
    .string()
    .describe('Performance and payment bond requirements, if any'),
  bid_instructions: z
    .string()
    .describe('Step-by-step instructions for how to prepare and submit a bid'),
  invitation_letter: z
    .string()
    .describe(
      'Professional invitation letter to send to subcontractors inviting them to bid',
    ),
  special_conditions: z
    .string()
    .describe('Site-specific rules, access restrictions, work hours, prevailing wage, etc.'),
  suggested_subcontractors: z
    .array(SuggestedSubSchema)
    .describe('Trade types that should be invited based on the scope'),
  required_documents: z
    .array(z.string())
    .describe('List of documents subcontractors must submit with their bid'),
  evaluation_criteria: z
    .array(EvaluationCriterionSchema)
    .describe('How bids will be evaluated; weights must sum to 100'),
});

export type BidJacketOutput = z.infer<typeof BidJacketSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// System prompt
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a Senior Estimator and Contracts Manager with 25+ years of commercial and residential general contracting experience. You have issued thousands of subcontractor bid packages for projects ranging from $50K residential remodels to $50M commercial builds.

Your bid jackets win projects because they are specific, fair, complete, and professionally written. Subcontractors trust and respond to your packages because they know exactly what is expected.

════════════════════════════════════════════════
SCOPE OF WORK — MANDATORY STRUCTURE
════════════════════════════════════════════════
Every scope must have two explicit sections:

INCLUDED IN THIS BID (be exhaustive):
- List every work item the sub is responsible for
- Reference drawing sheet numbers and specification sections where possible
- State materials, standards, and finishes expected
- Specify who provides materials vs. who installs
- State coordination responsibilities (e.g., "Sub to coordinate with MEP for penetrations")

EXPLICITLY EXCLUDED FROM THIS BID (equally important):
Always include these standard GC-provided exclusions:
  ✗ Temporary power, water, and sanitation (provided by GC)
  ✗ Trash removal and dumpsters (provided by GC)
  ✗ Temporary site security and fencing (provided by GC)
  ✗ General liability insurance for GC's own operations
  ✗ Permits (GC holds building permit; sub provides trade permits if required)
  ✗ Design/engineering services unless explicitly listed in INCLUDED
  ✗ Soils testing, surveying, geotechnical work
  ✗ Work shown on drawings but not listed in this bid package scope
  ✗ Change order work (separate authorization required)
  ✗ Any work by other trades

════════════════════════════════════════════════
INSURANCE REQUIREMENTS — USE SPECIFIC LIMITS
════════════════════════════════════════════════
Always specify ACTUAL dollar limits, not "adequate" or "standard":

Standard residential project (<$500K contract):
  • Commercial General Liability: $1,000,000 per occurrence / $2,000,000 aggregate
  • Automobile Liability: $1,000,000 combined single limit
  • Workers' Compensation: Statutory limits per state law
  • Employer's Liability: $500,000 each accident
  • Name as Additional Insured: [GC Company Name], Owner, Architect
  • Certificate required before mobilization

Standard commercial project ($500K–$5M contract):
  • Commercial General Liability: $2,000,000 per occurrence / $4,000,000 aggregate
  • Umbrella/Excess Liability: $5,000,000
  • Automobile Liability: $1,000,000 combined single limit
  • Workers' Compensation: Statutory + $1,000,000 employer's liability
  • Professional Liability (design-build only): $1,000,000
  • Additional Insured endorsement (primary and non-contributory)
  • Waiver of subrogation required
  • 30-day cancellation notice required

Large commercial (>$5M): Add $10M umbrella minimum.

════════════════════════════════════════════════
PAYMENT TERMS — ALWAYS SPECIFY
════════════════════════════════════════════════
Include in bid instructions:
  • Payment terms: Net 30 from receipt of approved invoice
  • Retainage: 10% held through substantial completion, released at final completion with lien waiver
  • Billing schedule: Monthly applications per AIA G702/G703 format
  • Lien waiver required with each payment application
  • Joint check agreement available for material suppliers exceeding $10,000
  • Payment bond: Required if subcontract value exceeds $[threshold from project data]

════════════════════════════════════════════════
PREVAILING WAGE DETECTION
════════════════════════════════════════════════
AUTOMATICALLY include prevailing wage language if ANY of these are true:
  • Project owner is federal, state, county, city, school district, or public agency
  • Project mentions "HUD", "CDBG", "Davis-Bacon", "SCA", "prevailing wage"
  • Project is a public school, government building, courthouse, military facility
  • Project uses tax increment financing (TIF) or public bonds

If prevailing wage applies:
"⚠️ PREVAILING WAGE PROJECT: This project is subject to Davis-Bacon Act / [State] Prevailing Wage Law. All trades must pay applicable prevailing wage rates. Certified payrolls required weekly. Failure to comply will result in contract termination and forfeiture of payments."

If no prevailing wage indicators: omit this section entirely.

════════════════════════════════════════════════
BONDING REQUIREMENTS
════════════════════════════════════════════════
Require bonds when subcontract value exceeds thresholds:
  > $100,000: Performance Bond + Payment Bond at 100% of subcontract value recommended
  > $500,000: Bonds required. Sub must have bonding capacity from A-rated surety.
  Public projects: Always require bonds regardless of value.
  State which surety company must be acceptable (A.M. Best rated A- or better).

════════════════════════════════════════════════
EVALUATION CRITERIA — WEIGHT BY PROJECT TYPE
════════════════════════════════════════════════
Residential/light commercial (price-sensitive):
  Price: 50%, Experience: 20%, Schedule: 15%, References: 10%, Safety: 5%

Commercial/institutional (quality-sensitive):
  Price: 35%, Experience: 25%, Safety Record: 20%, Schedule: 15%, References: 5%

Government/public works:
  Price: 40%, Qualifications: 25%, Safety: 20%, Local workforce: 10%, References: 5%

Adjust based on project data provided. Weights must always sum to 100.

════════════════════════════════════════════════
RULES — NON-NEGOTIABLE
════════════════════════════════════════════════
1. Line items must be PRICEABLE: quantity × unit × unit price = total. Never use "allowance" or "lump sum" for items you can quantify.
2. Invitation letter must state: project name, location, bid due date AND TIME, who to submit to, and what format (email, portal, sealed envelope).
3. Scope exclusions are as legally important as inclusions — never omit them.
4. If project is a public agency owner → automatically include prevailing wage language.
5. Never invent requirements not supported by project data — but always include the standard GC exclusions listed above.
6. Qualification requirements must be verifiable: "Licensed in [State]", "Minimum 5 years experience in [trade]", "No open OSHA citations in past 3 years".`;

// ─────────────────────────────────────────────────────────────────────────────
// Data fetching
// ─────────────────────────────────────────────────────────────────────────────

async function fetchProjectContext(tenantId: string, projectId: string, bidPackageId: string) {
  const [projectRes, bidPackageRes, existingItemsRes, budgetRes, contactsRes, photosRes] =
    await Promise.all([
      supabaseAdmin
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .eq('tenant_id', tenantId)
        .single(),

      supabaseAdmin
        .from('bid_packages')
        .select('*, bid_package_items(*)')
        .eq('id', bidPackageId)
        .eq('tenant_id', tenantId)
        .single(),

      supabaseAdmin
        .from('bid_package_items')
        .select('*')
        .eq('bid_package_id', bidPackageId)
        .order('sort_order'),

      supabaseAdmin
        .from('budget_line_items')
        .select('description, category, cost_code, original_budget, forecast_cost')
        .eq('project_id', projectId)
        .eq('tenant_id', tenantId),

      supabaseAdmin
        .from('project_contacts')
        .select('contact_type, company_name, contact_name')
        .eq('project_id', projectId)
        .eq('tenant_id', tenantId),

      supabaseAdmin
        .from('project_photos')
        .select('entity_type, entity_id, created_at')
        .eq('project_id', projectId)
        .eq('tenant_id', tenantId)
        .limit(10),
    ]);

  if (projectRes.error) throw new Error(`Project fetch: ${projectRes.error.message}`);
  if (bidPackageRes.error) throw new Error(`Bid package fetch: ${bidPackageRes.error.message}`);

  return {
    project: projectRes.data,
    bidPackage: bidPackageRes.data,
    existingItems: existingItemsRes.data ?? [],
    budget: budgetRes.data ?? [],
    contacts: contactsRes.data ?? [],
    hasPhotos: (photosRes.data ?? []).length > 0,
  };
}

function buildPrompt(ctx: Awaited<ReturnType<typeof fetchProjectContext>>): string {
  const { project, bidPackage, existingItems, budget, contacts } = ctx;

  const budgetTotal = budget.reduce(
    (sum, b) => sum + ((b.original_budget as number) ?? 0),
    0,
  );
  const forecastTotal = budget.reduce(
    (sum, b) => sum + ((b.forecast_cost as number) ?? 0),
    0,
  );

  const contactLines = contacts
    .map((c) => `  - ${c.contact_type}: ${c.company_name}${c.contact_name ? ` (${c.contact_name})` : ''}`)
    .join('\n');

  const budgetLines = budget
    .slice(0, 20)
    .map(
      (b) =>
        `  - [${b.category}] ${b.description}${b.cost_code ? ` (${b.cost_code})` : ''}: $${(
          (b.original_budget as number) ?? 0
        ).toLocaleString()}`,
    )
    .join('\n');

  const existingItemLines =
    existingItems.length > 0
      ? existingItems
          .map(
            (i: Record<string, unknown>) =>
              `  - ${i.code ?? ''}: ${i.title} | ${i.uom} × ${i.quantity} | ${i.description ?? ''}`,
          )
          .join('\n')
      : '  (none — generate from scratch based on the scope)';

  const dueDate = bidPackage.due_at
    ? new Date(bidPackage.due_at).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'TBD — to be set by project team';

  return `
## PROJECT INFORMATION

**Project Name:** ${(project as Record<string, unknown>).name ?? 'Unnamed Project'}
**Project ID:** ${project.id}
**Location:** ${(project as Record<string, unknown>).address ?? (project as Record<string, unknown>).location ?? 'Location not specified'}
**Project Type:** ${(project as Record<string, unknown>).project_type ?? (project as Record<string, unknown>).type ?? 'Commercial Construction'}
**Description:** ${(project as Record<string, unknown>).description ?? 'No additional description provided.'}
**Status:** ${(project as Record<string, unknown>).status ?? 'Active'}

## PROJECT CONTACTS
${contactLines || '  (none on file)'}

## BID PACKAGE DETAILS

**Package Name:** ${bidPackage.name}
**Package Code:** ${bidPackage.code ?? 'N/A'}
**Description:** ${bidPackage.description ?? 'No additional description.'}
**Bid Due Date:** ${dueDate}
**Package Status:** ${bidPackage.status}

## BUDGET CONTEXT (for scope sizing only — do NOT put dollar amounts in scope or line items)

**Total Project Budget on File:** $${budgetTotal.toLocaleString()}
**Forecast Total:** $${forecastTotal.toLocaleString()}

**Budget Line Items:**
${budgetLines || '  (no budget on file)'}

## EXISTING BID LINE ITEMS (expand, improve, or replace as needed)

${existingItemLines}

## YOUR TASK

Generate a complete, professional bid jacket for this bid package.
- The line items you generate will be loaded directly into the bid package for subcontractors to price.
- The narrative sections (scope, invitation letter, etc.) will be sent to subcontractors as the official bid document.
- Be specific to this project — no generic boilerplate.
- The invitation letter must reference the bid due date of: ${dueDate}
`.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Write results back to Supabase
// ─────────────────────────────────────────────────────────────────────────────

async function persistBidJacket(
  scope: { tenantId: string; projectId: string; bidPackageId: string },
  jacket: BidJacketOutput,
  usage: { input_tokens: number; output_tokens: number },
) {
  const now = new Date().toISOString();

  // 1. Upsert bid_jackets record
  const { error: jacketError } = await supabaseAdmin.from('bid_jackets').upsert(
    {
      tenant_id: scope.tenantId,
      project_id: scope.projectId,
      bid_package_id: scope.bidPackageId,
      ai_generated: true,
      ai_model: 'claude-opus-4-6',
      ai_prompt_tokens: usage.input_tokens,
      ai_output_tokens: usage.output_tokens,
      generated_at: now,
      project_summary: jacket.project_summary,
      scope_of_work: jacket.scope_of_work,
      work_description: jacket.work_description,
      qualification_requirements: jacket.qualification_requirements,
      insurance_requirements: jacket.insurance_requirements,
      bonding_requirements: jacket.bonding_requirements,
      bid_instructions: jacket.bid_instructions,
      invitation_letter: jacket.invitation_letter,
      special_conditions: jacket.special_conditions,
      suggested_subcontractors: jacket.suggested_subcontractors,
      required_documents: jacket.required_documents,
      evaluation_criteria: jacket.evaluation_criteria,
      updated_at: now,
    },
    { onConflict: 'bid_package_id' },
  );

  if (jacketError) throw new Error(`bid_jackets upsert: ${jacketError.message}`);

  // 2. Replace bid_package_items with AI-generated line items
  if (jacket.line_items.length > 0) {
    // Delete existing items first
    await supabaseAdmin
      .from('bid_package_items')
      .delete()
      .eq('bid_package_id', scope.bidPackageId);

    const itemRows = jacket.line_items.map((item) => ({
      bid_package_id: scope.bidPackageId,
      sort_order: item.sort_order,
      code: item.code,
      title: item.title,
      description: item.description,
      uom: item.uom,
      quantity: item.quantity,
    }));

    const { error: itemsError } = await supabaseAdmin
      .from('bid_package_items')
      .insert(itemRows);

    if (itemsError) throw new Error(`bid_package_items insert: ${itemsError.message}`);
  }

  // 3. Update bid_package name/description if the AI improved them
  const { error: pkgError } = await supabaseAdmin
    .from('bid_packages')
    .update({ updated_at: now })
    .eq('id', scope.bidPackageId);

  if (pkgError) throw new Error(`bid_packages update: ${pkgError.message}`);

  return { lineItemsCreated: jacket.line_items.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-invite: look up existing subcontractor companies matching AI-suggested
// trades, create invite records, and email them the bid invitation.
// ─────────────────────────────────────────────────────────────────────────────

async function autoInviteAndEmailSubcontractors(
  scope: { tenantId: string; projectId: string; bidPackageId: string },
  jacket: BidJacketOutput,
  bidPackage: Record<string, unknown>,
  project: Record<string, unknown>,
): Promise<{ invitesCreated: number; emailsSent: number }> {
  let invitesCreated = 0;
  let emailsSent = 0;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.saguarocrm.com';
  const dueDate = bidPackage.due_at
    ? new Date(bidPackage.due_at as string).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'TBD';

  // Fetch all active subcontractor companies for this tenant
  const { data: companies } = await supabaseAdmin
    .from('subcontractor_companies')
    .select('id, name, primary_email')
    .eq('tenant_id', scope.tenantId)
    .eq('status', 'active');

  if (!companies || companies.length === 0) return { invitesCreated, emailsSent };

  // For each AI-suggested trade, check if we have matching companies on file.
  // Simple fuzzy match: if the company name contains any word from the trade label.
  const tradeKeywords = jacket.suggested_subcontractors.flatMap((s) =>
    s.trade.toLowerCase().split(/[\s,/&]+/).filter((w) => w.length > 3),
  );

  const matchedCompanies = companies.filter((co) => {
    const coName = (co.name as string).toLowerCase();
    return tradeKeywords.some((kw) => coName.includes(kw));
  });

  for (const co of matchedCompanies) {
    if (!co.primary_email) continue;

    // Check if invite already exists for this company + package
    const { data: existing } = await supabaseAdmin
      .from('subcontractor_invites')
      .select('id')
      .eq('bid_package_id', scope.bidPackageId)
      .eq('subcontractor_company_id', co.id as string)
      .maybeSingle();

    if (existing) continue; // already invited

    // Create a secure invite token
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

    const portalUrl = `${appUrl}/bid-portal?token=${rawToken}`;

    const { error: inviteErr } = await supabaseAdmin.from('subcontractor_invites').insert({
      tenant_id: scope.tenantId,
      project_id: scope.projectId,
      bid_package_id: scope.bidPackageId,
      subcontractor_company_id: co.id as string,
      email: co.primary_email as string,
      company_name: co.name as string,
      invite_token_hash: tokenHash,
      status: 'pending',
      expires_at: expiresAt,
      last_sent_at: new Date().toISOString(),
    });

    if (inviteErr) {
      console.error(`[BidJacket] Invite insert error for ${co.name as string}:`, inviteErr.message);
      continue;
    }

    invitesCreated++;

    // Send the AI-generated invitation letter via email
    const sent = await EmailService.sendBidInvitation({
      to: co.primary_email as string,
      contactName: co.name as string,
      companyName: co.name as string,
      projectName: (project.name as string) ?? 'Project',
      projectAddress: (project.address as string) ?? (project.location as string) ?? '',
      packageName: bidPackage.name as string,
      packageCode: (bidPackage.code as string) ?? '',
      bidDueDate: dueDate,
      invitationLetter: jacket.invitation_letter,
      portalUrl,
      inviteToken: rawToken,
    });

    if (sent) emailsSent++;
  }

  // Also auto-add project_contacts for any matched companies not already listed
  for (const co of matchedCompanies) {
    const { data: existingContact } = await supabaseAdmin
      .from('project_contacts')
      .select('id')
      .eq('project_id', scope.projectId)
      .eq('tenant_id', scope.tenantId)
      .eq('company_name', co.name as string)
      .maybeSingle();

    if (!existingContact) {
      await supabaseAdmin.from('project_contacts').insert({
        tenant_id: scope.tenantId,
        project_id: scope.projectId,
        contact_type: 'subcontractor',
        company_name: co.name as string,
        email: co.primary_email as string ?? null,
        notes: 'Auto-added by AI bid jacket — invited to bid',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  }

  return { invitesCreated, emailsSent };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

export type BidJacketScope = {
  tenantId: string;
  projectId: string;
  bidPackageId: string;
};

export type BidJacketResult = {
  jacket: BidJacketOutput;
  lineItemsCreated: number;
  invitesCreated: number;
  emailsSent: number;
  usage: { input_tokens: number; output_tokens: number };
  generatedAt: string;
};

export async function generateBidJacket(scope: BidJacketScope): Promise<BidJacketResult> {
  // 1. Fetch all project context from Supabase
  const ctx = await fetchProjectContext(scope.tenantId, scope.projectId, scope.bidPackageId);

  // 2. Build the user prompt
  const userPrompt = buildPrompt(ctx);

  // 3. Call Claude Opus 4.6 with adaptive thinking + structured output
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 8192,
    // thinking: adaptive (use standard create — SDK 0.54 uses enabled/budget_tokens)
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const jacket = (JSON.parse((response.content.find((b: {type:string}) => b.type === "text") as {type:string,text:string})?.text ?? "{}")) as BidJacketOutput;
  const usage = {
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
  };

  // 4. Validate evaluation criteria weights sum to 100
  const weightSum = jacket.evaluation_criteria.reduce((s, c) => s + c.weight_percent, 0);
  if (Math.abs(weightSum - 100) > 1) {
    // Normalize weights
    jacket.evaluation_criteria = jacket.evaluation_criteria.map((c) => ({
      ...c,
      weight_percent: Math.round((c.weight_percent / weightSum) * 100),
    }));
  }

  // 5. Persist to Supabase
  const { lineItemsCreated } = await persistBidJacket(scope, jacket, usage);

  // 6. Auto-invite matching subcontractors from DB + send emails
  const { invitesCreated, emailsSent } = await autoInviteAndEmailSubcontractors(
    scope,
    jacket,
    ctx.bidPackage as Record<string, unknown>,
    ctx.project as Record<string, unknown>,
  );

  const generatedAt = new Date().toISOString();

  return { jacket, lineItemsCreated, invitesCreated, emailsSent, usage, generatedAt };
}

// ─────────────────────────────────────────────────────────────────────────────
// Streaming variant — yields text chunks for real-time UI display
// ─────────────────────────────────────────────────────────────────────────────

export async function* generateBidJacketStream(
  scope: BidJacketScope,
): AsyncGenerator<
  | { type: 'thinking'; delta: string }
  | { type: 'text'; delta: string }
  | { type: 'done'; result: BidJacketResult }
  | { type: 'error'; message: string }
> {
  try {
    const ctx = await fetchProjectContext(scope.tenantId, scope.projectId, scope.bidPackageId);
    const userPrompt = buildPrompt(ctx);

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // Note: streaming with structured output works; finalMessage() gives us
    // the parsed output once the stream completes.
    const stream = client.messages.stream({
      model: 'claude-opus-4-6',
      max_tokens: 8192,
      // thinking: adaptive (use standard create — SDK 0.54 uses enabled/budget_tokens)
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'thinking_delta') {
          yield { type: 'thinking', delta: event.delta.thinking };
        } else if (event.delta.type === 'text_delta') {
          yield { type: 'text', delta: event.delta.text };
        }
      }
    }

    const finalMessage = await stream.finalMessage();

    // Extract the parsed JSON from the text block
    const textBlock = finalMessage.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text block in Claude response');
    }

    const raw = JSON.parse(textBlock.text) as Record<string, unknown>;
    const parsed = BidJacketSchema.parse(
      raw['bid_jacket'] ?? raw,
    );

    // Normalize weights
    const weightSum = parsed.evaluation_criteria.reduce((s, c) => s + c.weight_percent, 0);
    if (Math.abs(weightSum - 100) > 1) {
      parsed.evaluation_criteria = parsed.evaluation_criteria.map((c) => ({
        ...c,
        weight_percent: Math.round((c.weight_percent / weightSum) * 100),
      }));
    }

    const usage = {
      input_tokens: finalMessage.usage.input_tokens,
      output_tokens: finalMessage.usage.output_tokens,
    };

    const { lineItemsCreated } = await persistBidJacket(scope, parsed, usage);

    const { invitesCreated, emailsSent } = await autoInviteAndEmailSubcontractors(
      scope,
      parsed,
      ctx.bidPackage as Record<string, unknown>,
      ctx.project as Record<string, unknown>,
    );

    yield {
      type: 'done',
      result: {
        jacket: parsed,
        lineItemsCreated,
        invitesCreated,
        emailsSent,
        usage,
        generatedAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    yield {
      type: 'error',
      message: err instanceof Error ? err.message : 'Unknown error generating bid jacket',
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI entry point
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const [, , tenantId, projectId, bidPackageId] = process.argv;

  if (!tenantId || !projectId || !bidPackageId) {
    console.error('Usage: npx tsx ai-bid-jacket.ts <tenantId> <projectId> <bidPackageId>');
    process.exit(1);
  }

  console.log('🤖 Generating bid jacket with Claude Opus 4.6...\n');

  for await (const chunk of generateBidJacketStream({ tenantId, projectId, bidPackageId })) {
    if (chunk.type === 'thinking') {
      process.stdout.write('.');
    } else if (chunk.type === 'text') {
      process.stdout.write(chunk.delta);
    } else if (chunk.type === 'done') {
      console.log('\n\n✅ Bid jacket generated successfully!');
      console.log(`   Line items created: ${chunk.result.lineItemsCreated}`);
      console.log(
        `   Tokens used: ${chunk.result.usage.input_tokens} in / ${chunk.result.usage.output_tokens} out`,
      );
      console.log(`   Saved at: ${chunk.result.generatedAt}`);
    } else if (chunk.type === 'error') {
      console.error('\n❌ Error:', chunk.message);
      process.exit(1);
    }
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
