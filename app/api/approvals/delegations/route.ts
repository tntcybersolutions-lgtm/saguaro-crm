import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { requirePermission } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

/**
 * GET /api/approvals/delegations — tenant-scoped delegations, newest first.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ delegations: [], source: 'unauth' }, { status: 401 });

    const db = createServerClient();
    const { data, error } = await db
      .from('approval_delegations')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ delegations: data || [], source: 'live' });
  } catch (e) {
    // Was a 2xx with an empty body: the screen showed "no delegations" with
    // total confidence while the query was actually failing. A soft fail on
    // a read is indistinguishable from real emptiness, which is the whole
    // problem. Real status, real log, correlation id.
    return apiError('approvals/delegations', e, 'Could not load approval delegations');
  }
}

/**
 * POST /api/approvals/delegations — create a delegation.
 * Body: { toUser, startDate, endDate, reason? }
 * from_user defaults to the current user's email.
 */
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    if (!body.toUser || !body.startDate || !body.endDate) {
      return NextResponse.json({ error: 'toUser, startDate and endDate are required' }, { status: 400 });
    }

    const db = createServerClient();
    const { data, error } = await db.from('approval_delegations').insert({
      tenant_id: user.tenantId,
      from_user: (body.fromUser || user.email || user.id) as string,
      to_user: body.toUser,
      start_date: body.startDate,
      end_date: body.endDate,
      reason: body.reason || null,
      active: true,
    } as never).select().single();
    if (error) throw error;
    return NextResponse.json({ delegation: data, success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
