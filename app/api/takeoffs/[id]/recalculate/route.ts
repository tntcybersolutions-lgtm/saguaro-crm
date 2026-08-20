import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { recalculateTakeoffTotals } from '@/lib/takeoff-engine'

export const dynamic = 'force-dynamic'

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

    const markup = {
      markup_labor_pct:     Number(body.markup_labor_pct)     || 15,
      markup_material_pct:  Number(body.markup_material_pct)  || 10,
      markup_equipment_pct: Number(body.markup_equipment_pct) || 10,
      overhead_pct:         Number(body.overhead_pct)         || 12,
      profit_pct:           Number(body.profit_pct)           || 8,
    }

    // Get project sq footage if available
    const { data: takeoff } = await supabase
      .from('takeoffs')
      .select('projects(square_footage)')
      .eq('id', params.id).eq('tenant_id', tenantId).single()

    const sqFt = (takeoff?.projects as unknown as Record<string, unknown>)?.square_footage as number | null

    const totals = await recalculateTakeoffTotals(supabase, params.id, tenantId, markup, sqFt)

    return NextResponse.json({ success: true, data: totals })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e instanceof Error ? e.message : 'Failed') }, { status: 500 })
  }
}
