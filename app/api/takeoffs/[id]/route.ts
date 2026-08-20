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

    const { data: takeoff } = await supabase
      .from('takeoffs').select('*')
      .eq('id', params.id).eq('tenant_id', tenantId).single()

    if (!takeoff) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data: items, count } = await supabase
      .from('takeoff_line_items').select('*', { count: 'exact' })
      .eq('takeoff_id', params.id).eq('tenant_id', tenantId)
      .order('csi_division').order('sort_order')

    return NextResponse.json({ success: true, data: { ...takeoff, line_items: items || [], item_count: count || 0 } })
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

    // Cascade deletes line items via FK
    const { error } = await supabase
      .from('takeoffs').delete()
      .eq('id', params.id).eq('tenant_id', tenantId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e instanceof Error ? e.message : 'Failed') }, { status: 500 })
  }
}
