/**
 * lib/bid-document-engine.ts
 * Enterprise bid document generation engine for Saguaro CRM.
 * Loads live project data + takeoff quantities + trade expertise
 * and produces complete professional construction bid documents via Claude API.
 */
import { SupabaseClient } from '@supabase/supabase-js'

// ─── TYPE DEFINITIONS ────────────────────────────────────────────

export interface BidDocumentContext {
  package: Record<string, unknown>
  project: Record<string, unknown>
  tenant: Record<string, unknown>
  pmProfile: { id: string; full_name: string | null; email: string | null; phone: string | null; title: string | null }
  lineItems: Array<Record<string, unknown>>
  drawings: Array<Record<string, unknown>>
  wageRates: Array<{ trade: string; base_rate: number; fringe: number; total_package: number; source: string }>
}

export interface GeneratedBidDocuments {
  scope_narrative: string
  bid_instructions: string
  work_included: string[]
  work_excluded: string[]
  coordination_notes: string
  quality_standards: string
  special_requirements: string
  sub_qualification_criteria: string[]
  sub_prequalification_questions: string[]
  sub_bid_variables: string[]
  sub_market_note: string
  ai_model_used: string
  generation_timestamp: string
}

// ─── LOAD COMPLETE BID DOCUMENT CONTEXT ──────────────────────────

export async function loadBidDocumentContext(
  supabase: SupabaseClient,
  packageId: string,
  tenantId: string
): Promise<BidDocumentContext | null> {
  // Load bid package
  const { data: pkg, error: pkgErr } = await supabase
    .from('bid_packages')
    .select('*')
    .eq('id', packageId)
    .eq('tenant_id', tenantId)
    .single()

  if (pkgErr || !pkg) {
    console.error('[bid-document-engine] package not found:', pkgErr?.message)
    return null
  }

  const p = pkg as Record<string, unknown>

  // Load project with all fields needed for documents
  const { data: project } = await supabase
    .from('projects')
    .select(`
      id, name, address, city, state, zip, project_number,
      project_type, type, owner_name, owner_entity, owner_address,
      architect_name, architect, architect_email,
      gc_name, gc_entity, gc_address, gc_license_number,
      pm_name, pm_email, pm_phone,
      prevailing_wage, is_public_project,
      liquidated_damages, liquidated_damages_per,
      work_hours_start, work_hours_end,
      retainage_pct, performance_bond_required, payment_bond_required,
      bond_amount, insurance_required, contract_amount,
      certified_payroll_required, county
    `)
    .eq('id', p.project_id as string)
    .eq('tenant_id', tenantId)
    .single()

  // Load tenant for GC branding
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, name, slug, logo_url, primary_color, owner_email')
    .eq('id', tenantId)
    .single()

  // Load PM profile (the user who created or is managing this package)
  const createdBy = p.created_by as string | undefined
  let pmProfile: BidDocumentContext['pmProfile'] = { id: '', full_name: null, email: null, phone: null, title: null }

  if (createdBy) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone, title')
      .eq('id', createdBy)
      .single()
    if (profile) pmProfile = profile as BidDocumentContext['pmProfile']
  }

  // Load line items from bid_package_items
  const { data: items } = await supabase
    .from('bid_package_items')
    .select('*')
    .eq('bid_package_id', packageId)
    .eq('tenant_id', tenantId)
    .order('sort_order')

  // If takeoff linked, load line items from takeoff_line_items table
  let takeoffItems: Record<string, unknown>[] = []
  const takeoffId = p.takeoff_id as string | null
  if (takeoffId) {
    const { data: tItems } = await supabase
      .from('takeoff_line_items')
      .select('id, description, quantity, unit, unit_material_cost, unit_labor_cost, csi_division, csi_code, sheet_number')
      .eq('takeoff_id', takeoffId)
      .eq('tenant_id', tenantId)
      .eq('is_excluded', false)
      .order('csi_division')
      .order('sort_order')

    if (tItems?.length) {
      takeoffItems = tItems.map((item: Record<string, unknown>) => ({
        id: String(item.id),
        description: String(item.description || ''),
        quantity: Number(item.quantity || 0),
        unit: String(item.unit || 'LS'),
        unit_price: Number(item.unit_material_cost || 0) + Number(item.unit_labor_cost || 0),
        total_amount: (Number(item.quantity) || 0) * (Number(item.unit_material_cost || 0) + Number(item.unit_labor_cost || 0)),
        csi_code: String(item.csi_code || item.csi_division || ''),
        category: String(item.csi_division || ''),
      }))
    }

    // Fallback: try takeoff_materials if takeoff_line_items has nothing
    if (takeoffItems.length === 0) {
      const { data: matItems } = await supabase
        .from('takeoff_materials')
        .select('id, description, csi_name, quantity, unit, unit_cost, total_cost, csi_code')
        .eq('takeoff_id', takeoffId)
        .order('sort_order')

      if (matItems?.length) {
        takeoffItems = matItems.map((item: Record<string, unknown>) => ({
          id: String(item.id),
          description: String(item.description || item.csi_name || ''),
          quantity: Number(item.quantity || 0),
          unit: String(item.unit || 'EA'),
          unit_price: Number(item.unit_cost || 0),
          total_amount: Number(item.total_cost || 0),
          csi_code: String(item.csi_code || ''),
        }))
      }
    }
  }

  const allLineItems = [...(items || []), ...takeoffItems] as Array<Record<string, unknown>>

  // Load drawings filtered by trade discipline
  const { data: allDrawings } = await supabase
    .from('drawings')
    .select('sheet_number, name, discipline, version, revision_date')
    .eq('project_id', p.project_id as string)
    .eq('tenant_id', tenantId)
    .order('sheet_number')

  const tradeLower = (String(p.trade || '')).toLowerCase()
  const drawings = (allDrawings || []).filter((d: Record<string, unknown>) => {
    if (!tradeLower) return true
    const disc = String(d.discipline || '').toLowerCase()
    return disc.includes(tradeLower) || tradeLower.includes(disc) ||
      disc.includes('general') || disc.includes('civil') || disc.includes('arch') ||
      disc === 'g' || disc === 'a' || disc === 'c'
  })

  // Load prevailing wage rates if applicable
  const needsWage = p.requires_prevailing_wage || p.is_public_project ||
    (project as Record<string, unknown>)?.prevailing_wage ||
    (project as Record<string, unknown>)?.is_public_project
  let wageRates: BidDocumentContext['wageRates'] = []

  if (needsWage && (project as Record<string, unknown>)?.state) {
    const stateCode = String((project as Record<string, unknown>).state).toUpperCase().substring(0, 2)
    const { data: rates } = await supabase
      .from('prevailing_wage_rates')
      .select('trade, base_rate, fringe, total_package, source')
      .eq('state', stateCode)
      .order('trade')

    wageRates = (rates || []).map((r: Record<string, unknown>) => ({
      trade: String(r.trade),
      base_rate: Number(r.base_rate),
      fringe: Number(r.fringe),
      total_package: Number(r.total_package),
      source: String(r.source || 'DOL'),
    }))
  }

  return {
    package: p,
    project: (project || {}) as Record<string, unknown>,
    tenant: (tenant || { id: tenantId, name: 'General Contractor' }) as Record<string, unknown>,
    pmProfile,
    lineItems: allLineItems,
    drawings: drawings as Array<Record<string, unknown>>,
    wageRates,
  }
}

