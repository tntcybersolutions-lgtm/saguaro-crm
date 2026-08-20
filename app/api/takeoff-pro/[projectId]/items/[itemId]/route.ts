import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helper'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type PatchBody = {
  quantity?: number
  unit?: string
  unit_material_cost?: number
  unit_labor_cost?: number
  unit_equipment_cost?: number
  waste_factor_pct?: number
  description?: string
  scope_notes?: string
  is_excluded?: boolean
  manually_edited?: boolean
  total_material?: number
  total_labor?: number
  total_equipment?: number
  adjusted_quantity?: number
  csi_code?: string
  csi_division?: string
  page_reference?: string
}

const ALLOWED_FIELDS: ReadonlyArray<keyof PatchBody> = [
  'quantity',
  'unit',
  'unit_material_cost',
  'unit_labor_cost',
  'unit_equipment_cost',
  'waste_factor_pct',
  'description',
  'scope_notes',
  'is_excluded',
  'csi_code',
  'csi_division',
  'page_reference',
]

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; itemId: string }> },
) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId } = auth
  const { itemId } = await params

  const body = (await req.json()) as PatchBody
  const update: PatchBody = { manually_edited: true }
  for (const key of ALLOWED_FIELDS) {
    if (key in body) {
      ;(update as Record<string, unknown>)[key] = (body as Record<string, unknown>)[key]
    }
  }

  if (
    body.quantity !== undefined ||
    body.unit_material_cost !== undefined ||
    body.unit_labor_cost !== undefined ||
    body.unit_equipment_cost !== undefined ||
    body.waste_factor_pct !== undefined
  ) {
    const { data: item } = await supabase
      .from('takeoff_line_items')
      .select('*')
      .eq('id', itemId)
      .eq('tenant_id', tenantId)
      .single()
    if (item) {
      const qty = Number(body.quantity ?? item.quantity) || 0
      const mat = Number(body.unit_material_cost ?? item.unit_material_cost) || 0
      const lab = Number(body.unit_labor_cost ?? item.unit_labor_cost) || 0
      const eq =
        Number(body.unit_equipment_cost ?? item.unit_equipment_cost) || 0
      const waste =
        Number(body.waste_factor_pct ?? item.waste_factor_pct) || 0
      update.total_material = qty * mat
      update.total_labor = qty * lab
      update.total_equipment = qty * eq
      update.adjusted_quantity = qty * (1 + waste / 100)
    }
  }

  const { data, error } = await supabase
    .from('takeoff_line_items')
    .update(update)
    .eq('id', itemId)
    .eq('tenant_id', tenantId)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; itemId: string }> },
) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId } = auth
  const { itemId } = await params

  const { error } = await supabase
    .from('takeoff_line_items')
    .delete()
    .eq('id', itemId)
    .eq('tenant_id', tenantId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
