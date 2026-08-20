import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helper'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const maxDuration = 120
export const dynamic = 'force-dynamic'

const CSI_NAMES: Record<string, string> = {
  '01': 'General Requirements',
  '02': 'Existing Conditions',
  '03': 'Concrete',
  '04': 'Masonry',
  '05': 'Structural Steel',
  '06': 'Wood & Plastics',
  '07': 'Thermal & Moisture Protection',
  '08': 'Openings',
  '09': 'Finishes',
  '10': 'Specialties',
  '21': 'Fire Suppression',
  '22': 'Plumbing',
  '23': 'HVAC',
  '26': 'Electrical',
  '27': 'Communications',
  '28': 'Electronic Safety',
  '31': 'Earthwork',
  '32': 'Exterior Improvements',
  '33': 'Utilities',
}

interface SovItem {
  line_number: number
  description: string
  cost_code: string
  scheduled_value: number
}
interface Milestone {
  title: string
  description: string
  days_from_start: number
  milestone_type: string
  is_critical_path: boolean
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId } = auth

  const { takeoffId, projectId } = (await req.json()) as {
    takeoffId?: string
    projectId?: string
  }
  if (!takeoffId || !projectId) {
    return NextResponse.json(
      { error: 'takeoffId and projectId required' },
      { status: 400 },
    )
  }
  console.log('[AUTO-POP] Start takeoff:', takeoffId, 'project:', projectId)

  const [
    { data: takeoff },
    { data: items },
    { data: project },
    { data: gc },
  ] = await Promise.all([
    supabase
      .from('takeoffs')
      .select('*')
      .eq('id', takeoffId)
      .eq('tenant_id', tenantId)
      .single(),
    supabase
      .from('takeoff_line_items')
      .select('*')
      .eq('takeoff_id', takeoffId)
      .eq('tenant_id', tenantId),
    supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('tenant_id', tenantId)
      .single(),
    supabase
      .from('tenant_settings')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle(),
  ])

  if (!takeoff || !project) {
    return NextResponse.json(
      { error: 'Takeoff or project not found' },
      { status: 404 },
    )
  }

  const t = takeoff as Record<string, unknown>
  const proj = project as Record<string, unknown>
  const gcData = (gc as Record<string, unknown>) || {}

  const client = new Anthropic()
  const lineItems = (items as Record<string, unknown>[]) || []
  const grandTotal = Number(t.grand_total) || 0
  const today = new Date().toISOString().split('T')[0]
  const csiBreakdown = (t.csi_breakdown as Record<string, number>) || {}
  const gcName = (gcData.company_name as string) || 'General Contractor'

  const projectCtx = `
GENERAL CONTRACTOR: ${gcName}${gcData.company_dba ? ' DBA: ' + String(gcData.company_dba) : ''}
  ${gcData.company_address ? `Address: ${String(gcData.company_address)}, ${String(gcData.company_city || '')}, ${String(gcData.company_state || '')} ${String(gcData.company_zip || '')}` : 'Address: [Set in Settings → Company]'}
  Phone: ${String(gcData.company_phone || '[Set in Settings]')} | Email: ${String(gcData.company_email || '[Set in Settings]')}
  License: ${gcData.license_number ? String(gcData.license_number) + ' (' + String(gcData.license_state || 'AZ') + ')' : '[Set in Settings]'}
  ${gcData.ein ? 'EIN: ' + String(gcData.ein) : ''} | Retainage: ${Number(gcData.default_retainage_pct) || 10}%
  Contact: ${String(gcData.signature_name || 'Project Manager')}${gcData.signature_title ? ', ' + String(gcData.signature_title) : ''}

PROJECT: ${String(proj.name || '')}${proj.project_number ? ' (#' + String(proj.project_number) + ')' : ''}
  ${[proj.address, proj.city ? `${String(proj.city)}, ${String(proj.state || '')}` : ''].filter(Boolean).join(', ')}
  Owner: ${String(proj.owner_name || 'Owner')}${proj.owner_company ? ' / ' + String(proj.owner_company) : ''}
  Type: ${String(proj.building_type || 'Commercial')} | ${proj.sq_footage ? Number(proj.sq_footage).toLocaleString() + ' SF' : ''}
  Start: ${String(proj.start_date || 'TBD')} | End: ${String(proj.end_date || 'TBD')}
  Contract Value: $${Number(proj.contract_value || grandTotal).toLocaleString(undefined, { maximumFractionDigits: 0 })}

TAKEOFF (AI Extracted):
  Grand Total: $${grandTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
  Cost/SF: $${Number(t.cost_per_sqft || 0).toFixed(2)} | ${lineItems.length} line items | Confidence: ${Math.round(Number(t.extraction_confidence || 0.75) * 100)}%

CSI BREAKDOWN:
${Object.entries(csiBreakdown)
  .filter(([, v]) => Number(v) > 0)
  .sort(([, a], [, b]) => Number(b) - Number(a))
  .slice(0, 10)
  .map(
    ([d, v]) =>
      `  Div ${d} ${CSI_NAMES[d] || ''}: $${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
  )
  .join('\n') || '  (No line items yet)'}
