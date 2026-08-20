import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helper'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  _ctx: { params: Promise<{ projectId: string }> },
) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId } = auth

  const takeoffId = new URL(req.url).searchParams.get('takeoffId')
  if (!takeoffId) {
    return NextResponse.json({ error: 'takeoffId required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('takeoff_line_items')
    .select('*')
    .eq('takeoff_id', takeoffId)
    .eq('tenant_id', tenantId)
    .order('csi_division')
    .order('sort_order')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data || [])
}

type PostBody = {
  takeoffId?: string
  csi_division?: string
  csi_code?: string
  description?: string
  scope_notes?: string
  quantity?: number
  unit?: string
  waste_factor_pct?: number
  unit_material_cost?: number
  unit_labor_cost?: number
  unit_equipment_cost?: number
  page_reference?: string
  manually_edited?: boolean
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId } = auth
  const { projectId } = await params
  const body = (await req.json()) as PostBody

  if (!body.takeoffId) {
    return NextResponse.json({ error: 'takeoffId required' }, { status: 400 })
  }

  const qty = Number(body.quantity) || 0
  const mat = Number(body.unit_material_cost) || 0
  const lab = Number(body.unit_labor_cost) || 0
  const eq = Number(body.unit_equipment_cost) || 0
  const waste = Number(body.waste_factor_pct) ?? 5

  const { data, error } = await supabase
    .from('takeoff_line_items')
    .insert({
      takeoff_id: body.takeoffId,
      tenant_id: tenantId,
      project_id: projectId,
      csi_division: body.csi_division || '01',
      csi_code: body.csi_code || '',
      description: body.description || 'New item',
      scope_notes: body.scope_notes || '',
      quantity: qty,
      unit: body.unit || 'LS',
      waste_factor_pct: waste,
      adjusted_quantity: qty * (1 + waste / 100),
      unit_material_cost: mat,
      unit_labor_cost: lab,
      unit_equipment_cost: eq,
      total_material: qty * mat,
      total_labor: qty * lab,
      total_equipment: qty * eq,
      ai_confidence: 1.0,
      ai_extracted: false,
      manually_edited: true,
      page_reference: body.page_reference || '',
      sort_order: 9999,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}
