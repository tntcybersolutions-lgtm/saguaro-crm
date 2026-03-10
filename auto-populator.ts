/**
 * auto-populator.ts
 *
 * Saguaro CRM — Universal Form Auto-Population Engine
 *
 * When any form opens in the CRM, this engine reads ALL available
 * project data and pre-fills every field it can determine.
 *
 * Users never type what the system already knows.
 * Their only job: review, adjust if needed, and approve.
 *
 * Supported forms:
 *   rfi                — Request for Information
 *   change_order       — Change Order
 *   pay_application    — AIA G702 Pay Application
 *   lien_waiver        — Conditional/Unconditional Waiver
 *   punch_list_item    — Punch List Item
 *   safety_incident    — Safety Incident Report
 *   daily_log          — Daily Field Log
 *   inspection         — Inspection Record
 *   contract           — Subcontract Agreement fields
 *   budget_line        — Budget Line Item
 *   purchase_order     — Purchase Order
 *   bid_invitation     — Subcontractor Bid Invitation
 *   closeout_item      — Closeout Checklist Item
 *   vendor_compliance  — Vendor W-9/Insurance Onboarding
 *
 * How it works:
 *   1. Caller specifies the form type and any context (entity_id, etc.)
 *   2. Engine fetches all available project data from Supabase
 *   3. Claude Opus 4.6 analyzes the context and fills every determinable field
 *   4. Returns: { fields: {fieldName: value}, confidence, missingFields, suggestions }
 *   5. The UI renders pre-filled form — user reviews and submits
 *
 * Usage:
 *   import { AutoPopulator } from './auto-populator';
 *   const prefill = await AutoPopulator.prefillForm({
 *     tenantId, projectId,
 *     formType: 'rfi',
 *     context: { description: 'Electrical outlet location conflict with structural drawing' }
 *   });
 */

import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from './supabase/admin';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type FormType =
  | 'rfi'
  | 'change_order'
  | 'pay_application'
  | 'lien_waiver'
  | 'punch_list_item'
  | 'safety_incident'
  | 'daily_log'
  | 'inspection'
  | 'contract'
  | 'budget_line'
  | 'purchase_order'
  | 'bid_invitation'
  | 'closeout_item'
  | 'vendor_compliance';

export type AutoFillResult = {
  fields:          Record<string, unknown>;   // fieldName → suggested value
  confidence:      Record<string, 'high' | 'medium' | 'low'>;  // per field
  filledCount:     number;
  totalFields:     number;
  fillPct:         number;
  missingFields:   string[];   // fields that need manual entry
  warnings:        string[];   // issues that need attention
  suggestions:     string[];   // pro tips for this form
  contextSources:  string[];   // what data sources were used
};

// ─────────────────────────────────────────────────────────────────────────────
// Field definitions — what each form contains
// ─────────────────────────────────────────────────────────────────────────────

