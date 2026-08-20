import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getUser } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

type Row = Record<string, unknown>
const mapOut = (r: Row) => ({
  id: r.id,
  drawing_id: r.drawing_id,
  markup_type: r.markup_type,
  markup_data: r.data ?? r.markup_data ?? {},
  color: r.color ?? '#F85149',
  text: r.text ?? null,
  page_number: r.page_number ?? 1,
  created_at: r.created_at,
})

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id: drawingId } = await params
    const db = createServerClient()

    const { data, error } = await db
      .from('drawing_markups')
      .select('*')
      .eq('drawing_id', drawingId)
      .eq('tenant_id', user.tenantId)
      .order('created_at')

    if (error) {
      if (/relation .* does not exist/i.test(error.message)) {
        return NextResponse.json({ markups: [] })
      }
      throw error
    }
    return NextResponse.json({ markups: (data || []).map(mapOut) })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id: drawingId } = await params
    const body = await req.json()
    const { markup_type, markup_data, color, text, page_number } = body

    if (!markup_type || !markup_data) {
      return NextResponse.json({ error: 'markup_type and markup_data required' }, { status: 400 })
    }

    const db = createServerClient()

    // Look up drawing to get project_id (drawing_markups requires it)
    const { data: drawing } = await db
      .from('drawings')
      .select('project_id')
      .eq('id', drawingId)
      .eq('tenant_id', user.tenantId)
      .maybeSingle()

    const { data, error } = await db
      .from('drawing_markups')
      .insert({
        tenant_id: user.tenantId,
        project_id: drawing?.project_id || null,
        drawing_id: drawingId,
        markup_type,
        data: markup_data,
        color: color || '#F85149',
        page_number: page_number || 1,
        created_by: user.id,
      })
      .select('*')
      .single()

    if (error) {
      if (/relation .* does not exist/i.test(error.message)) {
        return NextResponse.json({ error: 'drawing_markups table not provisioned' }, { status: 503 })
      }
      throw error
    }
    return NextResponse.json({ markup: mapOut(data as Row) })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id: drawingId } = await params
    const { markupId } = await req.json()

    const db = createServerClient()
    await db
      .from('drawing_markups')
      .delete()
      .eq('id', markupId)
      .eq('drawing_id', drawingId)
      .eq('tenant_id', user.tenantId)

    return NextResponse.json({ success: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
