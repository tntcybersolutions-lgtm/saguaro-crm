import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/**
 * Single Potential Change Order. PCOs are change_orders rows with
 * change_type='pco'; see ../route.ts for the storage shape. Updatable PCO
 * fields are merged back into the line_items.pco jsonb blob.
 *
 * Caller: app/field/change-orders/page.tsx → convertPCOtoCO()
 *   PUT { status: 'converted' }
 * Task contract also asks for PATCH/DELETE; PUT and PATCH share a body shape.
 */

type Row = Record<string, unknown>;

function rowToPco(r: Row) {
  const meta = ((r.line_items as Row) || {}) as Row;
  const pco = (meta.pco as Row) || {};
  const amount = Number(r.amount) || 0;
  return {
    id: r.id,
    pco_number: (pco.pco_number as number) ?? (r.co_number as number) ?? undefined,
    title: r.title ?? '',
    description: r.description ?? '',
    reason: r.reason ?? '',
    estimated_min: (pco.estimated_min as number) ?? amount,
    estimated_max: (pco.estimated_max as number) ?? amount,
    status: r.status ?? 'identified',
    impacted_scope: (pco.impacted_scope as string) ?? (r.scope_of_change as string) ?? '',
    photos: (pco.photos as string[]) ?? [],
    pricing_history: (pco.pricing_history as unknown[]) ?? [],
    negotiation_notes: (pco.negotiation_notes as unknown[]) ?? [],
    created_at: r.created_at,
    converted_co_id: (pco.converted_co_id as string) ?? undefined,
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string; id: string }> }) {
  const { projectId, id } = await params;
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = createServerClient();
    const { data, error } = await db
      .from('change_orders')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .eq('project_id', projectId)
      .single();
    if (error) throw error;
    return NextResponse.json({ potential_change_order: rowToPco(data as Row), data });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}

async function applyUpdate(req: NextRequest, projectId: string, id: string) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body */ }

  try {
    const db = createServerClient();

    // Load current row to merge the jsonb pco blob.
    const { data: current } = await db
      .from('change_orders')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .eq('project_id', projectId)
      .single();
    if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const meta = (((current as Row).line_items as Row) || {}) as Row;
    const pco = { ...((meta.pco as Row) || {}) };

    const patch: Row = {};
    if (body.title !== undefined) patch.title = body.title;
    if (body.description !== undefined) patch.description = body.description;
    if (body.reason !== undefined) patch.reason = body.reason;
    if (body.status !== undefined) patch.status = body.status;
    if (body.impacted_scope !== undefined) {
      patch.scope_of_change = body.impacted_scope;
      patch.notes = body.impacted_scope;
      pco.impacted_scope = body.impacted_scope;
    }
    if (body.estimated_min !== undefined) pco.estimated_min = Number(body.estimated_min) || 0;
    if (body.estimated_max !== undefined) pco.estimated_max = Number(body.estimated_max) || 0;
    if (body.estimated_min !== undefined || body.estimated_max !== undefined) {
      patch.amount = ((Number(pco.estimated_min) || 0) + (Number(pco.estimated_max) || 0)) / 2;
    }
    if (body.pricing_history !== undefined) pco.pricing_history = body.pricing_history;
    if (body.negotiation_notes !== undefined) pco.negotiation_notes = body.negotiation_notes;
    if (body.converted_co_id !== undefined) pco.converted_co_id = body.converted_co_id;
    if (body.photos !== undefined) pco.photos = body.photos;

    patch.line_items = { ...meta, pco };

    const { data, error } = await db
      .from('change_orders')
      .update(patch)
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .eq('project_id', projectId)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ potential_change_order: rowToPco(data as Row), success: true });
  } catch (e) {
    return apiError('projects/[projectId]/potential-change-orders/[id] GET', e);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ projectId: string; id: string }> }) {
  const { projectId, id } = await params;
  const g = await requirePermission(req, 'Change Orders', 'Edit', { projectId });
  if (!g.ok) return g.res;
  return applyUpdate(req, projectId, id);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ projectId: string; id: string }> }) {
  const { projectId, id } = await params;
  const g = await requirePermission(req, 'Change Orders', 'Edit', { projectId });
  if (!g.ok) return g.res;
  return applyUpdate(req, projectId, id);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ projectId: string; id: string }> }) {
  const { projectId, id } = await params;
  const g = await requirePermission(req, 'Change Orders', 'Full', { projectId });
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const db = createServerClient();
    const { error } = await db
      .from('change_orders')
      .delete()
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .eq('project_id', projectId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('projects/[projectId]/potential-change-orders/[id] DELETE', e);
  }
}
