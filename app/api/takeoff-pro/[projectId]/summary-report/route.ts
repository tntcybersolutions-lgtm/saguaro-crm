import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helper'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

const divisionNames: Record<string, string> = {
  '01': 'General Requirements',
  '02': 'Existing Conditions',
  '03': 'Concrete',
  '04': 'Masonry',
  '05': 'Structural Steel',
  '06': 'Wood & Plastics',
  '07': 'Thermal & Moisture',
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

const esc = (s: string) =>
  String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId } = auth
  const { projectId } = await params

  const body = (await req.json().catch(() => ({}))) as { takeoffId?: string }
  const takeoffId = body.takeoffId
  if (!takeoffId) {
    return NextResponse.json({ error: 'takeoffId required' }, { status: 400 })
  }

  const [
    { data: takeoff },
    { data: items },
    { data: gaps },
    { data: gc },
    { data: project },
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
      .eq('tenant_id', tenantId)
      .eq('is_excluded', false),
    supabase
      .from('takeoff_scope_gaps')
      .select('*')
      .eq('takeoff_id', takeoffId)
      .eq('tenant_id', tenantId),
    supabase
      .from('tenant_settings')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle(),
    supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('tenant_id', tenantId)
      .single(),
  ])

  if (!takeoff) {
    return NextResponse.json({ error: 'Takeoff not found' }, { status: 404 })
  }

  const gcName = (gc as any)?.company_name || 'General Contractor'
  const gcAddr = [
    (gc as any)?.company_address,
    (gc as any)?.company_city
      ? `${(gc as any).company_city}, ${(gc as any).company_state || ''} ${(gc as any).company_zip || ''}`.trim()
      : '',
  ]
    .filter(Boolean)
    .join(', ')
  const license = (gc as any)?.license_number
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const divisionMap: Record<string, { total: number; count: number }> = {}
  for (const item of (items as any[]) || []) {
    const div = String(item.csi_division || '01').slice(0, 2)
    if (!divisionMap[div]) divisionMap[div] = { total: 0, count: 0 }
    const qty = Number(item.quantity) || 0
    const mat = Number(item.unit_material_cost) || 0
    const lab = Number(item.unit_labor_cost) || 0
    const eq = Number(item.unit_equipment_cost) || 0
    divisionMap[div].total += qty * (mat + lab + eq)
    divisionMap[div].count++
  }

  const gapsList = ((gaps as any[]) || []).filter((g) => !g.acknowledged)
  const criticalGaps = gapsList.filter((g) => g.severity === 'critical')
  const warningGaps = gapsList.filter((g) => g.severity === 'warning')
  const grandTotal = Number((takeoff as any).grand_total) || 0
  const confidence = Math.round(
    (Number((takeoff as any).extraction_confidence) || 0) * 100,
  )
  const subtotal = Number((takeoff as any).subtotal) || 0
  const overhead = Number((takeoff as any).total_overhead) || 0
  const profit = Number((takeoff as any).total_profit) || 0
  const costPerSf = Number((takeoff as any).cost_per_sqft) || 0
  const buildingArea = Number((takeoff as any).building_area) || 0

  const p = (project as any) || {}
  const projectName = p.name || 'Project'

  const totalDisplay =
    grandTotal >= 1_000_000
      ? `$${(grandTotal / 1_000_000).toFixed(2)}M`
      : `$${(grandTotal / 1000).toFixed(0)}K`

  const divisionRows = Object.entries(divisionMap)
    .sort(([, a], [, b]) => b.total - a.total)
    .map(
      ([div, { total, count }]) => `
          <tr>
            <td><strong>${esc(div)}</strong></td>
            <td>${esc(divisionNames[div] || `Division ${div}`)}</td>
            <td style="text-align:right">${count}</td>
            <td style="text-align:right"><strong>$${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></td>
            <td style="text-align:right">${grandTotal > 0 ? ((total / grandTotal) * 100).toFixed(1) : 0}%</td>
          </tr>`,
    )
    .join('')

  const gapRows = [...criticalGaps, ...warningGaps]
    .map(
      (g) => `
        <tr>
          <td><span class="badge ${g.severity === 'critical' ? 'badge-red' : 'badge-yellow'}">${esc(
            String(g.severity).toUpperCase(),
          )}</span></td>
          <td>${esc(g.gap_description || '')}</td>
          <td>${esc(g.suggested_action || '')}</td>
        </tr>`,
    )
    .join('')

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Takeoff Summary Report — ${esc(projectName)}</title>
  <style>
    @page { size: letter portrait; margin: 0.6in; }
    @media print { .no-print { display:none!important; } }
    * { box-sizing:border-box; margin:0; padding:0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 9.5pt; color: #1a1a1a; background: #fff; }
    .header { background: linear-gradient(135deg, #1a1a2e, #16213e); color: #fff; padding: 18px 24px; display: flex; justify-content: space-between; align-items: flex-start; }
    .company { font-size: 15pt; font-weight: 900; color: #fff; }
    .sub-info { font-size: 8pt; color: rgba(255,255,255,.6); margin-top: 4px; line-height: 1.6; }
    .gold-bar { height: 4px; background: linear-gradient(90deg, #D4A017, #F0C040); }
    .title-bar { background: #f7f8fa; border-bottom: 1px solid #e0e0e0; padding: 12px 24px; display: flex; justify-content: space-between; align-items: center; }
    .doc-title { font-size: 13pt; font-weight: 900; color: #1a1a2e; text-transform: uppercase; letter-spacing: 0.04em; }
    .content { padding: 18px 24px; }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 18px; }
    .kpi-card { background: #f8f9fa; border: 1px solid #e0e0e0; border-radius: 8px; padding: 12px; text-align: center; }
    .kpi-val { font-size: 18pt; font-weight: 900; color: #1a1a2e; }
    .kpi-val.gold { color: #D4A017; }
    .kpi-val.green { color: #15803d; }
    .kpi-label { font-size: 7.5pt; color: #888; text-transform: uppercase; letter-spacing: 0.07em; margin-top: 3px; }
    h2 { font-size: 10pt; font-weight: 900; color: #1a1a2e; margin: 14px 0 8px; border-bottom: 2px solid #D4A017; padding-bottom: 3px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 9pt; }
    th { background: #1a1a2e; color: #fff; padding: 6px 9px; text-align: left; font-size: 8pt; }
    td { padding: 5px 9px; border: 1px solid #ddd; }
    tr:nth-child(even) td { background: #f9f9f9; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 7.5pt; font-weight: 700; }
    .badge-red { background: #fee2e2; color: #b91c1c; }
    .badge-yellow { background: #fef9c3; color: #92400e; }
    .badge-green { background: #dcfce7; color: #15803d; }
    .footer { margin-top: 16px; padding-top: 10px; border-top: 1px solid #ddd; display: flex; justify-content: space-between; font-size: 7.5pt; color: #888; gap: 16px; }
    .print-btn { position: fixed; top: 16px; right: 16px; background: #D4A017; color: #000; border: none; padding: 9px 20px; font-size: 12px; font-weight: 700; cursor: pointer; border-radius: 6px; box-shadow: 0 3px 12px rgba(212,160,23,.4); }
    .print-btn:hover { background: #c49015; }
  </style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">🖨️ Print / Save PDF</button>
  <div class="header">
    <div>
      <div class="company">${esc(gcName)}</div>
      <div class="sub-info">${esc(gcAddr)}${license ? ` · License: ${esc(license)}` : ''}</div>
    </div>
    <div style="text-align:right;font-size:8.5pt;color:rgba(255,255,255,.7);line-height:1.7">
      <strong>TAKEOFF SUMMARY REPORT</strong><br>
      ${esc(projectName)}<br>
      ${esc(today)}
    </div>
  </div>
  <div class="gold-bar"></div>
  <div class="title-bar">
    <div class="doc-title">${esc(projectName)} — AI Takeoff Summary</div>
    <div style="font-size:8pt;color:#888">Prepared by Sage AI · ${esc(today)}</div>
  </div>

  <div class="content">
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-val gold">${totalDisplay}</div>
        <div class="kpi-label">Total Estimate</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-val">$${costPerSf.toFixed(2)}</div>
        <div class="kpi-label">Cost Per SF</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-val">${buildingArea.toLocaleString()}</div>
        <div class="kpi-label">Building SF</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-val ${confidence >= 80 ? 'green' : ''}">${confidence}%</div>
        <div class="kpi-label">AI Confidence</div>
      </div>
    </div>

    <h2>Cost Breakdown by CSI Division</h2>
    <table>
      <thead>
        <tr>
          <th>Division</th>
          <th>Description</th>
          <th style="text-align:right">Items</th>
          <th style="text-align:right">Subtotal</th>
          <th style="text-align:right">% of Total</th>
        </tr>
      </thead>
      <tbody>
        ${divisionRows}
        <tr style="background:#f0f0f0">
          <td colspan="3"><strong>SUBTOTAL (before OH&amp;P)</strong></td>
          <td style="text-align:right"><strong>$${subtotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></td>
          <td></td>
        </tr>
        <tr>
          <td colspan="3">Overhead</td>
          <td style="text-align:right">$${overhead.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
          <td></td>
        </tr>
        <tr>
          <td colspan="3">Profit</td>
          <td style="text-align:right">$${profit.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
          <td></td>
        </tr>
        <tr style="background:#1a1a2e;color:#fff">
          <td colspan="3"><strong>GRAND TOTAL</strong></td>
          <td style="text-align:right"><strong>$${grandTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></td>
          <td style="text-align:right"><strong>100%</strong></td>
        </tr>
      </tbody>
    </table>

    ${
      gapRows
        ? `<h2>Scope Gaps Identified</h2>
    <table>
      <thead><tr><th>Severity</th><th>Gap Description</th><th>Recommended Action</th></tr></thead>
      <tbody>${gapRows}</tbody>
    </table>`
        : '<p style="color:#888;font-size:9pt;margin-bottom:14px">✅ No critical scope gaps identified.</p>'
    }

    <div class="footer">
      <span>Prepared by ${esc(gcName)} using Sage AI · Saguaro Construction Intelligence Platform</span>
      <span>This estimate is based on AI analysis of construction drawings. Verify all quantities before bidding.</span>
    </div>
  </div>
</body>
</html>`

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
