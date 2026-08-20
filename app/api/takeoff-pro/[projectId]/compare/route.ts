import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helper'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface LineItem {
  csi_division: string | null
  csi_code: string | null
  description: string | null
  quantity: number | null
  unit: string | null
  total_material: number | null
  total_labor: number | null
}

interface AddedOrRemoved {
  description: string
  csi_division: string
  quantity: number
  unit: string
  total: number
}

interface ChangedItem {
  description: string
  csi_division: string
  base_qty: number
  revised_qty: number
  unit: string
  base_total: number
  revised_total: number
  delta: number
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId, userId } = auth
  const { projectId } = await params

  const { baseTakeoffId, revisedTakeoffId, revisionLabel } =
    (await req.json()) as {
      baseTakeoffId?: string
      revisedTakeoffId?: string
      revisionLabel?: string
    }

  if (!baseTakeoffId || !revisedTakeoffId) {
    return NextResponse.json(
      { error: 'baseTakeoffId and revisedTakeoffId required' },
      { status: 400 },
    )
  }
  if (baseTakeoffId === revisedTakeoffId) {
    return NextResponse.json(
      { error: 'Select two different takeoffs' },
      { status: 400 },
    )
  }

  const [baseItemsRes, revisedItemsRes, baseTakeoffRes, revisedTakeoffRes] =
    await Promise.all([
      supabase
        .from('takeoff_line_items')
        .select('csi_division, csi_code, description, quantity, unit, total_material, total_labor')
        .eq('takeoff_id', baseTakeoffId)
        .eq('tenant_id', tenantId),
      supabase
        .from('takeoff_line_items')
        .select('csi_division, csi_code, description, quantity, unit, total_material, total_labor')
        .eq('takeoff_id', revisedTakeoffId)
        .eq('tenant_id', tenantId),
      supabase
        .from('takeoffs')
        .select('grand_total')
        .eq('id', baseTakeoffId)
        .eq('tenant_id', tenantId)
        .single(),
      supabase
        .from('takeoffs')
        .select('grand_total')
        .eq('id', revisedTakeoffId)
        .eq('tenant_id', tenantId)
        .single(),
    ])

  const baseItems: LineItem[] = (baseItemsRes.data as LineItem[] | null) || []
  const revisedItems: LineItem[] =
    (revisedItemsRes.data as LineItem[] | null) || []

  const keyFor = (i: LineItem) => `${i.csi_code || ''}:${i.description || ''}`

  const baseMap = new Map<string, LineItem>(
    baseItems.map((i) => [keyFor(i), i]),
  )
  const revisedMap = new Map<string, LineItem>(
    revisedItems.map((i) => [keyFor(i), i]),
  )

  const added: AddedOrRemoved[] = []
  const removed: AddedOrRemoved[] = []
  const changed: ChangedItem[] = []

  for (const [key, rItem] of revisedMap) {
    const bItem = baseMap.get(key)
    const rTotal =
      (Number(rItem.total_material) || 0) + (Number(rItem.total_labor) || 0)
    if (!bItem) {
      added.push({
        description: rItem.description || '',
        csi_division: rItem.csi_division || '01',
        quantity: Number(rItem.quantity) || 0,
        unit: rItem.unit || '',
        total: rTotal,
      })
    } else {
      const bTotal =
        (Number(bItem.total_material) || 0) + (Number(bItem.total_labor) || 0)
      const bQty = Number(bItem.quantity) || 0
      const rQty = Number(rItem.quantity) || 0
      if (Math.abs(rQty - bQty) > 0.01 || Math.abs(rTotal - bTotal) > 1) {
        changed.push({
          description: rItem.description || '',
          csi_division: rItem.csi_division || '01',
          base_qty: bQty,
          revised_qty: rQty,
          unit: rItem.unit || '',
          base_total: bTotal,
          revised_total: rTotal,
          delta: rTotal - bTotal,
        })
      }
    }
  }

  for (const [key, bItem] of baseMap) {
    if (!revisedMap.has(key)) {
      removed.push({
        description: bItem.description || '',
        csi_division: bItem.csi_division || '01',
        quantity: Number(bItem.quantity) || 0,
        unit: bItem.unit || '',
        total:
          (Number(bItem.total_material) || 0) +
          (Number(bItem.total_labor) || 0),
      })
    }
  }

  const baseGrand = Number(baseTakeoffRes.data?.grand_total) || 0
  const revisedGrand = Number(revisedTakeoffRes.data?.grand_total) || 0
  const costDelta = revisedGrand - baseGrand

  const { data: revision } = await supabase
    .from('takeoff_revisions')
    .insert({
      tenant_id: tenantId,
      project_id: projectId,
      base_takeoff_id: baseTakeoffId,
      revised_takeoff_id: revisedTakeoffId,
      revision_label: revisionLabel || 'New Revision',
      items_added: added,
      items_removed: removed,
      items_changed: changed,
      cost_delta: costDelta,
      change_summary: `${added.length} items added, ${removed.length} items removed, ${changed.length} items changed. Cost ${costDelta >= 0 ? 'increased' : 'decreased'} by $${Math.abs(costDelta).toLocaleString()}.`,
      created_by: userId,
    })
    .select()
    .single()

  return NextResponse.json({
    revision,
    summary: {
      added: added.length,
      removed: removed.length,
      changed: changed.length,
      costDelta,
    },
    details: { added, removed, changed },
  })
}
