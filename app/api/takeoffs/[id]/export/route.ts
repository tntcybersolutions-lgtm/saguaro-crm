// ══════════════════════════════════════════════════════════════════
// FILE: app/api/takeoffs/[id]/export/route.ts
// ══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { buildScheduleOfValues, calculateTotals } from '@/lib/takeoff-engine'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles').select('tenant_id').eq('id', user.id).single()
    if (!profile?.tenant_id) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    const tenantId = profile.tenant_id
    const body = await req.json()
    const format: 'pdf' | 'excel' | 'csv' | 'sov' = body.format || 'pdf'

    const { data: takeoff } = await supabase
      .from('takeoffs')
      .select('*, projects(name, address, state, project_number)')
      .eq('id', params.id).eq('tenant_id', tenantId).single()

    if (!takeoff) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data: items } = await supabase
      .from('takeoff_line_items').select('*')
      .eq('takeoff_id', params.id).eq('tenant_id', tenantId)
      .order('csi_division').order('sort_order')

    const markup = {
      markup_labor_pct:     Number(takeoff.markup_labor_pct)     || 15,
      markup_material_pct:  Number(takeoff.markup_material_pct)  || 10,
      markup_equipment_pct: Number(takeoff.markup_equipment_pct) || 10,
      overhead_pct:         Number(takeoff.overhead_pct)         || 12,
      profit_pct:           Number(takeoff.profit_pct)           || 8,
    }

    const project = takeoff.projects as Record<string, unknown>
    const projectName = String(project?.name || 'Project')

    if (format === 'csv') {
      const headers = ['CSI Division','Description','Sheet','Qty','Unit','Mat $/unit','Labor $/unit','Equip $/unit','Line Total','AI Confidence']
      const rows = (items || []).map(i => {
        const qty = (i.quantity || 0) * (1 + (i.waste_factor_pct || 0) / 100)
        const total = qty * ((i.unit_material_cost || 0) + (i.unit_labor_cost || 0) + (i.unit_equipment_cost || 0) + (i.unit_sub_cost || 0))
        return [
          i.csi_division || '',
          `"${(i.description || '').replace(/"/g, '""')}"`,
          i.sheet_number || '',
          i.quantity || 0,
          i.unit || '',
          i.unit_material_cost || 0,
          i.unit_labor_cost || 0,
          i.unit_equipment_cost || 0,
          total.toFixed(2),
          i.ai_confidence ? (Number(i.ai_confidence) * 100).toFixed(0) + '%' : '',
        ].join(',')
      })
      const csv = [headers.join(','), ...rows].join('\n')

      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="takeoff-${params.id}.csv"`,
        },
      })
    }

    if (format === 'sov') {
      const sovLines = buildScheduleOfValues(
        items || [], markup, projectName, Number(takeoff.grand_total) || undefined
      )

      // Generate simple text-based SOV PDF using basic HTML
      const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Schedule of Values</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; }
  h1 { font-size: 16px; text-align: center; margin-bottom: 4px; }
  h2 { font-size: 13px; text-align: center; color: #666; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #1a1a2e; color: white; padding: 8px; text-align: left; font-size: 11px; }
  td { padding: 6px 8px; border-bottom: 1px solid #eee; }
  .total { font-weight: bold; background: #f9f9f9; }
  .right { text-align: right; }
</style></head><body>
<h1>SCHEDULE OF VALUES — AIA G703</h1>
<h2>${projectName} | Generated ${new Date().toLocaleDateString()}</h2>
<table>
<tr>
  <th>Item No.</th><th>Description of Work</th>
  <th class="right">Scheduled Value</th>
  <th class="right">% Complete</th>
  <th class="right">Balance to Finish</th>
</tr>
${sovLines.map(line => `<tr>
  <td>${line.item_no}</td>
  <td>${line.description}</td>
  <td class="right">$${Math.round(line.scheduled_value).toLocaleString()}</td>
  <td class="right">0%</td>
  <td class="right">$${Math.round(line.balance_to_finish).toLocaleString()}</td>
</tr>`).join('')}
<tr class="total">
  <td colspan="2"><strong>TOTAL CONTRACT SUM</strong></td>
  <td class="right"><strong>$${Math.round(takeoff.grand_total || 0).toLocaleString()}</strong></td>
  <td class="right">0%</td>
  <td class="right"><strong>$${Math.round(takeoff.grand_total || 0).toLocaleString()}</strong></td>
</tr>
</table>
</body></html>`

      return new Response(html, {
        headers: {
          'Content-Type': 'text/html',
          'Content-Disposition': `attachment; filename="SOV-${params.id}.html"`,
        },
      })
    }

    // Default PDF — detailed cost breakdown report as HTML
    const totals = calculateTotals(items || [], markup, null)
    const byDiv  = totals.by_division

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Takeoff Report</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; color: #1a1a2e; }
  .header { background: #1a1a2e; color: white; padding: 20px; margin: -20px -20px 20px; }
  .title { font-size: 20px; font-weight: bold; color: #d4a017; }
  .sub { font-size: 13px; color: #aaa; margin-top: 4px; }
  .totals { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; margin-bottom: 24px; }
  .tile { border: 1px solid #ddd; border-radius: 6px; padding: 12px; }
  .tile-label { font-size: 10px; color: #666; text-transform: uppercase; font-weight: bold; }
  .tile-value { font-size: 18px; font-weight: bold; color: #1a1a2e; margin-top: 4px; }
  .grand { background: #1a1a2e; color: white; }
  .grand .tile-value { color: #d4a017; font-size: 24px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th { background: #f4f4f4; padding: 8px; text-align: left; font-size: 11px; border-bottom: 2px solid #ddd; }
  td { padding: 6px 8px; border-bottom: 1px solid #eee; font-size: 12px; }
  .section-header { background: #f9f9f9; font-weight: bold; padding: 8px; border-left: 4px solid #d4a017; }
  .right { text-align: right; }
  .conf-high { color: #2ea043; } .conf-low { color: #ff9500; }
</style></head><body>
<div class="header">
  <div class="title">CONSTRUCTION TAKEOFF REPORT</div>
  <div class="sub">${projectName} | ${new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</div>
  <div class="sub">Generated by Saguaro CRM — Sage AI Takeoff Engine</div>
</div>

<div class="totals">
  <div class="tile"><div class="tile-label">Material</div><div class="tile-value">$${Math.round(totals.total_material).toLocaleString()}</div></div>
  <div class="tile"><div class="tile-label">Labor</div><div class="tile-value">$${Math.round(totals.total_labor).toLocaleString()}</div></div>
  <div class="tile"><div class="tile-label">Equipment</div><div class="tile-value">$${Math.round(totals.total_equipment).toLocaleString()}</div></div>
  <div class="tile"><div class="tile-label">Subcontractor</div><div class="tile-value">$${Math.round(totals.total_subcontractor).toLocaleString()}</div></div>
  <div class="tile"><div class="tile-label">Overhead + Profit</div><div class="tile-value">$${Math.round(totals.total_overhead + totals.total_profit).toLocaleString()}</div></div>
  <div class="tile grand"><div class="tile-label" style="color:#aaa">Grand Total</div><div class="tile-value">$${Math.round(totals.grand_total).toLocaleString()}</div></div>
</div>

${Object.entries(byDiv).sort(([a],[b])=>a.localeCompare(b)).map(([div, data]) => `
<div class="section-header">Division ${div} — ${data.description} | ${data.item_count} items | $${Math.round(data.line_total).toLocaleString()}</div>
<table>
<tr><th>Description</th><th>Sheet</th><th class="right">Qty</th><th>Unit</th><th class="right">Mat/unit</th><th class="right">Labor/unit</th><th class="right">Line Total</th></tr>
${(items||[]).filter(i=>i.csi_division===div && !i.is_excluded).map(i=>{
  const qty=(i.quantity||0)*(1+(i.waste_factor_pct||0)/100)
  const tot=qty*((i.unit_material_cost||0)+(i.unit_labor_cost||0)+(i.unit_equipment_cost||0))
  return `<tr>
    <td>${i.description}${i.ai_confidence&&Number(i.ai_confidence)<0.65?' <span class="conf-low">⚠</span>':''}</td>
    <td>${i.sheet_number||''}</td>
    <td class="right">${(i.quantity||0).toLocaleString()}</td>
    <td>${i.unit||''}</td>
    <td class="right">$${(i.unit_material_cost||0).toFixed(2)}</td>
    <td class="right">$${(i.unit_labor_cost||0).toFixed(2)}</td>
    <td class="right"><strong>$${Math.round(tot).toLocaleString()}</strong></td>
  </tr>`
}).join('')}
</table>`).join('')}
</body></html>`

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html',
        'Content-Disposition': `attachment; filename="takeoff-report-${params.id}.html"`,
      },
    })

  } catch (e: unknown) {
    return NextResponse.json({ error: (e instanceof Error ? e.message : 'Export failed') }, { status: 500 })
  }
}
