/**
 * DEPRECATED — legacy consolidated-markup route, kept only for existing mobile
 * clients. New code MUST use the canonical per-markup API:
 *   app/api/projects/[projectId]/drawings/markups/route.ts        (collection)
 *   app/api/projects/[projectId]/drawings/markups/[id]/route.ts   (single + comments)
 *
 * Legacy shape: ONE drawing_markups row per drawing with markup_type 'freehand'
 * and data = a raw stroke array in view pixels (no `space` field). This route
 * keeps that read/write contract working, but its GET now ALSO returns every
 * per-markup canonical row (`markups`) so upgraded viewers can merge both.
 * `sheetId` here is a drawings.id.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getUser } from '@/lib/supabase-server'
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic'

type MarkupRow = { id: string; markup_type: string | null; data: unknown; updated_at: string | null }

/** The legacy consolidated blob is the only row whose data is a bare array. */
function isLegacyConsolidated(m: { markup_type: string | null; data: unknown }): boolean {
  return m.markup_type === 'freehand' && Array.isArray(m.data)
}

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

    if (error) throw error
    const rows = (data || []) as MarkupRow[]

    // Legacy consolidated stroke blob (newest wins) — what old mobile expects.
    const legacy = rows.find(isLegacyConsolidated)

    return NextResponse.json({
      markup_data: (legacy?.data as unknown) || [],
      // Merge view: every per-markup row (canonical + legacy) for new readers.
      markups: rows,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[legacy markup GET] failed:', msg)
    return apiError('drawings/markup/sheetId', e);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ sheetId: string }> }) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  const { sheetId } = await params

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
    if (!drawing || !drawing.project_id) {
      return NextResponse.json({ error: 'Drawing not found' }, { status: 404 })
    }

    // Upsert the LEGACY CONSOLIDATED row only — the one freehand row whose data
    // is a bare stroke array. Canonical per-markup rows on the same drawing must
    // never be matched or overwritten here.
    const { data: candidates, error: findErr } = await db
      .from('drawing_markups')
      .select('id, markup_type, data, updated_at')
      .eq('drawing_id', sheetId)
      .eq('tenant_id', user.tenantId)
      .eq('markup_type', 'freehand')
      .order('updated_at', { ascending: false })
    if (findErr) throw findErr
    const existing = ((candidates || []) as MarkupRow[]).find(isLegacyConsolidated)

    let data, error
    if (existing) {
      const result = await db
        .from('drawing_markups')
        .update({ data: body.markup_data, updated_by: user.id, updated_at: new Date().toISOString() })
        .eq('tenant_id', user.tenantId)
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
    console.error('[legacy markup POST] failed:', msg)
    return apiError('drawings/markup/sheetId', e);
  }
}