const FORM_FIELDS: Record<FormType, string[]> = {
  rfi: [
    'rfi_number', 'title', 'description', 'assigned_to', 'due_date',
    'drawing_reference', 'specification_section', 'priority',
    'cost_impact_potential', 'schedule_impact_potential_days',
  ],
  change_order: [
    'co_number', 'title', 'description', 'cost_impact', 'schedule_impact_days',
    'reason_code', 'affected_scope', 'initiated_by',
  ],
  pay_application: [
    'application_number', 'period_from', 'period_to', 'contract_sum',
    'retainage_pct', 'total_previous_payments', 'contractor_name',
    'project_name', 'architect_name', 'owner_name',
  ],
  lien_waiver: [
    'claimant_name', 'claimant_address', 'owner_name', 'gc_name',
    'project_address', 'through_date', 'amount', 'state',
    'waiver_type', 'exceptions',
  ],
  punch_list_item: [
    'item_number', 'location', 'description', 'responsible_party',
    'priority', 'due_date', 'assigned_to',
  ],
  safety_incident: [
    'incident_number', 'incident_type', 'severity', 'incident_date',
    'location', 'description', 'reported_by', 'supervisor_to_notify',
    'osha_reportable', 'treatment_type',
  ],
  daily_log: [
    'log_date', 'weather', 'temperature_f', 'workers_on_site',
    'work_performed', 'delays', 'visitors', 'safety_notes',
  ],
  inspection: [
    'inspection_type', 'scheduled_date', 'inspector_agency',
    'phase', 'description', 'location',
  ],
  contract: [
    'contract_number', 'title', 'scope_of_work', 'contract_value',
    'start_date', 'substantial_completion_date', 'retainage_percent',
    'insurance_requirements', 'lien_waiver_required',
  ],
  budget_line: [
    'cost_code', 'description', 'category', 'original_budget',
    'forecast_cost',
  ],
  purchase_order: [
    'po_number', 'vendor_name', 'vendor_email', 'description',
    'cost_code', 'amount', 'required_date',
  ],
  bid_invitation: [
    'invitation_letter', 'scope_of_work', 'bid_due_date',
    'insurance_requirements', 'qualification_requirements',
    'required_documents',
  ],
  closeout_item: [
    'item', 'document_type', 'responsible_party', 'required', 'notes',
  ],
  vendor_compliance: [
    'vendor_name', 'vendor_email', 'license_state', 'insurance_requirements',
    'gl_limit', 'bond_required',
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Context fetcher — pulls all relevant project data
// ─────────────────────────────────────────────────────────────────────────────

// Wrap a Supabase query builder into a real Promise so TypeScript is happy
function q<T>(builder: PromiseLike<T>): Promise<T> {
  return Promise.resolve(builder);
}

async function fetchContext(tenantId: string, projectId: string, formType: FormType, extraContext?: Record<string, unknown>) {
  const fetches: Promise<unknown>[] = [
    q(supabaseAdmin.from('projects').select('*').eq('id', projectId).eq('tenant_id', tenantId).single()),
    q(supabaseAdmin.from('project_contacts').select('*').eq('project_id', projectId).eq('tenant_id', tenantId)),
  ];

  if (['pay_application', 'lien_waiver', 'contract'].includes(formType)) {
    fetches.push(q(supabaseAdmin.from('contracts').select('*, contract_milestones(*)').eq('project_id', projectId).eq('tenant_id', tenantId)));
    fetches.push(q(supabaseAdmin.from('pay_applications').select('application_number, period_to, total_completed_and_stored').eq('project_id', projectId).order('application_number', { ascending: false }).limit(1)));
  }

  if (['rfi', 'change_order'].includes(formType)) {
    fetches.push(q(supabaseAdmin.from('rfis').select('number, title, status').eq('project_id', projectId).eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(10)));
    fetches.push(q(supabaseAdmin.from('schedule_tasks').select('name, phase, status, baseline_finish_date').eq('project_id', projectId).eq('is_critical_path', true).limit(5)));
  }

  if (formType === 'bid_invitation') {
    fetches.push(q(supabaseAdmin.from('bid_jackets').select('*').eq('project_id', projectId).limit(1).maybeSingle()));
  }

  if (['punch_list_item', 'inspection'].includes(formType)) {
    fetches.push(q(supabaseAdmin.from('field_issues').select('id, issue_number, location, description').eq('project_id', projectId).eq('status', 'open').limit(20)));
  }

  if (formType === 'budget_line') {
    fetches.push(q(supabaseAdmin.from('budget_line_items').select('cost_code, description, category').eq('project_id', projectId).limit(20)));
  }

  const results = await Promise.allSettled(fetches);
  const [projectRes, contactsRes, ...rest] = results;

  return {
    project:  (projectRes.status === 'fulfilled' ? (projectRes.value as { data: unknown }).data : null) as Record<string,unknown> | null,
    contacts: (contactsRes.status === 'fulfilled' ? (contactsRes.value as { data: unknown }).data : []) as Record<string,unknown>[],
    extra:    rest.map(r => r.status === 'fulfilled' ? (r.value as { data: unknown }).data : null),
    formType,
    userProvided: extraContext ?? {},
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Build the Claude prompt from context
// ─────────────────────────────────────────────────────────────────────────────

function buildPrompt(ctx: Awaited<ReturnType<typeof fetchContext>>, formType: FormType): string {
  const project  = ctx.project ?? {};
  const contacts = ctx.contacts;
  const owner    = contacts.find(c => c.contact_type === 'owner');
  const arch     = contacts.find(c => c.contact_type === 'architect');
  const gc       = contacts.find(c => c.contact_type === 'general_contractor');

  const fields = FORM_FIELDS[formType];

  return `
You are a construction project manager AI assistant. Pre-fill every field of the following form using the project data provided.

## Project Data
Project Name: ${project.name ?? 'Unknown'}
Project Address: ${project.address ?? project.location ?? 'Not specified'}
Project Type: ${project.project_type ?? 'commercial'}
Status: ${project.status ?? 'active'}
Start Date: ${project.start_date ?? 'Not set'}
Budget: $${Number(project.budget ?? 0).toLocaleString()}

## Project Contacts
Owner: ${(owner?.company_name ?? owner?.contact_name) ?? 'Not set'} — ${owner?.email ?? ''} — ${owner?.phone ?? ''}
Architect: ${(arch?.company_name ?? arch?.contact_name) ?? 'Not set'} — ${arch?.email ?? ''}
GC: ${(gc?.company_name ?? gc?.contact_name) ?? 'Not set'} — ${gc?.email ?? ''}

## User-Provided Context (highest priority)
${JSON.stringify(ctx.userProvided, null, 2)}

## Additional Data
${JSON.stringify(ctx.extra.slice(0, 3), null, 2)}

## Form Type: ${formType.replace(/_/g, ' ').toUpperCase()}

## Fields to Fill
${fields.map(f => `- ${f}`).join('\n')}

## Instructions
1. Fill EVERY field you can determine from the data above.
2. For sequential numbers (rfi_number, po_number, co_number, etc.): look at existing records and provide the next number.
3. For dates: use today's date (${new Date().toISOString().split('T')[0]}) as the base. SLA dates = today + reasonable business days for this type of form.
4. For names/parties: pull from project contacts — NEVER invent people not in the data.
5. Confidence levels: 'high' = you know the exact value, 'medium' = likely correct but verify, 'low' = estimated/assumed.
6. missingFields = fields that CANNOT be filled from available data (user must provide).
7. warnings = any red flags (e.g., "No architect contact on file — cannot fill architect fields").
8. suggestions = 1-3 practical tips specific to this form and project.

Return ONLY valid JSON with this exact structure:
{
  "fields": { "field_name": "value or null" },
  "confidence": { "field_name": "high|medium|low" },
  "missingFields": ["field_name"],
  "warnings": ["warning text"],
  "suggestions": ["suggestion text"]
}
`.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Main prefill function
// ─────────────────────────────────────────────────────────────────────────────

export async function prefillForm(opts: {
  tenantId: string;
  projectId: string;
  formType: FormType;
  context?: Record<string, unknown>;  // extra user-provided context (e.g., description they typed)
  entityId?: string;                   // if editing an existing record
}): Promise<AutoFillResult> {
  const now = new Date().toISOString();

  // Fetch all project context
  const ctx = await fetchContext(opts.tenantId, opts.projectId, opts.formType, opts.context);

  if (!ctx.project) {
    return {
      fields: {}, confidence: {}, filledCount: 0,
      totalFields: FORM_FIELDS[opts.formType].length,
      fillPct: 0,
      missingFields: FORM_FIELDS[opts.formType],
      warnings: ['Project not found or access denied'],
      suggestions: [],
      contextSources: [],
    };
  }

  // Build and call Claude
  const prompt = buildPrompt(ctx, opts.formType);

  let aiResult: {
    fields: Record<string, unknown>;
    confidence: Record<string, string>;
    missingFields: string[];
    warnings: string[];
    suggestions: string[];
  } = {
    fields: {}, confidence: {}, missingFields: FORM_FIELDS[opts.formType], warnings: [], suggestions: [],
  };

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 2048,
      system: 'You are a construction project management AI. Return ONLY valid JSON. No markdown, no explanation, no code blocks.',
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    if (textBlock && textBlock.type === 'text') {
      const parsed = JSON.parse(textBlock.text.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim());
      aiResult = parsed;
    }
  } catch (err) {
    console.error('[AutoPopulator] Claude error:', err instanceof Error ? err.message : err);
    // Fall back to rule-based filling
    aiResult = ruleBasedFill(opts.formType, ctx);
  }

  // Count filled fields
  const filledCount = Object.values(aiResult.fields).filter(v => v !== null && v !== '' && v !== undefined).length;
  const totalFields = FORM_FIELDS[opts.formType].length;

  // Log for analytics
  await supabaseAdmin.from('form_autofill_log').insert({
    tenant_id:       opts.tenantId,
    project_id:      opts.projectId,
    form_type:       opts.formType,
    entity_id:       opts.entityId ?? null,
    fields_available: totalFields,
    fields_filled:   filledCount,
    ai_model:        'claude-opus-4-6',
    context_sources: ['project', 'contacts', ...Object.keys(ctx.userProvided ?? {})],
    created_at:      now,
  }).then(() => null);

  return {
    fields:        aiResult.fields,
    confidence:    aiResult.confidence as Record<string, 'high' | 'medium' | 'low'>,
    filledCount,
    totalFields,
    fillPct:       totalFields > 0 ? Math.round((filledCount / totalFields) * 100) : 0,
    missingFields: aiResult.missingFields ?? [],
    warnings:      aiResult.warnings ?? [],
    suggestions:   aiResult.suggestions ?? [],
    contextSources: ['project', 'contacts', opts.formType],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Rule-based fallback (used when Claude is unavailable)
// ─────────────────────────────────────────────────────────────────────────────

function ruleBasedFill(
  formType: FormType,
  ctx: Awaited<ReturnType<typeof fetchContext>>,
): typeof aiResult {
  const project  = ctx.project ?? {};
  const contacts = ctx.contacts;
  const owner    = contacts.find(c => c.contact_type === 'owner');
  const today    = new Date().toISOString().split('T')[0];

  const aiResult = {
    fields:        {} as Record<string, unknown>,
    confidence:    {} as Record<string, string>,
    missingFields: [] as string[],
    warnings:      [] as string[],
    suggestions:   [] as string[],
  };

  // Common fields for all forms
  const common = {
    project_name:    { v: project.name, c: 'high' },
    project_address: { v: project.address ?? project.location, c: 'high' },
    owner_name:      { v: owner?.company_name ?? owner?.contact_name, c: owner ? 'high' : 'low' },
    log_date:        { v: today, c: 'high' },
    incident_date:   { v: today, c: 'high' },
    scheduled_date:  { v: today, c: 'medium' },
    period_from:     { v: today, c: 'medium' },
    period_to:       { v: today, c: 'medium' },
  };

  const formSpecific: Record<FormType, Record<string, {v: unknown; c: string}>> = {
    rfi: {
      priority:     { v: 'normal', c: 'medium' },
      assigned_to:  { v: (owner?.contact_name ?? owner?.email) as string, c: 'low' },
      due_date:     { v: new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0], c: 'medium' },
    },
    change_order: {
      co_number:    { v: 'CO-001', c: 'low' },
    },
    pay_application: {
      project_name:  { v: project.name, c: 'high' },
      owner_name:    { v: owner?.company_name ?? '', c: 'high' },
      retainage_pct: { v: 10, c: 'medium' },
    },
    lien_waiver: {
      project_address: { v: project.address, c: 'high' },
      owner_name:      { v: owner?.company_name ?? '', c: 'high' },
      through_date:    { v: today, c: 'medium' },
      waiver_type:     { v: 'conditional_partial', c: 'medium' },
    },
    daily_log: {
      log_date:        { v: today, c: 'high' },
      weather:         { v: 'Clear', c: 'low' },
    },
    safety_incident: {
      incident_date:   { v: `${today}T08:00:00`, c: 'medium' },
      severity:        { v: 'medium', c: 'medium' },
      osha_reportable: { v: false, c: 'medium' },
    },
    punch_list_item: { priority: { v: 'normal', c: 'medium' } },
    inspection:      { scheduled_date: { v: today, c: 'medium' } },
    contract: {
      retainage_percent:  { v: 10, c: 'high' },
      lien_waiver_required: { v: true, c: 'high' },
    },
    budget_line:      {},
    purchase_order:   { po_number: { v: 'PO-001', c: 'low' } },
    bid_invitation:   {},
    closeout_item:    { required: { v: true, c: 'medium' } },
    vendor_compliance: { gl_limit: { v: 2000000, c: 'medium' } },
  };

  const allFields = { ...common, ...(formSpecific[formType] ?? {}) };
  for (const [key, { v, c }] of Object.entries(allFields)) {
    if (v !== null && v !== undefined && v !== '') {
      aiResult.fields[key]     = v;
      aiResult.confidence[key] = c;
    }
  }

  return aiResult;
}

// ─────────────────────────────────────────────────────────────────────────────
// Batch prefill — useful for loading a whole form set at once
// ─────────────────────────────────────────────────────────────────────────────

export async function prefillMultipleForms(opts: {
  tenantId:  string;
  projectId: string;
  forms:     { formType: FormType; context?: Record<string, unknown> }[];
}): Promise<Record<string, AutoFillResult>> {
  const results: Record<string, AutoFillResult> = {};

  // Prefill forms in parallel (max 3 at a time)
  const BATCH = 3;
  for (let i = 0; i < opts.forms.length; i += BATCH) {
    const batch = opts.forms.slice(i, i + BATCH);
    const settled = await Promise.allSettled(
      batch.map(f =>
        prefillForm({ tenantId: opts.tenantId, projectId: opts.projectId, formType: f.formType, context: f.context })
          .then(result => ({ formType: f.formType, result }))
      )
    );

    for (const outcome of settled) {
      if (outcome.status === 'fulfilled') {
        results[outcome.value.formType] = outcome.value.result;
      }
    }
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// API route handler — POST /api/ai/prefill
// ─────────────────────────────────────────────────────────────────────────────




export const AutoPopulator = {
  prefillForm,
  prefillMultipleForms,
};
