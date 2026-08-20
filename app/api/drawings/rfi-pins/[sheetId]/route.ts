import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helper'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sheetId: string }> }
) {
  const { sheetId } = await params
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId } = auth

  try {
    const { data, error } = await supabase
      .from('rfi_drawing_pins')
      .select('*, rfis(rfi_number, subject, status, priority)')
      .eq('drawing_sheet_id', sheetId)
      .eq('tenant_id', tenantId)

    if (error) throw error
    return NextResponse.json(data || [])
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sheetId: string }> }
) {
  const { sheetId } = await params
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId, userId } = auth

  try {
    const body = await req.json()
    if (!body.rfi_id || body.x_pct == null || body.y_pct == null) {
      return NextResponse.json({ error: 'rfi_id, x_pct, y_pct required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('rfi_drawing_pins')
      .insert({
        tenant_id: tenantId,
        rfi_id: body.rfi_id,
        drawing_sheet_id: sheetId,
        page_number: body.page_number || 1,
        x_pct: body.x_pct,
        y_pct: body.y_pct,
        created_by: userId,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ sheetId: string }> }
) {
  const { sheetId } = await params
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId } = auth

  try {
    const { searchParams } = new URL(req.url)
    const pinId = searchParams.get('pinId')
    if (!pinId) {
      return NextResponse.json({ error: 'pinId required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('rfi_drawing_pins')
      .delete()
      .eq('id', pinId)
      .eq('drawing_sheet_id', sheetId)
      .eq('tenant_id', tenantId)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