// ─── SAGE AI DOCUMENT GENERATION ─────────────────────────────────

export async function generateAllBidDocuments(
  ctx: BidDocumentContext,
  anthropicApiKey: string
): Promise<GeneratedBidDocuments> {
  const pkg = ctx.package
  const project = ctx.project
  const tenant = ctx.tenant
  const pm = ctx.pmProfile

  const gcCompany = String(tenant.name || project.gc_entity || project.gc_name || 'General Contractor')
  const packageName = String(pkg.name || 'Bid Package')
  const trade = String(pkg.trade || packageName)
  const csiRef = String(pkg.csi_division || '') || ((pkg.csi_codes as string[]) || []).join(', ')
  const estimatedValue = Number(pkg.estimated_value || pkg.budget_estimate || 0)
  const projectLocation = [project.city, project.state].filter(Boolean).join(', ')
  const projectType = String(project.project_type || project.type || 'Commercial Construction')
  const state = String(project.state || 'the project state')
  const validityDays = Number(pkg.bid_validity_days || 60)
  const pmName = pm.full_name || String(project.pm_name || 'Project Manager')
  const pmEmail = pm.email || String(project.pm_email || '')
  const pmPhone = pm.phone || String(project.pm_phone || '')
  const requiresBond = !!(pkg.requires_bond || pkg.bond_required)

  // Build line items summary for AI context
  const lineItemsSummary = ctx.lineItems.length > 0
    ? ctx.lineItems.map(item =>
        `- ${item.description}: ${item.quantity ? item.quantity + ' ' + (item.unit || item.uom || 'LS') : 'LS'}`
        + (Number(item.total_amount || item.total_cost || 0) > 0
          ? ` -- Est. $${Number(item.total_amount || item.total_cost).toLocaleString()}` : '')
      ).join('\n')
    : ''

  // Determine trade-specific code references
  const tradeLower = trade.toLowerCase()
  let tradeCodeBlock = '- IBC 2021 (International Building Code)\n- OSHA 29 CFR 1926 (Construction Safety)'
  if (tradeLower.includes('electric')) {
    tradeCodeBlock = '- NEC 2023 (National Electrical Code)\n- NFPA 70E (Electrical Safety)\n- IEEE standards\n- State electrical code amendments\n' + tradeCodeBlock
  } else if (tradeLower.includes('plumb')) {
    tradeCodeBlock = '- UPC 2021 (Uniform Plumbing Code)\n- IPC 2021 (International Plumbing Code)\n- IAPMO standards\n' + tradeCodeBlock
  } else if (tradeLower.includes('hvac') || tradeLower.includes('mechanical')) {
    tradeCodeBlock = '- IMC 2021 (International Mechanical Code)\n- ASHRAE 62.1 (Ventilation)\n- ASHRAE 90.1 (Energy)\n- SMACNA (Duct Construction)\n- NFPA 90A/90B\n' + tradeCodeBlock
  } else if (tradeLower.includes('fire') || tradeLower.includes('sprinkler')) {
    tradeCodeBlock = '- NFPA 13 (Fire Sprinkler)\n- NFPA 72 (Fire Alarm)\n- NFPA 101 (Life Safety)\n' + tradeCodeBlock
  } else if (tradeLower.includes('concrete') || tradeLower.includes('struct')) {
    tradeCodeBlock = '- ACI 318 (Structural Concrete)\n- ASTM standards\n- AWS D1.1 (Welding)\n' + tradeCodeBlock
  } else if (tradeLower.includes('roof')) {
    tradeCodeBlock = '- NRCA Roofing Manual\n- ASTM roofing standards\n- Manufacturer specifications\n' + tradeCodeBlock
  }
  tradeCodeBlock += `\n- State-specific amendments for ${state}`

  const dueDateFormatted = pkg.bid_due_date
    ? new Date(String(pkg.bid_due_date)).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : 'TBD'

  const megaPrompt = `You are a Fortune 500 construction company's Chief Procurement Officer with 25 years of GC experience.

Generate a COMPLETE BID PACKAGE for a licensed subcontractor. This is a real legal document. Every word must be professional, specific, and legally appropriate.

PROJECT INFORMATION (LIVE DATA):
GC Company: ${gcCompany}
Project: ${String(project.name || 'Construction Project')}
Project Number: ${String(project.project_number || 'TBD')}
Address: ${[project.address, project.city, project.state, project.zip].filter(Boolean).join(', ')}
Type: ${projectType}
Owner: ${String(project.owner_name || 'See Contract Documents')}
Architect: ${String(project.architect_name || project.architect || 'See Contract Documents')}
State: ${state}
Prevailing Wage: ${ctx.wageRates.length > 0 ? 'YES' : 'NO'}

BID PACKAGE DETAILS (LIVE DATA):
Package: ${packageName}
Trade: ${trade}
CSI Division: ${csiRef || 'See scope'}
Estimated Value: ${estimatedValue > 0 ? '$' + estimatedValue.toLocaleString() : 'TBD'}
Bid Due Date: ${dueDateFormatted}
Bid Validity: ${validityDays} calendar days
Bond Required: ${requiresBond ? 'YES - Bid Bond 5% + Performance/Payment Bond 100%' : 'NO'}
Insurance: $${Number(pkg.insurance_required_amount || 1000000).toLocaleString()} per occurrence minimum
PM: ${pmName} | ${pmEmail} | ${pmPhone}

${lineItemsSummary ? `TAKEOFF LINE ITEMS (USE THESE QUANTITIES IN SCOPE):\n${lineItemsSummary}` : ''}

APPLICABLE CODES AND STANDARDS:
${tradeCodeBlock}

Respond with ONLY valid JSON matching this structure. No markdown fences. No preamble.

{
  "scope_narrative": "Complete multi-paragraph scope of work narrative. 400+ words. Reference actual quantities where provided. Start with scope summary, then detail all work.",
  "work_included": ["10+ specific items for this trade and project"],
  "work_excluded": ["6+ specific exclusions that protect GC from scope creep"],
  "coordination_notes": "Detailed paragraph on coordination with other trades by name.",
  "quality_standards": "Paragraph listing all applicable codes, testing requirements, QC procedures.",
  "special_requirements": "Paragraph on project-specific conditions, phasing, owner requirements.",
  "bid_instructions": "Complete 8-section instructions to bidders: (1) Submission deadline ${dueDateFormatted}, (2) Questions/RFIs to ${pmName} at ${pmEmail}, (3) Bond ${requiresBond ? '5% bid bond required' : 'no bond required'}, (4) Validity ${validityDays} days, (5) Site visit via ${pmName} at ${pmPhone || pmEmail}, (6) License for ${state}, (7) Insurance summary, (8) Owner rights.",
  "sub_qualification_criteria": ["6-8 qualification criteria for this trade"],
  "sub_prequalification_questions": ["6 vetting questions a GC would ask"],
  "sub_bid_variables": ["5-6 scope items that typically vary between sub bids"],
  "sub_market_note": "2-3 sentences on current market for this trade in ${state}."
}`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system: 'You are a senior construction procurement expert. Respond with valid JSON only. No markdown, no preamble.',
      messages: [{ role: 'user', content: megaPrompt }],
    }),
  })

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json() as { content?: Array<{ text: string }> }
  const rawText = data.content?.[0]?.text || '{}'

  // Parse JSON response — strip any markdown fences if present
  const cleaned = rawText.replace(/^```json?\s*/m, '').replace(/\s*```$/m, '').trim()

  let generated: Partial<GeneratedBidDocuments>
  try {
    generated = JSON.parse(cleaned)
  } catch {
    console.error('[bid-document-engine] Failed to parse AI JSON:', rawText.substring(0, 300))
    throw new Error('AI response was not valid JSON')
  }

  return {
    scope_narrative: generated.scope_narrative || '',
    bid_instructions: generated.bid_instructions || '',
    work_included: generated.work_included || [],
    work_excluded: generated.work_excluded || [],
    coordination_notes: generated.coordination_notes || '',
    quality_standards: generated.quality_standards || '',
    special_requirements: generated.special_requirements || '',
    sub_qualification_criteria: generated.sub_qualification_criteria || [],
    sub_prequalification_questions: generated.sub_prequalification_questions || [],
    sub_bid_variables: generated.sub_bid_variables || [],
    sub_market_note: generated.sub_market_note || '',
    ai_model_used: 'claude-sonnet-4-20250514',
    generation_timestamp: new Date().toISOString(),
  }
}

