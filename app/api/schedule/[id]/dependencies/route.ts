import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helper'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId } = auth
  const { id } = await params

  const { data, error } = await supabase
    .from('schedule_task_dependencies')
    .select('id, predecessor_id, successor_id, dependency_type, lag_days')
    .or(`predecessor_id.eq.${id},successor_id.eq.${id}`)
    .eq('tenant_id', tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ dependencies: data || [] })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId } = auth
  const { id } = await params

  const { predecessor_id, dependency_type = 'finish_to_start', lag_days = 0 } = await req.json()
  if (!predecessor_id) return NextResponse.json({ error: 'predecessor_id required' }, { status: 400 })

  const { data, error } = await supabase
    .from('schedule_task_dependencies')
    .insert({ tenant_id: tenantId, predecessor_id, successor_id: id, dependency_type, lag_days })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ dependency: data })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId } = auth
  const { id } = await params

  const { searchParams } = new URL(req.url)
  const depId = searchParams.get('dep_id')
  if (!depId) return NextResponse.json({ error: 'dep_id required' }, { status: 400 })

  const { error } = await supabase
    .from('schedule_task_dependencies')
    .delete()
    .eq('id', depId)
    .eq('tenant_id', tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
