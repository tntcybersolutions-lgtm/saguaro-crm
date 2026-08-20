import { NextRequest, NextResponse } from 'next/server'
import { getUser, createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = createServerClient()

  try {
    const { data } = await db
      .from('equipment_rentals')
      .select('*')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .order('mobilization_date', { ascending: false })

    const items = data || []
    const summary = {
      total_items: items.length,
      on_site: items.filter((e: Record<string, unknown>) => e.status === 'on_site').length,
      planned: items.filter((e: Record<string, unknown>) => e.status === 'planned').length,
      returned: items.filter((e: Record<string, unknown>) => e.status === 'returned').length,
      estimated_total: items.reduce((s: number, e: Record<string, unknown>) => {
        const rate = Number(e.rate_amount) || 0
        const days = Number(e.estimated_duration_days) || 0
        const rateType = e.rate_type as string
        const est = rateType === 'daily' ? rate * days
          : rateType === 'weekly' ? rate * Math.ceil(days / 7)
          : rateType === 'monthly' ? rate * Math.ceil(days / 30)
          : rate
        return s + est
      }, 0),
      actual_total: items.filter((e: Record<string, unknown>) => e.actual_total_cost)
        .reduce((s: number, e: Record<string, unknown>) => s + (Number(e.actual_total_cost) || 0), 0),
      on_site_daily_cost: items
        .filter((e: Record<string, unknown>) => e.status === 'on_site' && e.rate_type === 'daily')
        .reduce((s: number, e: Record<string, unknown>) => s + (Number(e.rate_amount) || 0), 0),
    }

    return NextResponse.json({ data: items, summary })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = createServerClient()

  try {
    const body = await req.json()
    if (!body.equipment_name) return NextResponse.json({ error: 'equipment_name required' }, { status: 400 })

    const { data, error } = await db.from('equipment_rentals').insert({
      project_id: projectId,
      tenant_id: user.tenantId,
      equipment_name: body.equipment_name,
      equipment_type: body.equipment_type || 'other',
      make: body.make || null,
      model: body.model || null,
      year: body.year || null,
      unit_id: body.unit_id || null,
      vendor_name: body.vendor_name || null,
      vendor_contact: body.vendor_contact || null,
      vendor_phone: body.vendor_phone || null,
      vendor_email: body.vendor_email || null,
      mobilization_date: body.mobilization_date || null,
      demobilization_date: body.demobilization_date || null,
      rate_type: body.rate_type || 'daily',
      rate_amount: body.rate_amount || 0,
      estimated_duration_days: body.estimated_duration_days || null,
      csi_division: body.csi_division || null,
      status: body.status || 'planned',
      po_number: body.po_number || null,
      notes: body.notes || null,
    }).select().single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // If on_site and csi_division set: add cost_entry to budget
    if (data && body.status === 'on_site' && body.csi_division) {
      await db.from('cost_entries').insert({
        project_id: projectId,
        tenant_id: user.tenantId,
        amount: Number(body.rate_amount) || 0,
        entry_date: body.mobilization_date || new Date().toISOString().split('T')[0],
        entry_type: 'direct_cost',
        vendor_name: body.vendor_name || 'Equipment Rental',
        description: `Equipment: ${body.equipment_name}`,
        csi_division: body.csi_division,
        approved: true,
        approved_at: new Date().toISOString(),
      })
    }

    return NextResponse.json({ data })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// PATCH / DELETE operate on the flat `equipment` table by id.
// The dynamic segment is named `projectId` for historical reasons, but for these
// methods the caller passes an equipment row id (see /api/equipment page client).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId: equipmentId } = await params
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const updates = await req.json()
    const db = createServerClient()
    const { data, error } = await db
      .from('equipment')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', equipmentId)
      .eq('tenant_id', user.tenantId)
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ equipment: data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId: equipmentId } = await params
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const db = createServerClient()
    await db.from('equipment').delete().eq('id', equipmentId).eq('tenant_id', user.tenantId)
    return NextResponse.json({ success: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
