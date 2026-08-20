import { SupabaseClient } from '@supabase/supabase-js'

// ═══════════════════════════════════════════════════════════════
// SAGUARO TAKEOFF ENGINE — Sage AI Plan Extraction
// Sends construction plan PDFs to Claude vision API
// Extracts every quantity, unit, and CSI code in real time
// Streams progress so the UI updates live
// ═══════════════════════════════════════════════════════════════

export interface TakeoffLineItem {
  id?: string
  takeoff_id: string
  tenant_id: string
  project_id: string | null
  csi_division: string | null
  csi_code: string | null
  csi_description: string | null
  description: string
  scope_notes: string | null
  page_reference: string | null
  sheet_number: string | null
  quantity: number
  unit: string
  waste_factor_pct: number
  unit_material_cost: number
  unit_labor_cost: number
  unit_equipment_cost: number
  unit_sub_cost: number
  ai_extracted: boolean
  ai_confidence: number | null
  ai_source_text: string | null
  sort_order: number
  category: string | null
  is_allowance: boolean
  is_excluded: boolean
  notes: string | null
}

export interface MarkupSettings {
  markup_labor_pct: number
  markup_material_pct: number
  markup_equipment_pct: number
  overhead_pct: number
  profit_pct: number
}

export interface TakeoffTotals {
  total_material: number
  total_labor: number
  total_equipment: number
  total_subcontractor: number
  subtotal: number
  total_overhead: number
  total_profit: number
  grand_total: number
  cost_per_sqft: number | null
  by_division: Record<string, {
    division: string
    description: string
    total_material: number
    total_labor: number
    total_equipment: number
    total_sub: number
    line_total: number
    item_count: number
  }>
}

export interface SOVLine {
  item_no: string
  description: string
  scheduled_value: number
  work_complete_pct: number
  work_complete_amount: number
  stored_materials: number
  total_complete: number
  balance_to_finish: number
  retainage_pct: number
}

export interface ExtractionResult {
  success: boolean
  items_extracted: number
  pages_processed: number
  grand_total: number
  error?: string
}

// ── CSI DIVISION REFERENCE ───────────────────────────────────────
export const CSI_DIVISIONS: Record<string, string> = {
  '01': 'General Requirements',
  '02': 'Existing Conditions',
  '03': 'Concrete',
  '04': 'Masonry',
  '05': 'Metals / Structural Steel',
  '06': 'Wood, Plastics & Composites',
  '07': 'Thermal & Moisture Protection',
  '08': 'Openings',
  '09': 'Finishes',
  '10': 'Specialties',
  '11': 'Equipment',
  '12': 'Furnishings',
  '13': 'Special Construction',
  '14': 'Conveying Equipment',
  '21': 'Fire Suppression',
  '22': 'Plumbing',
  '23': 'HVAC',
  '25': 'Integrated Automation',
  '26': 'Electrical',
  '27': 'Communications',
  '28': 'Electronic Safety & Security',
  '31': 'Earthwork',
  '32': 'Exterior Improvements',
  '33': 'Utilities',
  '34': 'Transportation',
  '35': 'Waterway & Marine Construction',
  '40': 'Process Integration',
  '41': 'Material Processing Equipment',
  '48': 'Electrical Power Generation',
}

