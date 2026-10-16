import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/change-orders/[id]/update
 * Partial-update a change order. Maps the page's field names onto DB columns:
 * the desktop page sends { cost_impact } but the column is `amount`.
 *
 * Caller: app/app/projects/[projectId]/change-orders/page.tsx → saveCoEdit()
 *   PATCH { cost_impact: amount }
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Change Orders', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;

  const { id } = await params;

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body */ }

  try {
    const db = g.db;

    const patch: Record<string, unknown> = {};
    // cost_impact (page) → amount (column)
    if (body.cost_impact !== undefined) patch.amount = Number(body.cost_impact) || 0;
    if (body.amount !== undefined) patch.amount = Number(body.amount) || 0;
    if (body.costImpact !== undefined) patch.amount = Number(body.costImpact) || 0;
    if (body.title !== undefined) patch.title = body.title;
    if (body.description !== undefined) patch.description = body.description;
    if (body.reason !== undefined) patch.reason = body.reason;
    if (body.status !== undefined) patch.status = body.status;
    if (body.scheduleImpact !== undefined) patch.schedule_impact = Number(body.scheduleImpact) || 0;
    if (body.schedule_impact !== undefined) patch.schedule_impact = Number(body.schedule_impact) || 0;
    if (body.notes !== undefined) patch.notes = body.notes;

    // The change-orders LIST and every contract-summary KPI read the legacy
    // `cost_impact` column (the page renders `co.cost_impact` and sums it), NOT
    // `amount`. If we only write `amount`, an edited cost impact appears to save
    // (optimistic UI + success toast) but silently reverts on reload because the
    // value actually read back — cost_impact — was never touched. create writes
    // both in lock-step; the edit must too.
    if (patch.amount !== undefined) patch.cost_impact = patch.amount;

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 });
    }

    const { data, error } = await db
      .from('change_orders')
      .update(patch)
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ changeOrder: data, success: true });
  } catch (e) {
    return apiError('change-orders/[id]/update PATCH', e);
  }
}
