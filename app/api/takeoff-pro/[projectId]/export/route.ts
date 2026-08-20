import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helper'
import * as XLSX from 'xlsx'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CSI_TITLES: Record<string, string> = {
  '01': 'General Requirements',
  '02': 'Existing Conditions',
  '03': 'Concrete',
  '04': 'Masonry',
  '05': 'Metals',
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
  '26': 'Electrical',
  '27': 'Communications',
  '28': 'Electronic Safety',
  '31': 'Earthwork',
  '32': 'Exterior Improvements',
  '33': 'Utilities',
}

interface LineItem {
  csi_division: string | null
  csi_code: string | null
  description: string | null
  scope_notes: string | null
  quantity: number | null
  unit: string | null
  waste_factor_pct: number | null
  adjusted_quantity: number | null
  unit_material_cost: number | null
  unit_labor_cost: number | null
  unit_equipment_cost: number | null
  total_material: number | null
  total_labor: number | null
  total_equipment: number | null
  ai_confidence: number | null
  page_reference: string | null
  manually_edited: boolean | null
}

export async function GET(
  req: NextRequest,
  _ctx: { params: Promise<{ projectId: string }> },
) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId } = auth

  const { searchParams } = new URL(req.url)
  const takeoffId = searchParams.get('takeoffId')
  if (!takeoffId) {
    return NextResponse.json({ error: 'takeoffId required' }, { status: 400 })
  }

  const { data: takeoff } = await supabase
    .from('takeoffs')
    .select('*, projects(name)')
    .eq('id', takeoffId)
    .eq('tenant_id', tenantId)
    .single()

  if (!takeoff) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data: items } = await supabase
    .from('takeoff_line_items')
    .select('*')
    .eq('takeoff_id', takeoffId)
    .eq('tenant_id', tenantId)
    .order('csi_division')
    .order('sort_order')

  const { data: settings } = await supabase
    .from('tenant_settings')
    .select('company_name')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  const lineItems: LineItem[] = (items as LineItem[] | null) || []
  const projectName =
    (takeoff.projects as { name?: string } | null)?.name || 'Project'

  const wb = XLSX.utils.book_new()

  const summaryData = [
    [settings?.company_name || 'Saguaro Construction', '', '', ''],
    ['AI MATERIAL TAKEOFF ESTIMATE', '', '', ''],
    ['', '', '', ''],
    ['Project:', projectName, '', ''],
    ['Building Type:', takeoff.building_type || '', '', ''],
    ['Area (SF):', takeoff.building_area || '', '', ''],
    [
      'Analysis Date:',
      new Date(takeoff.analyzed_at || takeoff.created_at).toLocaleDateString(),
      '',
      '',
    ],
    [
      'AI Confidence:',
      `${Math.round((takeoff.extraction_confidence || 0.8) * 100)}%`,
      '',
      '',
    ],
    ['', '', '', ''],
    ['COST SUMMARY', '', '', ''],
    [
      'Total Material',
      '',
      '',
      `$${(takeoff.total_material || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
    ],
    [
      'Total Labor',
      '',
      '',
      `$${(takeoff.total_labor || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
    ],
    [
      'Total Equipment',
      '',
      '',
      `$${(takeoff.total_equipment || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
    ],
    [
      'Subtotal',
      '',
      '',
      `$${(takeoff.subtotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
    ],
    [
      'Overhead (12%)',
      '',
      '',
      `$${(takeoff.total_overhead || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
    ],
    [
      'Profit (8%)',
      '',
      '',
      `$${(takeoff.total_profit || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
    ],
    [
      'GRAND TOTAL',
      '',
      '',
      `$${(takeoff.grand_total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
    ],
    ['Cost per SF', '', '', `$${(takeoff.cost_per_sqft || 0).toFixed(2)}`],
  ]
  const ws1 = XLSX.utils.aoa_to_sheet(summaryData)
  ws1['!cols'] = [{ wch: 30 }, { wch: 20 }, { wch: 20 }, { wch: 20 }]
  XLSX.utils.book_append_sheet(wb, ws1, 'Summary')

  const detailHeaders = [
    'CSI Division',
    'CSI Code',
    'Description',
    'Scope Notes',
    'Qty',
    'Unit',
    'Waste %',
    'Adj Qty',
    'Unit Mat $',
    'Unit Labor $',
    'Unit Equip $',
    'Total Mat $',
    'Total Labor $',
    'Total Equip $',
    'Line Total $',
    'Confidence',
    'Page Ref',
    'Manually Edited',
  ]
  const detailRows: (string | number)[][] = [detailHeaders]

  const grouped: Record<string, LineItem[]> = {}
  for (const item of lineItems) {
    const div = (item.csi_division || '01').slice(0, 2)
    if (!grouped[div]) grouped[div] = []
    grouped[div].push(item)
  }

  for (const [div, divItems] of Object.entries(grouped).sort()) {
    detailRows.push([
      `DIV ${div} — ${CSI_TITLES[div] || ''}`,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ])
    let divTotal = 0
    for (const item of divItems) {
      const lineTotal =
        (Number(item.total_material) || 0) +
        (Number(item.total_labor) || 0) +
        (Number(item.total_equipment) || 0)
      divTotal += lineTotal
      detailRows.push([
        div,
        item.csi_code || '',
        item.description || '',
        item.scope_notes || '',
        Number(item.quantity) || 0,
        item.unit || '',
        `${item.waste_factor_pct ?? 5}%`,
        Number(item.adjusted_quantity ?? item.quantity) || 0,
        Number(item.unit_material_cost) || 0,
        Number(item.unit_labor_cost) || 0,
        Number(item.unit_equipment_cost) || 0,
        Number(item.total_material) || 0,
        Number(item.total_labor) || 0,
        Number(item.total_equipment) || 0,
        lineTotal,
        `${Math.round((Number(item.ai_confidence) || 0.8) * 100)}%`,
        item.page_reference || '',
        item.manually_edited ? 'Yes' : 'No',
      ])
    }
    detailRows.push([
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      `DIV ${div} TOTAL`,
      divTotal,
      '',
      '',
      '',
    ])
    detailRows.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''])
  }

  const ws2 = XLSX.utils.aoa_to_sheet(detailRows)
  ws2['!cols'] = [
    { wch: 8 },
    { wch: 14 },
    { wch: 35 },
    { wch: 25 },
    { wch: 10 },
    { wch: 8 },
    { wch: 8 },
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
  ]
  XLSX.utils.book_append_sheet(wb, ws2, 'Detail by CSI')

  const tradeMap: Record<string, number> = {}
  for (const item of lineItems) {
    const div = (item.csi_division || '01').slice(0, 2)
    const divTitle = CSI_TITLES[div] || div
    const lineTotal =
      (Number(item.total_material) || 0) + (Number(item.total_labor) || 0)
    tradeMap[divTitle] = (tradeMap[divTitle] || 0) + lineTotal
  }
  const tradeRows: (string | number)[][] = [
    ['SUBCONTRACTOR BID INVITATION LIST', '', ''],
    ['Project:', projectName, ''],
    ['', '', ''],
    ['Trade / Division', 'Estimated Scope Value', 'Action Required'],
    ...Object.entries(tradeMap)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([trade, val]) => [
        trade,
        `$${val.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
        'Send Bid Invitation',
      ]),
  ]
  const ws3 = XLSX.utils.aoa_to_sheet(tradeRows)
  ws3['!cols'] = [{ wch: 35 }, { wch: 22 }, { wch: 20 }]
  XLSX.utils.book_append_sheet(wb, ws3, 'Bid Invitations')

  const xlsBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const slug = projectName.replace(/\s+/g, '-').toLowerCase()
  const fileName = `${slug}-takeoff-${new Date().toISOString().split('T')[0]}.xlsx`

  return new Response(xlsBuffer, {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  })
}
