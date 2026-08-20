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
    .from('takeoff_scope_gaps')
    .select('*')
    .eq('takeoff_id', takeoffId)
    .eq('tenant_id', tenantId)
    .order('severity')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data || [])
}