// ─── SAVE GENERATED DOCUMENTS TO DB ──────────────────────────────

export async function saveGeneratedDocuments(
  supabase: SupabaseClient,
  packageId: string,
  tenantId: string,
  docs: GeneratedBidDocuments
): Promise<void> {
  const { error } = await supabase
    .from('bid_packages')
    .update({
      scope_narrative: docs.scope_narrative,
      bid_instructions: docs.bid_instructions,
      work_included: docs.work_included,
      work_excluded: docs.work_excluded,
      coordination_notes: docs.coordination_notes,
      quality_standards: docs.quality_standards,
      special_requirements: docs.special_requirements,
      sub_qualification_criteria: docs.sub_qualification_criteria,
      sub_prequalification_questions: docs.sub_prequalification_questions,
      sub_bid_variables: docs.sub_bid_variables,
      sub_market_note: docs.sub_market_note,
      ai_generated: true,
      ai_generated_at: docs.generation_timestamp,
      ai_model_used: docs.ai_model_used,
    })
    .eq('id', packageId)
    .eq('tenant_id', tenantId)

  if (error) {
    throw new Error(`Failed to save generated documents: ${error.message}`)
  }
}

// ─── FULL AUTO-FILL PIPELINE ──────────────────────────────────────

export async function autoFillBidPackage(
  supabase: SupabaseClient,
  packageId: string,
  tenantId: string,
  anthropicApiKey: string
): Promise<{ success: boolean; documents?: GeneratedBidDocuments; error?: string }> {
  try {
    const ctx = await loadBidDocumentContext(supabase, packageId, tenantId)
    if (!ctx) return { success: false, error: 'Bid package not found' }

    const docs = await generateAllBidDocuments(ctx, anthropicApiKey)
    await saveGeneratedDocuments(supabase, packageId, tenantId, docs)

    return { success: true, documents: docs }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    console.error('[bid-document-engine] autoFillBidPackage error:', message)
    return { success: false, error: message }
  }
}