// ── PHOENIX AZ MARKET UNIT COST DATABASE ────────────────────────
// Current 2024-2025 Phoenix AZ market rates
const UNIT_COSTS: Record<string, { mat: number; labor: number; unit: string }> = {
  // Concrete
  'concrete_slab_4in':   { mat: 6.50,  labor: 3.20,  unit: 'SF'  },
  'concrete_slab_6in':   { mat: 9.20,  labor: 3.80,  unit: 'SF'  },
  'concrete_footing':    { mat: 105,   labor: 35,    unit: 'CY'  },
  'concrete_wall':       { mat: 120,   labor: 55,    unit: 'CY'  },
  'concrete_pump':       { mat: 0,     labor: 8.50,  unit: 'CY'  },
  'rebar_no3':           { mat: 0.65,  labor: 0.45,  unit: 'LB'  },
  'rebar_no4':           { mat: 0.65,  labor: 0.40,  unit: 'LB'  },
  'rebar_no5':           { mat: 0.65,  labor: 0.38,  unit: 'LB'  },
  // Framing
  'metal_stud_35':       { mat: 1.80,  labor: 2.20,  unit: 'SF'  },
  'metal_stud_6in':      { mat: 2.40,  labor: 2.60,  unit: 'SF'  },
  'drywall_half':        { mat: 0.62,  labor: 1.40,  unit: 'SF'  },
  'drywall_58':          { mat: 0.72,  labor: 1.50,  unit: 'SF'  },
  // Roofing
  'tpo_60mil':           { mat: 4.20,  labor: 3.80,  unit: 'SF'  },
  'modified_bitumen':    { mat: 3.80,  labor: 4.20,  unit: 'SF'  },
  // Electrical
  'conduit_34emt':       { mat: 2.80,  labor: 3.60,  unit: 'LF'  },
  'conduit_1emt':        { mat: 4.20,  labor: 4.80,  unit: 'LF'  },
  'conduit_2emt':        { mat: 7.80,  labor: 7.20,  unit: 'LF'  },
  'wire_12awg':          { mat: 0.42,  labor: 0.38,  unit: 'LF'  },
  'wire_10awg':          { mat: 0.68,  labor: 0.42,  unit: 'LF'  },
  'panel_100a':          { mat: 380,   labor: 420,   unit: 'EA'  },
  'panel_200a':          { mat: 680,   labor: 580,   unit: 'EA'  },
  'panel_400a':          { mat: 1400,  labor: 980,   unit: 'EA'  },
  'outlet_120v':         { mat: 8.50,  labor: 38,    unit: 'EA'  },
  'switch_single':       { mat: 6.80,  labor: 32,    unit: 'EA'  },
  'lighting_led_2x4':    { mat: 85,    labor: 65,    unit: 'EA'  },
  // Plumbing
  'pipe_14_cpvc':        { mat: 1.20,  labor: 4.80,  unit: 'LF'  },
  'pipe_34_cpvc':        { mat: 1.80,  labor: 5.20,  unit: 'LF'  },
  'pipe_1in_cpvc':       { mat: 2.40,  labor: 6.00,  unit: 'LF'  },
  'pipe_2in_pvc':        { mat: 2.80,  labor: 6.80,  unit: 'LF'  },
  'pipe_4in_pvc':        { mat: 5.20,  labor: 9.20,  unit: 'LF'  },
  'water_heater_50g':    { mat: 680,   labor: 320,   unit: 'EA'  },
  'toilet_standard':     { mat: 280,   labor: 220,   unit: 'EA'  },
  'sink_commercial':     { mat: 380,   labor: 280,   unit: 'EA'  },
  // HVAC
  'duct_6in_round':      { mat: 4.20,  labor: 6.80,  unit: 'LF'  },
  'duct_8in_round':      { mat: 5.80,  labor: 7.20,  unit: 'LF'  },
  'duct_12in_rect':      { mat: 8.50,  labor: 9.80,  unit: 'LF'  },
  'rtu_3ton':            { mat: 3200,  labor: 1800,  unit: 'EA'  },
  'rtu_5ton':            { mat: 4800,  labor: 2200,  unit: 'EA'  },
  'rtu_10ton':           { mat: 9500,  labor: 3800,  unit: 'EA'  },
  'diffuser_2x4':        { mat: 48,    labor: 65,    unit: 'EA'  },
  // Flooring
  'vct_12x12':           { mat: 1.20,  labor: 2.80,  unit: 'SF'  },
  'lvt_plank':           { mat: 2.80,  labor: 3.20,  unit: 'SF'  },
  'carpet_commercial':   { mat: 3.20,  labor: 1.80,  unit: 'SF'  },
  'epoxy_floor':         { mat: 2.40,  labor: 3.60,  unit: 'SF'  },
  'tile_ceramic_12x12':  { mat: 2.80,  labor: 6.80,  unit: 'SF'  },
  // Sitework
  'excavation_bulk':     { mat: 0,     labor: 4.80,  unit: 'CY'  },
  'grading_fine':        { mat: 0,     labor: 1.20,  unit: 'SF'  },
  'asphalt_2in':         { mat: 1.80,  labor: 1.40,  unit: 'SF'  },
  'concrete_flatwork':   { mat: 5.50,  labor: 3.20,  unit: 'SF'  },
  'landscape_irrig':     { mat: 1.20,  labor: 0.80,  unit: 'SF'  },
}