`

  const results: Record<
    string,
    { success: boolean; count?: number; message: string }
  > = {}

  // ─── 1. SCHEDULE OF VALUES ───────────────────────────────────────────
  try {
    const sovMsg = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: 'Construction expert. Return ONLY valid JSON array, no markdown.',
      messages: [
        {
          role: 'user',
          content: `Create Schedule of Values for this project.
${projectCtx}
Return JSON array of 8-15 items: [{"line_number":1,"description":"string","cost_code":"01-0000","scheduled_value":number}]
Sum of scheduled_value must ≈ ${grandTotal}. Return ONLY the JSON array.`,
        },
      ],
    })
    const rawBlock = sovMsg.content[0]
    const raw =
      rawBlock && rawBlock.type === 'text'
        ? rawBlock.text.replace(/```json\n?|\n?```/g, '').trim()
        : '[]'
    let sovItems: SovItem[] = []
    try {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) sovItems = parsed as SovItem[]
    } catch {
      /* skip */
    }

    if (sovItems.length > 0) {
      await supabase
        .from('schedule_of_values')
        .delete()
        .eq('project_id', projectId)
        .eq('tenant_id', tenantId)
      const { error: sovErr } = await supabase.from('schedule_of_values').insert(
        sovItems.map((item, i) => ({
          tenant_id: tenantId,
          project_id: projectId,
          line_number: Number(item.line_number) || i + 1,
          description: String(item.description || `Line ${i + 1}`).slice(0, 500),
          scheduled_value: Number(item.scheduled_value) || 0,
          cost_code: String(item.cost_code || '').slice(0, 50),
          prev_completed: 0,
          this_period: 0,
          stored_materials: 0,
          total_completed: 0,
          percent_complete: 0,
          balance_to_finish: Number(item.scheduled_value) || 0,
          retainage: 0,
          sort_order: i + 1,
          ai_generated: true,
        })),
      )
      if (sovErr) throw new Error(sovErr.message)
      results['schedule_of_values'] = {
        success: true,
        count: sovItems.length,
        message: `${sovItems.length} SOV lines`,
      }
      console.log('[AUTO-POP] SOV:', sovItems.length, 'lines')
    } else {
      results['schedule_of_values'] = {
        success: false,
        message: 'No items returned from Claude',
      }
    }
  } catch (err) {
    results['schedule_of_values'] = {
      success: false,
      message: err instanceof Error ? err.message : String(err),
    }
    console.error('[AUTO-POP] SOV error:', err)
  }

  // ─── 2. BUDGET + BUDGET LINES ─────────────────────────────────────────
  try {
    const overhead = Number(t.total_overhead) || Math.round(grandTotal * 0.1)
    const profit = Number(t.total_profit) || Math.round(grandTotal * 0.067)

    await supabase
      .from('budgets')
      .delete()
      .eq('project_id', projectId)
      .eq('tenant_id', tenantId)
    const { error: bErr } = await supabase
      .from('budgets')
      .insert({
        tenant_id: tenantId,
        project_id: projectId,
        name: `${String(proj.name || 'Project')} — AI Cost Budget`,
        version: 1,
        status: 'active',
        original_total: grandTotal,
        revised_total: grandTotal,
        committed_total: 0,
        actual_total: 0,
        overhead_pct: 12,
        profit_pct: 8,
        variance: 0,
        notes: `Auto-generated by Sage AI from takeoff ${takeoffId} on ${today}`,
      })
      .select('id')
      .single()

    if (bErr) throw new Error(bErr.message)

    const csiEntries = Object.entries(csiBreakdown)
      .filter(([, v]) => Number(v) > 0)
      .sort(([, a], [, b]) => Number(b) - Number(a))
    const budgetLineRows = [
      ...csiEntries.map(([div, total], i) => ({
        tenant_id: tenantId,
        project_id: projectId,
        description: `Div ${div} — ${CSI_NAMES[div] || 'Construction'}`,
        cost_code: `${div.padStart(2, '0')}-0000`,
        division: div,
        category: 'construction',
        original_budget: Number(total) || 0,
        revised_budget: Number(total) || 0,
        committed: 0,
        actual: 0,
        projected: Number(total) || 0,
        variance: 0,
        percent_complete: 0,
        sort_order: i + 1,
        ai_generated: true,
      })),
      {
        tenant_id: tenantId,
        project_id: projectId,
        description: 'General Overhead (12%)',
        cost_code: '01-9000',
        division: '01',
        category: 'overhead',
        original_budget: overhead,
        revised_budget: overhead,
        committed: 0,
        actual: 0,
        projected: overhead,
        variance: 0,
        percent_complete: 0,
        sort_order: csiEntries.length + 1,
        ai_generated: true,
      },
      {
        tenant_id: tenantId,
        project_id: projectId,
        description: 'Profit & Contingency (8%)',
        cost_code: '01-9900',
        division: '01',
        category: 'profit',
        original_budget: profit,
        revised_budget: profit,
        committed: 0,
        actual: 0,
        projected: profit,
        variance: 0,
        percent_complete: 0,
        sort_order: csiEntries.length + 2,
        ai_generated: true,
      },
    ]

    await supabase
      .from('budget_lines')
      .delete()
      .eq('project_id', projectId)
      .eq('tenant_id', tenantId)
    const { error: blErr } = await supabase
      .from('budget_lines')
      .insert(budgetLineRows)
    if (blErr) throw new Error(blErr.message)
    results['budget'] = {
      success: true,
      count: budgetLineRows.length,
      message: `Budget + ${budgetLineRows.length} lines`,
    }
    console.log('[AUTO-POP] Budget:', budgetLineRows.length, 'lines')
  } catch (err) {
    results['budget'] = {
      success: false,
      message: err instanceof Error ? err.message : String(err),
    }
    console.error('[AUTO-POP] Budget error:', err)
  }

  // ─── 3. SCHEDULE MILESTONES ───────────────────────────────────────────
  try {
    const mMsg = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1200,
      system: 'Construction scheduler. Return ONLY valid JSON array, no markdown.',
      messages: [
        {
          role: 'user',
          content: `Create project schedule milestones.
