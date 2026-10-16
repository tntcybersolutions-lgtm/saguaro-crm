import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/**
 * GET /api/client-portal/users/[id]
 * Fetch a single client portal user.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = createServerClient();
    const { data, error } = await db
      .from('portal_users')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    return NextResponse.json({ user: data });
  } catch (err) {
    return apiError('client-portal/users/[id] GET', err);
  }
}

/**
 * PATCH /api/client-portal/users/[id]
 * Update a client portal user (status, role, company, phone, permissions, projectIds).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const fields: Record<string, unknown> = {};

    if (typeof body.name === 'string') fields.name = body.name;
    if (typeof body.email === 'string') fields.email = body.email;
    if (typeof body.company === 'string') fields.company = body.company;
    if (typeof body.role === 'string') fields.role = body.role;
    if (typeof body.status === 'string') fields.status = body.status;
    if (body.permissions !== undefined) fields.permissions = body.permissions;

    if (Object.keys(fields).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const db = createServerClient();
    const { data, error } = await db
      .from('portal_users')
      .update(fields)
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ user: data });
  } catch (err) {
    return apiError('client-portal/users/[id] PATCH', err, 'Failed to update user');
  }
}

/**
 * DELETE /api/client-portal/users/[id]
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = createServerClient();
    const { error } = await db
      .from('portal_users')
      .delete()
      .eq('id', id)
      .eq('tenant_id', user.tenantId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    return apiError('client-portal/users/[id] DELETE', err, 'Failed to delete user');
  }
}