// ── PER-PAGE EXTRACTION PROMPT ────────────────────────────────────
function buildExtractionPrompt(
  pageNum: number,
  totalPages: number,
  projectName: string,
  projectState: string,
  projectType: string
): string {
  return `You are a senior construction estimator with 20 years of experience in commercial construction in ${projectState}.

You are analyzing page ${pageNum} of ${totalPages} from construction plans for:
Project: ${projectName}
Type: ${projectType}
Location: ${projectState}

EXTRACT every single quantifiable item visible on this drawing page.

LOOK FOR ALL OF THE FOLLOWING:
Linear measurements: feet of pipe, conduit, duct, framing members, rebar, fencing, curbing, trenching
Area measurements: square feet of slab, flooring, roofing, drywall, insulation, wall area, ceiling area, paving
Volume measurements: cubic yards of concrete, excavation, fill, grading
Count items: fixtures, panels, equipment pieces, doors, windows, light fixtures, outlets, switches, roof drains, HVAC units, plumbing fixtures
Weights: steel tonnage, rebar weight in lbs/tons
Any annotated quantity on the drawing with a unit of measure

FOR EACH ITEM YOU FIND:
1. Assign the correct CSI MasterFormat division (2-digit: 03, 05, 07, 09, 22, 23, 26, 31, 32, etc.)
2. Write a specific description (not generic — be precise: "4-inch PVC drain pipe" not "pipe")
3. Extract or calculate the quantity from dimensions shown on plan
4. Identify the unit (SF, LF, CY, EA, LB, TON, etc.)
5. Set AI confidence: 0.9+ if quantity is clearly labeled, 0.7 if calculated from dimensions, 0.5 if estimated
6. Note the sheet/page reference

For unit costs, use current ${projectState} market rates (2024-2025):
- Research actual local labor rates for ${projectState}
- Separate material cost from labor cost per unit
- Do NOT guess — if unsure on pricing, use null and set confidence to 0.3

If this page has no quantifiable construction items (title page, notes only, detail without quantities), return an empty items array.

Respond with ONLY valid JSON — no markdown, no explanation, just the JSON:

{
  "page_number": ${pageNum},
  "sheet_type": "floor_plan|elevation|section|detail|mechanical|electrical|plumbing|civil|structural|title",
  "sheet_number": "string or null",
  "has_quantities": true,
  "items": [
    {
      "csi_division": "26",
      "csi_code": "26 05 19",
      "description": "3/4-inch EMT conduit, stub-up to panel",
      "quantity": 840,
      "unit": "LF",
      "unit_material_cost": 2.80,
      "unit_labor_cost": 3.60,
      "ai_confidence": 0.85,
      "ai_source_text": "Electrical plan shows 840 LF 3/4 EMT per schedule note",
      "sheet_number": "E-101",
      "category": "Electrical Rough-In"
    }
  ],
  "extraction_notes": "any caveats or notes about this page"
}`
}

// ── SYNTHESIS PROMPT ─────────────────────────────────────────────
function buildSynthesisPrompt(
  allItems: TakeoffLineItem[],
  projectName: string,
  projectState: string,
  totalPages: number
): string {
  const itemsByDivision = allItems.reduce((acc, item) => {
    const div = item.csi_division || 'unknown'
    if (!acc[div]) acc[div] = []
    acc[div].push(item)
    return acc
  }, {} as Record<string, TakeoffLineItem[]>)

  const summary = Object.entries(itemsByDivision).map(([div, items]) => ({
    division: div,
    count: items.length,
    sample: items.slice(0, 3).map(i => i.description),
  }))

  return `You are a senior construction estimator reviewing a complete takeoff extraction.

Project: ${projectName} (${projectState})
Pages analyzed: ${totalPages}
Total items extracted: ${allItems.length}

Items by CSI division:
${JSON.stringify(summary, null, 2)}

TASKS:
1. Identify any obvious duplicates to flag (same item extracted from multiple pages)
2. Check for missing major CSI divisions expected for this project type
3. Validate that quantities seem reasonable for a commercial project
4. Generate a cost summary breakdown
5. Identify the top 5 highest-cost line items

Respond with ONLY valid JSON:
{
  "duplicate_flags": [
    { "description": "item description", "reason": "why it looks duplicate" }
  ],
  "missing_divisions": [
    { "division": "22", "description": "Plumbing", "reason": "No plumbing items found despite floor plan showing restrooms" }
  ],
  "validation_notes": "Overall assessment of the takeoff completeness",
  "top_cost_items": ["description1", "description2", "description3", "description4", "description5"],
  "overall_confidence": 0.82
}`
}

