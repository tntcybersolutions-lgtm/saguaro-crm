import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import type { Database } from '@/lib/database.types';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

// Quick pin drop (field mode). ENTITY VOCABULARY (B1 contract): canonical
// entity_type for punch is 'punch_item' — legacy 'punch' is normalized on
// write; readers accept both spellings forever.

type PinInsert = Database['public']['Tables']['drawing_pins']['Insert'];

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }

  const projectId = (body.project_id || body.projectId) as string | undefined;
  const drawingId = (body.drawing_id || body.drawingId) as string | undefined;
  if (!projectId || !drawingId) {
    return NextResponse.json({ error: 'project_id and drawing_id are required' }, { status: 400 });
  }

  const rawEt = body.entity_type || body.entityType;
  const et = typeof rawEt === 'string' && rawEt ? (rawEt === 'punch' ? 'punch_item' : rawEt) : null;
  const entityId = (body.entity_id || body.entityId || null) as string | null;
  const x = Number(body.x_pct) || 0;
  const y = Number(body.y_pct) || 0;
  const page = Number(body.page_number ?? body.pageNumber);

  const row: PinInsert = {
    tenant_id: user.tenantId,
    project_id: projectId,
    drawing_id: drawingId,
    x, y, // legacy NOT NULL columns — mirror the normalized values
    x_pct: x,
    y_pct: y,
    page_number: Number.isFinite(page) && page >= 1 ? Math.floor(page) : null,
    title: (body.title as string) || '',
    notes: (body.note || body.notes || '') as string,
    pin_type: (body.category as string) || (et === 'punch_item' ? 'punch' : et || 'Other'),
    entity_type: et,
    entity_id: entityId,
    rfi_id: et === 'rfi' ? entityId : null,
    punch_item_id: et === 'punch_item' ? entityId : null,
    created_by: user.id,
  };

  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('drawing_pins')
      .insert(row)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, pin: data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[drawings/pin] insert failed:', msg);
    return apiError('drawings/pin', err, '[drawings/pin] ${msg}');
  }
}
