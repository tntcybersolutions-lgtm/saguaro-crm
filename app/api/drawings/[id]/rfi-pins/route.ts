import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helper'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId } = auth
  const { id } = await params

  const { data, error } = await supabase
    .from('rfi_drawing_pins')
    .select('id, rfi_id, x_coord, y_coord, rfis(rfi_number, title)')
    .eq('drawing_id', id)
    .eq('tenant_id', tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const pins = (data || []).map((p: Record<string, unknown>) => ({
    id: p.id,
    rfi_id: p.rfi_id,
    x_coord: p.x_coord,
    y_coord: p.y_coord,
    rfi_number: (p.rfis as Record<string, string>)?.rfi_number || '',
    title: (p.rfis as Record<string, string>)?.title || '',
  }))

  return NextResponse.json({ pins })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId } = auth
  const { id } = await params

  const { rfi_id, x_coord, y_coord } = await req.json()

  if (!rfi_id) return NextResponse.json({ error: 'rfi_id required' }, { status: 400 })

  const { data, error } = await supabase
    .from('rfi_drawing_pins')
    .insert({ tenant_id: tenantId, drawing_id: id, rfi_id, x_coord, y_coord })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ pin: data })
}