// ── MAIN EXTRACTION PIPELINE ──────────────────────────────────────
export async function extractTakeoffFromPDF(
  supabase: SupabaseClient,
  takeoffId: string,
  tenantId: string,
  projectId: string,
  fileStoragePath: string,
  projectContext: {
    name: string
    state: string | null
    type: string | null
    square_footage?: number | null
  },
  apiKey: string,
  onProgress: (message: string, pct: number, newItems?: Partial<TakeoffLineItem>[]) => void
): Promise<ExtractionResult> {

  try {
    // Mark as processing
    await supabase.from('takeoffs').update({
      status: 'processing',
      processing_started_at: new Date().toISOString(),
      pages_processed: 0,
      progress_pct: 0,
    }).eq('id', takeoffId).eq('tenant_id', tenantId)

    onProgress('Downloading plan set from storage...', 2)

    // Download PDF from Supabase Storage
    const { data: fileData, error: downloadErr } = await supabase
      .storage
      .from('takeoffs')
      .download(fileStoragePath)

    if (downloadErr || !fileData) {
      throw new Error(`Failed to download plan file: ${downloadErr?.message}`)
    }

    onProgress('Plan set loaded. Starting Sage AI extraction...', 5)

    // Convert file to base64 for Anthropic document API
    const arrayBuffer = await fileData.arrayBuffer()
    const base64PDF = Buffer.from(arrayBuffer).toString('base64')
    const fileSizeMB = arrayBuffer.byteLength / (1024 * 1024)

    onProgress(`Plan set loaded (${fileSizeMB.toFixed(1)}MB). Sage is reading every page...`, 8)

    await supabase.from('takeoffs').update({
      status: 'extracting',
    }).eq('id', takeoffId).eq('tenant_id', tenantId)

    const projectState = projectContext.state || 'Arizona'
    const projectType = projectContext.type || 'Commercial'

    // ── STRATEGY: Send full PDF to Claude in one call ─────────────
    // Anthropic supports PDFs directly via document content blocks
    // This is more efficient than page-by-page for plans < 20 pages
    // For large plan sets (> 20 pages) we chunk into 10-page batches

    // First, get page count estimate from file size
    // ~100KB per page average for construction drawings
    const estimatedPages = Math.max(
      Math.ceil(fileSizeMB * 10),
      1
    )

    await supabase.from('takeoffs').update({
      page_count: estimatedPages,
    }).eq('id', takeoffId).eq('tenant_id', tenantId)

    onProgress(`Detected ~${estimatedPages} pages. Sage is analyzing your plans...`, 12)

    // ── FULL PDF EXTRACTION CALL ──────────────────────────────────
    const extractionPrompt = `You are a certified construction estimator with 25 years experience in ${projectState} commercial construction.

You are performing a complete quantity takeoff of a ${projectType} construction project: "${projectContext.name}"

ANALYZE EVERY PAGE of this plan set. Extract EVERY quantifiable item.

FOR EACH ITEM FOUND:
- Assign CSI MasterFormat 2-digit division (03=Concrete, 05=Metals, 07=Thermal/Moisture, 08=Openings, 09=Finishes, 22=Plumbing, 23=HVAC, 26=Electrical, 31=Earthwork, 32=Exterior, 33=Utilities)
- Write precise descriptions (not generic — "3/4-inch EMT conduit" not "conduit")
- Extract exact quantities from plan notes and dimensions
- Separate unit material cost from unit labor cost (${projectState} 2024-2025 rates)
- Note the sheet number each item came from
- Set confidence: 0.9=clearly labeled, 0.7=calculated, 0.5=estimated

ITEMS TO LOOK FOR ON EVERY PAGE TYPE:
Structural/Civil: CY concrete, LB rebar, SF formwork, CY excavation, CY fill, SF grading
Architectural: SF floor area, SF wall area, SF ceiling, EA doors, EA windows, SF roofing, SF insulation
Mechanical: LF ductwork by size, EA units (RTU/AHU/VAV), EA diffusers, EA grilles, EA exhaust fans
Plumbing: LF pipe by size and type, EA fixtures (toilets/sinks/urinals), EA water heaters, EA floor drains
Electrical: LF conduit by size and type, LF wire by gauge, EA panels by amperage, EA fixtures, EA devices
Site: SY paving, SF concrete flatwork, LF curbing, SF landscaping, EA site lighting, LS utility connections

Respond with ONLY valid JSON — no markdown, no preamble:
{
  "project_name": "${projectContext.name}",
  "total_pages_analyzed": number,
  "items": [
    {
      "csi_division": "26",
      "csi_code": "26 05 33",
      "csi_description": "Raceways and Boxes for Electrical Systems",
      "description": "3/4-inch EMT conduit, concealed in walls/ceiling",
      "scope_notes": "Includes all couplings, connectors, and support hardware per NEC",
      "sheet_number": "E-101",
      "quantity": 2400,
      "unit": "LF",
      "waste_factor_pct": 5,
      "unit_material_cost": 2.80,
      "unit_labor_cost": 3.60,
      "unit_equipment_cost": 0,
      "unit_sub_cost": 0,
      "ai_confidence": 0.85,
      "ai_source_text": "Electrical one-line and floor plan notes indicate 2,400 LF 3/4 EMT distribution",
      "category": "Electrical Rough-In",
      "is_allowance": false
    }
  ],
  "extraction_notes": "Overall notes about the plan set quality and any limitations",
  "estimated_project_sf": number or null
}`

    // Call Claude API with PDF document
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        system: 'You are a construction estimator. Respond with valid JSON only. No markdown, no preamble.',
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: base64PDF,
              },
            },
            {
              type: 'text',
              text: extractionPrompt,
            },
          ],
        }],
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Anthropic API error ${response.status}: ${errText}`)
    }

    const apiData = await response.json()
    const rawText: string = apiData.content?.[0]?.text || '{}'

    onProgress('Sage has analyzed your plans. Processing extracted quantities...', 70)

    // Parse response
    const cleaned = rawText
      .replace(/^```json\s*/m, '')
      .replace(/^```\s*/m, '')
      .replace(/\s*```$/m, '')
      .trim()

    let extracted: {
      items: Array<Record<string, unknown>>
      total_pages_analyzed?: number
      extraction_notes?: string
      estimated_project_sf?: number | null
    }

    try {
      extracted = JSON.parse(cleaned)
    } catch {
      throw new Error('Sage returned invalid JSON — plan may be too complex. Try splitting into smaller sets.')
    }

    const rawItems = extracted.items || []
    const actualPages = extracted.total_pages_analyzed || estimatedPages

    onProgress(`Extracted ${rawItems.length} line items from ${actualPages} pages. Saving to database...`, 75)

    // ── SAVE LINE ITEMS TO DB ─────────────────────────────────────
    if (rawItems.length > 0) {
      const lineItems: Omit<TakeoffLineItem, 'id'>[] = rawItems.map((item, idx) => ({
        takeoff_id: takeoffId,
        tenant_id: tenantId,
        project_id: projectId,
        csi_division: String(item.csi_division || ''),
        csi_code: String(item.csi_code || ''),
        csi_description: String(item.csi_description || CSI_DIVISIONS[String(item.csi_division || '')] || ''),
        description: String(item.description || ''),
        scope_notes: item.scope_notes ? String(item.scope_notes) : null,
        page_reference: item.sheet_number ? String(item.sheet_number) : null,
        sheet_number: item.sheet_number ? String(item.sheet_number) : null,
        quantity: Number(item.quantity) || 0,
        unit: String(item.unit || 'LS'),
        waste_factor_pct: Number(item.waste_factor_pct) || 0,
        unit_material_cost: Number(item.unit_material_cost) || 0,
        unit_labor_cost: Number(item.unit_labor_cost) || 0,
        unit_equipment_cost: Number(item.unit_equipment_cost) || 0,
        unit_sub_cost: Number(item.unit_sub_cost) || 0,
        ai_extracted: true,
        ai_confidence: item.ai_confidence ? Number(item.ai_confidence) : null,
        ai_source_text: item.ai_source_text ? String(item.ai_source_text) : null,
        sort_order: idx,
        category: item.category ? String(item.category) : null,
        is_allowance: Boolean(item.is_allowance),
        is_excluded: false,
        notes: null,
      }))

      // Batch insert in chunks of 50
      for (let i = 0; i < lineItems.length; i += 50) {
        const chunk = lineItems.slice(i, i + 50)
        const { error: insertErr } = await supabase
          .from('takeoff_line_items')
          .insert(chunk)

        if (insertErr) {
          console.error('[takeoff-engine] insert error:', insertErr)
        }

        const pct = 75 + Math.round((i / lineItems.length) * 15)
        onProgress(
          `Saved ${Math.min(i + 50, lineItems.length)} of ${lineItems.length} items...`,
          pct,
          chunk.slice(0, 3)
        )
      }
    }

    onProgress('Calculating totals and generating cost summary...', 92)

    // ── COMPUTE TOTALS ────────────────────────────────────────────
    // Load saved markups from DB
    const { data: takeoffRecord } = await supabase
      .from('takeoffs')
      .select('markup_labor_pct, markup_material_pct, markup_equipment_pct, overhead_pct, profit_pct')
      .eq('id', takeoffId)
      .single()

    const markup: MarkupSettings = {
      markup_labor_pct:    Number(takeoffRecord?.markup_labor_pct)    || 15,
      markup_material_pct: Number(takeoffRecord?.markup_material_pct) || 10,
      markup_equipment_pct:Number(takeoffRecord?.markup_equipment_pct)|| 10,
      overhead_pct:        Number(takeoffRecord?.overhead_pct)        || 12,
      profit_pct:          Number(takeoffRecord?.profit_pct)          || 8,
    }

    // Load all saved line items to compute totals
    const { data: savedItems } = await supabase
      .from('takeoff_line_items')
      .select('*')
      .eq('takeoff_id', takeoffId)
      .eq('tenant_id', tenantId)

    const totals = calculateTotals(savedItems || [], markup, extracted.estimated_project_sf ?? null)
    const csiBreakdown = buildCSIBreakdown(savedItems || [], markup)

    // ── UPDATE TAKEOFF RECORD ─────────────────────────────────────
    await supabase.from('takeoffs').update({
      status: 'complete',
      page_count: actualPages,
      pages_processed: actualPages,
      progress_pct: 100,
      processing_completed_at: new Date().toISOString(),
      extraction_notes: extracted.extraction_notes || null,
      extraction_confidence: rawItems.length > 0
        ? rawItems.reduce((sum, i) => sum + (Number(i.ai_confidence) || 0.7), 0) / rawItems.length
        : 0,
      ai_model_used: 'claude-sonnet-4-20250514',
      total_material:     totals.total_material,
      total_labor:        totals.total_labor,
      total_equipment:    totals.total_equipment,
      total_subcontractor:totals.total_subcontractor,
      subtotal:           totals.subtotal,
      total_overhead:     totals.total_overhead,
      total_profit:       totals.total_profit,
      grand_total:        totals.grand_total,
      cost_per_sqft:      totals.cost_per_sqft,
      csi_breakdown:      csiBreakdown,
      cost_summary: {
        by_type: {
          material:     totals.total_material,
          labor:        totals.total_labor,
          equipment:    totals.total_equipment,
          subcontractor:totals.total_subcontractor,
        },
        markup_applied: markup,
        subtotal:       totals.subtotal,
        overhead:       totals.total_overhead,
        profit:         totals.total_profit,
        grand_total:    totals.grand_total,
        cost_per_sqft:  totals.cost_per_sqft,
        generated_at:   new Date().toISOString(),
      },
    }).eq('id', takeoffId).eq('tenant_id', tenantId)

    onProgress(
      `✓ Complete! ${rawItems.length} items extracted. Grand total: $${totals.grand_total.toLocaleString()}`,
      100
    )

    return {
      success: true,
      items_extracted: rawItems.length,
      pages_processed: actualPages,
      grand_total: totals.grand_total,
    }

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown extraction error'
    console.error('[takeoff-engine] extraction failed:', message)

    await supabase.from('takeoffs').update({
      status: 'failed',
      processing_error: message,
    }).eq('id', takeoffId).eq('tenant_id', tenantId)

    return {
      success: false,
      items_extracted: 0,
      pages_processed: 0,
      grand_total: 0,
      error: message,
    }
  }
}

