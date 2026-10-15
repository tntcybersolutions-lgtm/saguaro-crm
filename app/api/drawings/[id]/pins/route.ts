import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getUser } from '@/lib/supabase-server'
import { requirePermission } from '@/lib/permissions';
import type { Database } from '@/lib/database.types'

export const dynamic = 'force-dynamic'

// Record-linked pins on a drawing. Keyed by drawing_id (= drawings.id).
// A pin may link to an RFI or Punch item (entity_type/entity_id, plus the
// dedicated rfi_id / punch_item_id columns) or stand alone as a note.
//
// ENTITY VOCABULARY (B1 contract): canonical entity_type for punch is
// 'punch_item'. Legacy writers sent 'punch' — normalize on write, accept both
// spellings on read forever.

type PinInsert = Database['public']['Tables']['drawing_pins']['Insert'];
import { apiError } from '@/lib/api-error';
import { pinEntityFor, toolForPin } from '@/lib/drawing-revisions';
import { itemTool } from '@/lib/items/registry';
import { viewableTools } from '@/lib/items/server';

/** 'punch' → 'punch_item'; everything else passes through. */
function normalizeEntityType(et: unknown): string | null {
  if (!et || typeof et !== 'string') return null
  return et === 'punch' ? 'punch_item' : et
}

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
    console.error('[drawing pins GET] failed:', msg)
    return apiError('drawings/id/pins', e);
  }
}

// POST /api/drawings/{id}/pins
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  const { id } = await params

  try {
    const body = await req.json()
    const { x_pct, y_pct, entity_type, entity_id, title, description, color, priority, page_number } = body
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
    if (!drawing || !drawing.project_id) {
      return NextResponse.json({ error: 'Drawing not found' }, { status: 404 })
    }

    const x = Math.min(1, Math.max(0, Number(x_pct) || 0))
    const y = Math.min(1, Math.max(0, Number(y_pct) || 0))
    const et = normalizeEntityType(typeof entity_type === 'string' ? pinEntityFor(entity_type) : entity_type)
    // A pin that points at an item must point at a real one on this job that this person can see.
    if (entity_id) {
      const tool = itemTool(toolForPin(et))
      if (!tool) return NextResponse.json({ error: 'That kind of item cannot be pinned.' }, { status: 400 })
      let q = db.from(tool.table as never).select('id, project_id').eq('id', entity_id).eq('tenant_id', user.tenantId)
      if (tool.hasDeletedAt) q = q.is('deleted_at', null)
      const { data: target } = await q.maybeSingle()
      const allowed = await viewableTools(db, user, drawing.project_id)
      if (!target || (target as { project_id: string }).project_id !== drawing.project_id || !allowed.has(tool.type)) {
        return NextResponse.json({ error: `${tool.noun} not found on this job` }, { status: 404 })
      }
    } else if (!String(title || description || '').trim()) {
      return NextResponse.json({ error: 'Pick an item to pin or write a note.' }, { status: 400 })
    }
    const page = Number(page_number)
    const isPunch = et === 'punch_item'

    const row: PinInsert = {
      tenant_id: user.tenantId,
      project_id: drawing.project_id,
      drawing_id: id,
      x, y, // legacy NOT NULL columns — mirror the normalized values
      x_pct: x,
      y_pct: y,
      page_number: Number.isFinite(page) && page >= 1 ? Math.floor(page) : null,
      // Canonical pin_type for punch pins is 'punch' (entity_type stays 'punch_item').
      pin_type: isPunch ? 'punch' : (et || 'note'),
      entity_type: et,
      entity_id: entity_id || null,
      rfi_id: et === 'rfi' ? entity_id : null,
      punch_item_id: isPunch ? entity_id : null,
      title: title || null,
      description: description || null,
      color: color || '#FFE600',
      priority: priority || 'normal',
      status: 'open',
      created_by: user.id,
    }

    const { data, error } = await db.from('drawing_pins').insert(row).select().single()
    if (error) throw error
    return NextResponse.json({ pin: data })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[drawing pins POST] failed:', msg)
    return apiError('drawings/id/pins', e);
  }
}

// DELETE /api/drawings/{id}/pins?pinId=...
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  const { id } = await params

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
    console.error('[drawing pins DELETE] failed:', msg)
    return apiError('drawings/id/pins', e);
  }
}
