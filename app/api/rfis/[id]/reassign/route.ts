import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/**
 * Reassign an RFI / move the ball-in-court.
 * Called from app/field/rfis/page.tsx (bulk reassign) via PATCH.
 * Body: { assigned_to: string }  (the assignee name)
 *
 * The rfis table has no `assigned_to` column — the inbound value is mapped to
 * `assigned_to_name` and `ball_in_court`. Optional `assigned_to_email`,
 * `assigned_to_company`, and explicit `ball_in_court` are honored if provided.
 */
async function reassign(
  req: NextRequest,
  params: Promise<{ id: string }>
) {
  const g = await requirePermission(req, 'RFIs', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;

  const { id } = await params;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }

  const assignedTo = (
    (body.assigned_to as string) ||
    (body.assigned_to_name as string) ||
    (body.assignee as string) ||
    ''
  ).trim();

  const ballInCourt = (
    (body.ball_in_court as string) || assignedTo || ''
  ).trim();

  if (!assignedTo && !ballInCourt) {
    return NextResponse.json({ error: 'assigned_to is required' }, { status: 400 });
  }

  try {
    const db = createServerClient();

    const update: Record<string, unknown> = {};
    if (assignedTo) update.assigned_to_name = assignedTo;
    if (ballInCourt) update.ball_in_court = ballInCourt;
    if (body.assigned_to_email) update.assigned_to_email = body.assigned_to_email;
    if (body.assigned_to_company) update.assigned_to_company = body.assigned_to_company;

    const { error } = await db
      .from('rfis')
      .update(update)
      .eq('id', id)
      .eq('tenant_id', user.tenantId);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      assigned_to_name: assignedTo,
      ball_in_court: ballInCourt,
    });
  } catch (e) {
    return apiError('rfis/[id]/reassign', e);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return reassign(req, params);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return reassign(req, params);
}
