import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles').select('tenant_id').eq('id', user.id).single()
    if (!profile?.tenant_id) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    const tenantId = profile.tenant_id
    const { searchParams } = new URL(req.url)
    const division   = searchParams.get('division')
    const search     = searchParams.get('search')
    const page       = parseInt(searchParams.get('page') || '1')
    const pageSize   = parseInt(searchParams.get('pageSize') || '100')

    let query = supabase
      .from('takeoff_line_items').select('*', { count: 'exact' })
      .eq('takeoff_id', params.id).eq('tenant_id', tenantId)

    if (division) query = query.eq('csi_division', division)
    if (search)   query = query.ilike('description', `%${search}%`)

    const { data, count } = await query
      .order('csi_division').order('sort_order')
      .range((page - 1) * pageSize, page * pageSize - 1)

    return NextResponse.json({ success: true, data: data || [], total: count || 0, page, pageSize })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e instanceof Error ? e.message : 'Failed') }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles').select('tenant_id').eq('id', user.id).single()
    if (!profile?.tenant_id) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    const tenantId = profile.tenant_id
    const body = await req.json()
    const { itemId, ...updates } = body

    if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 })

    // Strip generated columns — they can't be updated directly
    const { total_material, total_labor, total_equipment, total_sub, adjusted_quantity, ...safeUpdates } = updates

    const { data, error } = await supabase
      .from('takeoff_line_items')
      .update({ ...safeUpdates, manually_edited: true })
      .eq('id', itemId).eq('takeoff_id', params.id).eq('tenant_id', tenantId)
      .select().single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, data })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e instanceof Error ? e.message : 'Failed') }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles').select('tenant_id, id').eq('id', user.id).single()
    if (!profile?.tenant_id) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    const tenantId = profile.tenant_id
    const body = await req.json()

    const { data: takeoff } = await supabase
      .from('takeoffs').select('project_id').eq('id', params.id).eq('tenant_id', tenantId).single()
    if (!takeoff) return NextResponse.json({ error: 'Takeoff not found' }, { status: 404 })

    const { data, error } = await supabase
      .from('takeoff_line_items')
      .insert({
        takeoff_id:        params.id,
        tenant_id:         tenantId,
        project_id:        takeoff.project_id,
        csi_division:      body.csi_division || null,
        csi_code:          body.csi_code || null,
        description:       body.description || 'New Item',
        quantity:          Number(body.quantity) || 0,
        unit:              body.unit || 'LS',
        waste_factor_pct:  Number(body.waste_factor_pct) || 0,
        unit_material_cost:Number(body.unit_material_cost) || 0,
        unit_labor_cost:   Number(body.unit_labor_cost) || 0,
        unit_equipment_cost:Number(body.unit_equipment_cost) || 0,
        unit_sub_cost:     Number(body.unit_sub_cost) || 0,
        ai_extracted:      false,
        manually_edited:   true,
        sort_order:        body.sort_order || 9999,
        category:          body.category || null,
        notes:             body.notes || null,
      })
      .select().single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e instanceof Error ? e.message : 'Failed') }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles').select('tenant_id').eq('id', user.id).single()
    if (!profile?.tenant_id) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    const tenantId = profile.tenant_id
    const { searchParams } = new URL(req.url)
    const itemId = searchParams.get('itemId')
    if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 })

    const { error } = await supabase
      .from('takeoff_line_items').delete()
      .eq('id', itemId).eq('takeoff_id', params.id).eq('tenant_id', tenantId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e instanceof Error ? e.message : 'Failed') }, { status: 500 })
  }
}