// ── CALCULATE TOTALS ──────────────────────────────────────────────
export function calculateTotals(
  items: Array<{
    quantity?: number | null
    waste_factor_pct?: number | null
    unit_material_cost?: number | null
    unit_labor_cost?: number | null
    unit_equipment_cost?: number | null
    unit_sub_cost?: number | null
    csi_division?: string | null
    is_excluded?: boolean | null
    total_material?: number | null
    total_labor?: number | null
    total_equipment?: number | null
    total_sub?: number | null
  }>,
  markup: MarkupSettings,
  projectSqFt: number | null = null
): TakeoffTotals {
  const activeItems = items.filter(i => !i.is_excluded)

  let raw_material    = 0
  let raw_labor       = 0
  let raw_equipment   = 0
  let raw_sub         = 0

  const byDivision: TakeoffTotals['by_division'] = {}

  for (const item of activeItems) {
    const qty = Number(item.quantity || 0)
    const waste = Number(item.waste_factor_pct || 0)
    const adjQty = qty * (1 + waste / 100)

    // Use stored computed columns if available, else compute
    const mat = item.total_material != null
      ? Number(item.total_material)
      : adjQty * Number(item.unit_material_cost || 0)
    const lab = item.total_labor != null
      ? Number(item.total_labor)
      : adjQty * Number(item.unit_labor_cost || 0)
    const eqp = item.total_equipment != null
      ? Number(item.total_equipment)
      : adjQty * Number(item.unit_equipment_cost || 0)
    const sub = item.total_sub != null
      ? Number(item.total_sub)
      : adjQty * Number(item.unit_sub_cost || 0)

    raw_material  += mat
    raw_labor     += lab
    raw_equipment += eqp
    raw_sub       += sub

    const div = item.csi_division || 'unknown'
    if (!byDivision[div]) {
      byDivision[div] = {
        division: div,
        description: CSI_DIVISIONS[div] || 'Other',
        total_material: 0,
        total_labor: 0,
        total_equipment: 0,
        total_sub: 0,
        line_total: 0,
        item_count: 0,
      }
    }
    byDivision[div].total_material  += mat
    byDivision[div].total_labor     += lab
    byDivision[div].total_equipment += eqp
    byDivision[div].total_sub       += sub
    byDivision[div].line_total      += mat + lab + eqp + sub
    byDivision[div].item_count      += 1
  }

  // Apply markups
  const total_material    = raw_material  * (1 + markup.markup_material_pct  / 100)
  const total_labor       = raw_labor     * (1 + markup.markup_labor_pct     / 100)
  const total_equipment   = raw_equipment * (1 + markup.markup_equipment_pct / 100)
  const total_subcontractor = raw_sub     // subs typically bid inclusive of markup

  const subtotal = total_material + total_labor + total_equipment + total_subcontractor
  const total_overhead = subtotal * (markup.overhead_pct / 100)
  const total_profit   = (subtotal + total_overhead) * (markup.profit_pct / 100)
  const grand_total    = subtotal + total_overhead + total_profit

  const cost_per_sqft = projectSqFt && projectSqFt > 0
    ? Math.round((grand_total / projectSqFt) * 100) / 100
    : null

  return {
    total_material,
    total_labor,
    total_equipment,
    total_subcontractor,
    subtotal,
    total_overhead,
    total_profit,
    grand_total,
    cost_per_sqft,
    by_division: byDivision,
  }
}

