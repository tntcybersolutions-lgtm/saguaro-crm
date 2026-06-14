import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getUser } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

// Record-linked pins on a drawing. Keyed by drawing_id (= drawings.id).
// A pin may link to an RFI or Punch item (entity_type/entity_id, plus the
// dedicated rfi_id / punch_item_id columns) or stand alone as a note.

// GET /api/drawings/{id}/pins
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUser(req)
  if (!user) return NextResponse.json({ pins: [] }, { status: 401 })

  try {
    const db = createServerClient()
    const { data, error } = await db
      .from('drawing_pins')
      .select('*')
      .eq('drawing_id', id)
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: true })
    if (error) throw error
    return NextResponse.json({ pins: data || [] })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg, pins: [] }, { status: 500 })
  }
}

// POST /api/drawings/{id}/pins
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const { x_pct, y_pct, entity_type, entity_id, title, description, color, priority } = body
    if (x_pct === undefined || y_pct === undefined) {
      return NextResponse.json({ error: 'x_pct and y_pct required' }, { status: 400 })
    }

    const db = createServerClient()
    const { data: drawing } = await db
      .from('drawings')
      .select('project_id')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single()
    if (!drawing) return NextResponse.json({ error: 'Drawing not found' }, { status: 404 })

    const x = Number(x_pct) || 0
    const y = Number(y_pct) || 0
    const et = entity_type || null

    const row: Record<string, unknown> = {
      tenant_id: user.tenantId,
      project_id: drawing.project_id,
      drawing_id: id,
      x, y, // legacy NOT NULL columns — mirror the normalized values
      x_pct: x,
      y_pct: y,
      pin_type: et || 'note',
      entity_type: et,
      entity_id: entity_id || null,
      rfi_id: et === 'rfi' ? entity_id : null,
      punch_item_id: et === 'punch' ? entity_id : null,
      title: title || null,
      description: description || null,
      color: color || '#d4a017',
      priority: priority || 'normal',
      status: 'open',
      created_by: user.id,
    }

    const { data, error } = await db.from('drawing_pins').insert(row).select().single()
    if (error) throw error
    return NextResponse.json({ pin: data })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// DELETE /api/drawings/{id}/pins?pinId=...
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const pinId = new URL(req.url).searchParams.get('pinId')
    if (!pinId) return NextResponse.json({ error: 'pinId required' }, { status: 400 })

    const db = createServerClient()
    const { error } = await db
      .from('drawing_pins')
      .delete()
      .eq('id', pinId)
      .eq('drawing_id', id)
      .eq('tenant_id', user.tenantId)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
