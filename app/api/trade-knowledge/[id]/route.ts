import { NextRequest } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { ok, unauthorized, notFound, serverError } from '@/lib/api-response';

/**
 * GET /api/trade-knowledge/[id]
 * Full article + increment view count.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUser(req);
    if (!user) return unauthorized();

    const { id } = await params;
    const db = createServerClient();

    const { data, error } = await db
      .from('trade_knowledge')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single();

    if (error || !data) return notFound('Article not found');

    // Increment view count (fire and forget)
    db.from('trade_knowledge')
      .update({ view_count: (data.view_count || 0) + 1 })
      .eq('id', id)
      .then(() => { /* non-blocking */ });

    return ok(data);
  } catch (err) {
    return serverError(err);
  }
}

/**
 * PATCH /api/trade-knowledge/[id]
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUser(req);
    if (!user) return unauthorized();

    const { id } = await params;
    const body = await req.json();
    const db = createServerClient();

    const { id: _id, tenant_id: _tid, created_at: _ca, created_by: _cb, view_count: _vc, ...updates } = body;

    const { data, error } = await db
      .from('trade_knowledge')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();

    if (error) throw error;
    if (!data) return notFound('Article not found');

    return ok(data);
  } catch (err) {
    return serverError(err);
  }
}

/**
 * DELETE /api/trade-knowledge/[id]
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUser(req);
    if (!user) return unauthorized();

    const { id } = await params;
    const db = createServerClient();

    const { error } = await db
      .from('trade_knowledge')
      .delete()
      .eq('id', id)
      .eq('tenant_id', user.tenantId);

    if (error) throw error;

    return ok({ deleted: true });
  } catch (err) {
    return serverError(err);
  }
}