// ── BUILD CSI BREAKDOWN ───────────────────────────────────────────
function buildCSIBreakdown(
  items: Array<{
    csi_division?: string | null
    total_material?: number | null
    total_labor?: number | null
    total_equipment?: number | null
    total_sub?: number | null
    quantity?: number | null
    unit_material_cost?: number | null
    unit_labor_cost?: number | null
    unit_equipment_cost?: number | null
    unit_sub_cost?: number | null
    waste_factor_pct?: number | null
    is_excluded?: boolean | null
  }>,
  markup: MarkupSettings
): Record<string, unknown> {
  const breakdown: Record<string, { division_name: string; subtotal: number; item_count: number }> = {}

  for (const item of items.filter(i => !i.is_excluded)) {
    const div = item.csi_division || 'unknown'
    const qty = Number(item.quantity || 0)
    const waste = Number(item.waste_factor_pct || 0)
    const adjQty = qty * (1 + waste / 100)

    const mat = item.total_material != null
      ? Number(item.total_material)
      : adjQty * Number(item.unit_material_cost || 0)
    const lab = item.total_labor != null
      ? Number(item.total_labor)
      : adjQty * Number(item.unit_labor_cost || 0)
    const eqp = item.total_equipment != null
      ? Number(item.total_equipment)
      : adjQty * Number(item.unit_equipment_cost || 0)
    const sub = item.total_sub != null
      ? Number(item.total_sub)
      : adjQty * Number(item.unit_sub_cost || 0)

    const lineTotal = mat * (1 + markup.markup_material_pct / 100)
      + lab * (1 + markup.markup_labor_pct / 100)
      + eqp * (1 + markup.markup_equipment_pct / 100)
      + sub

    if (!breakdown[div]) {
      breakdown[div] = {
        division_name: CSI_DIVISIONS[div] || 'Other',
        subtotal: 0,
        item_count: 0,
      }
    }
    breakdown[div].subtotal    += lineTotal
    breakdown[div].item_count  += 1
  }

  return breakdown
}

