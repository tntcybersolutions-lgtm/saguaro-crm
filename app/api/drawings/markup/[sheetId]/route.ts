import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getUser } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

// Markup overlay for a drawing. Keyed by drawing_id (= drawings.id) and stored
// in drawing_markups.data (jsonb). One markup record per drawing (upsert).
// `sheetId` here is a drawings.id.
export async function GET(req: NextRequest, { params }: { params: Promise<{ sheetId: string }> }) {
  const { sheetId } = await params
  const user = await getUser(req)
  if (!user) return NextResponse.json({ markup_data: [] }, { status: 401 })

  try {
    const db = createServerClient()
    const { data, error } = await db
      .from('drawing_markups')
      .select('*')
      .eq('drawing_id', sheetId)
      .eq('tenant_id', user.tenantId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error
    return NextResponse.json({ markup_data: (data?.data as unknown) || [] })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg, markup_data: [] }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ sheetId: string }> }) {
  const { sheetId } = await params
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    if (body.markup_data === undefined) {
      return NextResponse.json({ error: 'markup_data required' }, { status: 400 })
    }

    const db = createServerClient()

    // Resolve project_id from the drawing.
    const { data: drawing } = await db
      .from('drawings')
      .select('project_id')
      .eq('id', sheetId)
      .eq('tenant_id', user.tenantId)
      .single()
    if (!drawing) return NextResponse.json({ error: 'Drawing not found' }, { status: 404 })

    // Upsert — one markup record per drawing.
    const { data: existing } = await db
      .from('drawing_markups')
      .select('id')
      .eq('drawing_id', sheetId)
      .eq('tenant_id', user.tenantId)
      .maybeSingle()

    let data, error
    if (existing) {
      const result = await db
        .from('drawing_markups')
        .update({ data: body.markup_data, updated_by: user.id, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select()
        .single()
      data = result.data
      error = result.error
    } else {
      const result = await db
        .from('drawing_markups')
        .insert({
          tenant_id: user.tenantId,
          drawing_id: sheetId,
          project_id: drawing.project_id,
          markup_type: 'freehand',
          data: body.markup_data,
          created_by: user.id,
          updated_by: user.id,
        })
        .select()
        .single()
      data = result.data
      error = result.error
    }

    if (error) throw error
    return NextResponse.json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