${projectCtx}
Return JSON array 8-12 items: [{"title":"string","description":"string","days_from_start":number,"milestone_type":"start|phase|inspection|completion|payment","is_critical_path":boolean}]
Use realistic construction phase durations. Return ONLY the JSON array.`,
        },
      ],
    })
    const rawBlock = mMsg.content[0]
    const raw =
      rawBlock && rawBlock.type === 'text'
        ? rawBlock.text.replace(/```json\n?|\n?```/g, '').trim()
        : '[]'
    let milestones: Milestone[] = []
    try {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) milestones = parsed as Milestone[]
    } catch {
      /* skip */
    }

    if (milestones.length > 0) {
      const startDate = proj.start_date
        ? new Date(String(proj.start_date))
        : new Date()
      await supabase
        .from('schedule_milestones')
        .delete()
        .eq('project_id', projectId)
        .eq('tenant_id', tenantId)
        .ilike('description', '%Sage AI%')

      const { error: mErr } = await supabase.from('schedule_milestones').insert(
        milestones.map((m, i) => {
          const bd = new Date(startDate)
          bd.setDate(
            bd.getDate() + Math.max(0, Number(m.days_from_start) || (i + 1) * 14),
          )
          return {
            tenant_id: tenantId,
            project_id: projectId,
            title: String(m.title || `Milestone ${i + 1}`).slice(0, 200),
            name: String(m.title || `Milestone ${i + 1}`).slice(0, 200),
            description: `${String(m.description || '').slice(0, 400)} — Sage AI`,
            baseline_date: bd.toISOString().split('T')[0],
            current_date: bd.toISOString().split('T')[0],
            milestone_type: String(m.milestone_type || 'phase').slice(0, 50),
            status: 'pending',
            is_critical_path: Boolean(m.is_critical_path),
            milestone_number: i + 1,
            sort_order: i + 1,
            completion_pct: 0,
            ai_generated: true,
          }
        }),
      )
      if (mErr) throw new Error(mErr.message)
      results['schedule_milestones'] = {
        success: true,
        count: milestones.length,
        message: `${milestones.length} milestones`,
      }
      console.log('[AUTO-POP] Milestones:', milestones.length)
    } else {
      results['schedule_milestones'] = {
        success: false,
        message: 'No milestones returned',
      }
    }
  } catch (err) {
    results['schedule_milestones'] = {
      success: false,
      message: err instanceof Error ? err.message : String(err),
    }
    console.error('[AUTO-POP] Milestones error:', err)
  }

  // ─── 4. PROJECT INTELLIGENCE ─────────────────────────────────────────
  try {
    const confidence = Number(t.extraction_confidence || 0.75)
    const hasItems = lineItems.length > 0
    const overallScore = Math.round(confidence * 85 + (hasItems ? 15 : 0))

    const criticalIssues: Array<{ issue: string; action: string }> = []
    const warnings: Array<{ warning: string; action: string }> = []
    const positiveFindings: Array<{ finding: string }> = []
    if (!gcData.company_address)
      criticalIssues.push({
        issue: 'Company address missing',
        action: 'Settings → Company → fill all fields',
      })
    if (!gcData.license_number)
      criticalIssues.push({
        issue: 'Contractor license number not set',
        action: 'Settings → Company → License Number',
      })
    if (!hasItems)
      criticalIssues.push({
        issue: 'No takeoff line items extracted',
        action: 'Upload blueprint PDF and run takeoff analysis',
      })
    if (grandTotal === 0)
      warnings.push({
        warning: 'Grand total is $0',
        action: 'Upload blueprint and run takeoff',
      })
    if (confidence < 0.8 && hasItems)
      warnings.push({
        warning: `AI confidence ${Math.round(confidence * 100)}% — review flagged items`,
        action: 'Takeoff → Confidence tab',
      })
    if (hasItems)
      positiveFindings.push({
        finding: `${lineItems.length} line items extracted`,
      })
    if (confidence >= 0.85)
      positiveFindings.push({
        finding: `High confidence: ${Math.round(confidence * 100)}%`,
      })
    if (grandTotal > 0)
      positiveFindings.push({
        finding: `$${grandTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })} / $${Number(t.cost_per_sqft || 0).toFixed(2)}/SF`,
      })

    await supabase
      .from('project_intelligence')
      .delete()
      .eq('project_id', projectId)
      .eq('tenant_id', tenantId)
    const { error: piErr } = await supabase.from('project_intelligence').insert({
      tenant_id: tenantId,
      project_id: projectId,
      overall_score: overallScore,
      schedule_score: proj.start_date ? 75 : 50,
      budget_score: grandTotal > 0 ? 80 : 40,
      quality_score: Math.round(confidence * 90),
      safety_score: 70,
      communication_score: 65,
      critical_issues: criticalIssues,
      warnings: warnings,
      positive_findings: positiveFindings,
      predictions: [
        {
          prediction:
            grandTotal > 0
              ? `Estimated: $${grandTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
              : 'Run takeoff for estimate',
        },
        { prediction: `${Object.keys(csiBreakdown).length} CSI divisions` },
      ],
      raw_analysis: `Sage AI analysis — takeoff ${takeoffId} — ${today}. ${lineItems.length} items. Score: ${overallScore}%. Issues: ${criticalIssues.length}. Warnings: ${warnings.length}.`,
      analysis_version: 1,
    })
    if (piErr) throw new Error(piErr.message)
    results['project_intelligence'] = {
      success: true,
      message: `Score: ${overallScore}%`,
    }
    console.log('[AUTO-POP] Intelligence: score', overallScore)
  } catch (err) {
    results['project_intelligence'] = {
      success: false,
      message: err instanceof Error ? err.message : String(err),
    }
    console.error('[AUTO-POP] Intelligence error:', err)
  }

  // ─── 5. GENERATED DOCUMENTS LOG ──────────────────────────────────────
  try {
    const { error: gdErr } = await supabase.from('generated_documents').insert({
      tenant_id: tenantId,
      project_id: projectId,
      doc_type: 'ai_takeoff',
      status: 'generated',
      created_by: 'sage_ai',
      ai_model: 'claude-sonnet-4-20250514',
      source_type: 'takeoff',
      source_id: takeoffId,
      title: `AI Takeoff — ${String(proj.name || 'Project')}`,
      data_snapshot: {
        takeoff_id: takeoffId,
        grand_total: grandTotal,
        line_items_count: lineItems.length,
        confidence: t.extraction_confidence,
        generated_at: today,
        gc_company: gcName,
        project_name: proj.name,
        csi_divisions: Object.keys(csiBreakdown).length,
      },
    })
    if (gdErr) throw new Error(gdErr.message)
    results['generated_documents'] = { success: true, message: 'Takeoff logged' }
  } catch (err) {
    results['generated_documents'] = {
      success: false,
      message: err instanceof Error ? err.message : String(err),
    }
  }

  console.log('[AUTO-POP] Complete:', JSON.stringify(results))
  return NextResponse.json({ success: true, results, takeoffId, projectId })
}