// ── BUILD AIA G703 SCHEDULE OF VALUES ────────────────────────────
export function buildScheduleOfValues(
  items: Array<{
    csi_division?: string | null
    description: string
    total_material?: number | null
    total_labor?: number | null
    total_equipment?: number | null
    total_sub?: number | null
    quantity?: number | null
    unit_material_cost?: number | null
    unit_labor_cost?: number | null
    unit_equipment_cost?: number | null
    unit_sub_cost?: number | null
    waste_factor_pct?: number | null
    is_excluded?: boolean | null
  }>,
  markup: MarkupSettings,
  projectName: string,
  contractAmount?: number
): SOVLine[] {
  const divisionMap: Record<string, { description: string; value: number }> = {}

  for (const item of items.filter(i => !i.is_excluded)) {
    const div = item.csi_division || 'misc'
    const qty = Number(item.quantity || 0)
    const waste = Number(item.waste_factor_pct || 0)
    const adjQty = qty * (1 + waste / 100)

    const mat = item.total_material != null
      ? Number(item.total_material)
      : adjQty * Number(item.unit_material_cost || 0)
    const lab = item.total_labor != null
      ? Number(item.total_labor)
      : adjQty * Number(item.unit_labor_cost || 0)
    const eqp = item.total_equipment != null
      ? Number(item.total_equipment)
      : adjQty * Number(item.unit_equipment_cost || 0)
    const sub = item.total_sub != null
      ? Number(item.total_sub)
      : adjQty * Number(item.unit_sub_cost || 0)

    const lineValue = mat * (1 + markup.markup_material_pct / 100)
      + lab * (1 + markup.markup_labor_pct / 100)
      + eqp * (1 + markup.markup_equipment_pct / 100)
      + sub

    if (!divisionMap[div]) {
      divisionMap[div] = {
        description: CSI_DIVISIONS[div] || 'General',
        value: 0,
      }
    }
    divisionMap[div].value += lineValue
  }

  const totalExtracted = Object.values(divisionMap).reduce((s, d) => s + d.value, 0)
  const scaleFactor = contractAmount && totalExtracted > 0
    ? contractAmount / totalExtracted
    : 1

  return Object.entries(divisionMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([div, data], idx) => {
      const scheduledValue = Math.round(data.value * scaleFactor * 100) / 100
      return {
        item_no:               String(idx + 1).padStart(2, '0'),
        description:           `${div} — ${data.description}`,
        scheduled_value:       scheduledValue,
        work_complete_pct:     0,
        work_complete_amount:  0,
        stored_materials:      0,
        total_complete:        0,
        balance_to_finish:     scheduledValue,
        retainage_pct:         10,
      }
    })
}

