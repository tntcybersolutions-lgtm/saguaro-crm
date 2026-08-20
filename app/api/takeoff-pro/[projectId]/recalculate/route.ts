import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helper'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  _ctx: { params: Promise<{ projectId: string }> },
) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId } = auth
  const { takeoffId } = (await req.json()) as { takeoffId?: string }

  if (!takeoffId) {
    return NextResponse.json({ error: 'takeoffId required' }, { status: 400 })
  }

  const { data: items, error: itemsError } = await supabase
    .from('takeoff_line_items')
    .select(
      'quantity, unit_material_cost, unit_labor_cost, unit_equipment_cost, csi_division, is_excluded',
    )
    .eq('takeoff_id', takeoffId)
    .eq('tenant_id', tenantId)

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 })
  }
  if (!items) {
    return NextResponse.json({ error: 'No items' }, { status: 404 })
  }

  const activeItems = items.filter((i) => !i.is_excluded)
  const totalMaterial = activeItems.reduce(
    (s, i) =>
      s + (Number(i.quantity) || 0) * (Number(i.unit_material_cost) || 0),
    0,
  )
  const totalLabor = activeItems.reduce(
    (s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_labor_cost) || 0),
    0,
  )
  const totalEquipment = activeItems.reduce(
    (s, i) =>
      s + (Number(i.quantity) || 0) * (Number(i.unit_equipment_cost) || 0),
    0,
  )
  const subtotal = totalMaterial + totalLabor + totalEquipment
  const overhead = subtotal * 0.12
  const profit = subtotal * 0.08
  const grandTotal = subtotal + overhead + profit

  const csiBreakdown: Record<string, number> = {}
  for (const item of activeItems) {
    const div = (item.csi_division || '01').slice(0, 2)
    const cost =
      (Number(item.quantity) || 0) *
      ((Number(item.unit_material_cost) || 0) +
        (Number(item.unit_labor_cost) || 0) +
        (Number(item.unit_equipment_cost) || 0))
    csiBreakdown[div] = (csiBreakdown[div] || 0) + cost
  }

  const { error: updateError } = await supabase
    .from('takeoffs')
    .update({
      total_material: totalMaterial,
      total_labor: totalLabor,
      total_equipment: totalEquipment,
      subtotal,
      total_overhead: overhead,
      total_profit: profit,
      grand_total: grandTotal,
      csi_breakdown: csiBreakdown,
    })
    .eq('id', takeoffId)
    .eq('tenant_id', tenantId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    total_material: totalMaterial,
    total_labor: totalLabor,
    total_equipment: totalEquipment,
    subtotal,
    total_overhead: overhead,
    total_profit: profit,
    grand_total: grandTotal,
    csi_breakdown: csiBreakdown,
  })
}
