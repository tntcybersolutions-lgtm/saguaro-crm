import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/**
 * /api/warranty-claims/[id]
 * GET    — single claim
 * PATCH  — generic field update (description/location/category->trade/priority->severity/etc.)
 * DELETE — remove a claim (called by app/field/warranty-claims/page.tsx)
 */

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('warranty_claims')
      .select('*')
      .eq('id', params.id)
      .eq('tenant_id', user.tenantId)
      .single();
    if (error) throw error;
    return NextResponse.json({ claim: data });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requirePermission(req, 'Safety', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = await req.json().catch(() => ({}));
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.description !== undefined) update.description = body.description;
    if (body.location !== undefined) update.location = body.location;
    if (body.category !== undefined) update.trade = body.category;
    if (body.priority !== undefined) update.severity = body.priority;
    if (body.status !== undefined) update.status = body.status;
    if (body.warranty_expiry !== undefined) update.warranty_expiry = body.warranty_expiry || null;
    if (body.assigned_to !== undefined) update.assigned_to = body.assigned_to || null;
    if (body.photo_urls !== undefined) update.photo_urls = Array.isArray(body.photo_urls) ? body.photo_urls : [];

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('warranty_claims')
      .update(update)
      .eq('id', params.id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ claim: data, ok: true });
  } catch (e) {
    return apiError('warranty-claims/[id] PATCH', e, 'Failed to update claim');
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requirePermission(req, 'Safety', 'Full');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const supabase = createServerClient();
    const { error } = await supabase
      .from('warranty_claims')
      .delete()
      .eq('id', params.id)
      .eq('tenant_id', user.tenantId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError('warranty-claims/[id] DELETE', e, 'Failed to delete claim');
  }
}