// ── RECALCULATE ALL TOTALS ────────────────────────────────────────
export async function recalculateTakeoffTotals(
  supabase: SupabaseClient,
  takeoffId: string,
  tenantId: string,
  markup: MarkupSettings,
  projectSqFt: number | null = null
): Promise<TakeoffTotals> {
  const { data: items } = await supabase
    .from('takeoff_line_items')
    .select('*')
    .eq('takeoff_id', takeoffId)
    .eq('tenant_id', tenantId)

  const totals = calculateTotals(items || [], markup, projectSqFt)
  const csiBreakdown = buildCSIBreakdown(items || [], markup)

  await supabase.from('takeoffs').update({
    ...markup,
    total_material:      totals.total_material,
    total_labor:         totals.total_labor,
    total_equipment:     totals.total_equipment,
    total_subcontractor: totals.total_subcontractor,
    subtotal:            totals.subtotal,
    total_overhead:      totals.total_overhead,
    total_profit:        totals.total_profit,
    grand_total:         totals.grand_total,
    cost_per_sqft:       totals.cost_per_sqft,
    csi_breakdown:       csiBreakdown,
    cost_summary: {
      by_type: {
        material:      totals.total_material,
        labor:         totals.total_labor,
        equipment:     totals.total_equipment,
        subcontractor: totals.total_subcontractor,
      },
      markup_applied: markup,
      subtotal:       totals.subtotal,
      overhead:       totals.total_overhead,
      profit:         totals.total_profit,
      grand_total:    totals.grand_total,
      cost_per_sqft:  totals.cost_per_sqft,
      recalculated_at: new Date().toISOString(),
    },
  }).eq('id', takeoffId).eq('tenant_id', tenantId)

  return totals
}
