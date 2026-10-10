import { NextRequest } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { ok, unauthorized, notFound, serverError } from '@/lib/api-response';
import { requestDay } from '@/lib/time-zone';

/**
 * GET /api/network/cables/[id]
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
      .from('cable_runs')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single();

    if (error || !data) return notFound('Cable run not found');

    return ok(data);
  } catch (err) {
    return serverError(err);
  }
}

/**
 * PATCH /api/network/cables/[id]
 * Update cable run. Includes marking tested with test_result.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const g = await requirePermission(req, 'Projects', 'Edit');
    if (!g.ok) return g.res;
    const user = g.user;

    const { id } = await params;
    const body = await req.json();
    const db = createServerClient();

    const { id: _id, tenant_id: _tid, network_project_id: _npid, created_at: _ca, ...updates } = body;

    // If marking as tested, record the test date (cable_runs has a `test_date` date column).
    if (updates.tested === true && !updates.test_date) {
      updates.test_date = (await requestDay(req.headers, db, user.tenantId, 'network/cables')).today;
    }

    // If test_result is being set, auto-set tested to true
    if (updates.test_result && updates.tested === undefined) {
      updates.tested = true;
      if (!updates.test_date) updates.test_date = (await requestDay(req.headers, db, user.tenantId, 'network/cables')).today;
    }

    const { data, error } = await db
      .from('cable_runs')
      .update(updates)
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();

    if (error) throw error;
    if (!data) return notFound('Cable run not found');

    return ok(data);
  } catch (err) {
    return serverError(err);
  }
}

/**
 * DELETE /api/network/cables/[id]
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const g = await requirePermission(req, 'Projects', 'Full');
    if (!g.ok) return g.res;
    const user = g.user;

    const { id } = await params;
    const db = createServerClient();

    const { error } = await db
      .from('cable_runs')
      .delete()
      .eq('id', id)
      .eq('tenant_id', user.tenantId);

    if (error) throw error;

    return ok({ deleted: true });
  } catch (err) {
    return serverError(err);
  }
}
