import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getUser } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const { pin_type, x_pct, y_pct, title, description, rfi_id, punch_item_id, color, priority } = body

    if (!pin_type) return NextResponse.json({ error: 'Missing pin_type' }, { status: 400 })
    if (x_pct === undefined || y_pct === undefined) {
      return NextResponse.json({ error: 'Missing x_pct or y_pct' }, { status: 400 })
    }

    const db = createServerClient()

    const { data: sheet, error: sheetErr } = await db
      .from('drawing_sheets')
      .select('project_id')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single()

    if (sheetErr || !sheet) return NextResponse.json({ error: 'Sheet not found' }, { status: 404 })

    const { data: pin, error } = await db
      .from('drawing_pins')
      .insert({
        drawing_sheet_id: id,
        project_id: sheet.project_id,
        tenant_id: user.tenantId,
        pin_type,
        x_pct,
        y_pct,
        title: title || null,
        description: description || null,
        rfi_id: rfi_id || null,
        punch_item_id: punch_item_id || null,
        color: color || '#d4a017',
        priority: priority || 'normal',
        status: 'open',
        created_by: user.id,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ data: pin })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const url = new URL(req.url)
    const pinId = url.searchParams.get('pinId')
    if (!pinId) return NextResponse.json({ error: 'Missing pinId' }, { status: 400 })

    const db = createServerClient()

    const { error } = await db
      .from('drawing_pins')
      .delete()
      .eq('id', pinId)
      .eq('drawing_sheet_id', id)
      .eq('tenant_id', user.tenantId)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
