import { NextRequest } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { ok, unauthorized, notFound, serverError } from '@/lib/api-response';

/**
 * GET /api/network/firewall/[id]
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
      .from('firewall_rules')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single();

    if (error || !data) return notFound('Firewall rule not found');

    return ok(data);
  } catch (err) {
    return serverError(err);
  }
}

/**
 * PATCH /api/network/firewall/[id]
 * Update firewall rule. Includes enable/disable toggle.
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

    const { id: _id, tenant_id: _tid, network_project_id: _npid, created_at: _ca, ...updates } = body;

    const { data, error } = await db
      .from('firewall_rules')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();

    if (error) throw error;
    if (!data) return notFound('Firewall rule not found');

    return ok(data);
  } catch (err) {
    return serverError(err);
  }
}

/**
 * DELETE /api/network/firewall/[id]
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
      .from('firewall_rules')
      .delete()
      .eq('id', id)
      .eq('tenant_id', user.tenantId);

    if (error) throw error;

    return ok({ deleted: true });
  } catch (err) {
    return serverError(err);
  }
}
