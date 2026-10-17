import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/**
 * GET  /api/sub-portal/permissions
 *   Returns each sub user's granted portal permissions.
 *   Shape: { data: { userId, permissions: string[] }[] }
 *
 * PATCH /api/sub-portal/permissions
 *   Body: { userId: string, permissions: string[] }
 *   Replaces the permission set for one sub user. Permissions are stored
 *   in the portal_users.permissions (jsonb) column. Fire-and-forget from
 *   the page, so responses are always safe.
 */
export async function GET(req: NextRequest) {
  const gate = await requirePermission(req, 'Projects', 'Edit');
  if (!gate.ok) return gate.res;
  const user = gate.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('portal_users')
      .select('id, permissions')
      .eq('tenant_id', user.tenantId)
      .eq('portal_type', 'sub');
    if (error) throw error;
    const rows = (data || []).map((r: any) => ({
      userId: r.id,
      permissions: Array.isArray(r.permissions) ? r.permissions : [],
    }));
    return NextResponse.json({ data: rows });
  } catch (e) {
    // A failed read must NOT render as an empty list. The screen would say
    // "no permissions" with total confidence when the truth is that the query
    // failed — and the old body carried source:'error', which no screen has
    // ever read. Real status, real server-side log, correlation id.
    return apiError('sub-portal/permissions', e, 'Could not load portal permissions');
  }
}

export async function PATCH(req: NextRequest) {
  const gate = await requirePermission(req, 'Projects', 'Full');
  if (!gate.ok) return gate.res;
  const user = gate.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const userId: string | undefined = body?.userId;
    const permissions = Array.isArray(body?.permissions) ? body.permissions : [];
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const db = createServerClient();
    const { data, error } = await db
      .from('portal_users')
      .update({ permissions })
      .eq('id', userId)
      .eq('tenant_id', user.tenantId)
      .eq('portal_type', 'sub')
      .select('id, permissions')
      .maybeSingle();
    if (error) throw error;

    return NextResponse.json({ data: data || { userId, permissions } });
  } catch (e) {
    return apiError('sub-portal/permissions PATCH', e);
  }
}
