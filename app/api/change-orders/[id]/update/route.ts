import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { writeChangeOrder, isCoDecision } from '@/lib/change-order-status';

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

  // An empty or non-JSON body is "no fields", answered with the 400 below.
  const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;

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

    const { data: before, error: bErr } = await db.from('change_orders').select('*')
      .eq('id', id).eq('tenant_id', user.tenantId).maybeSingle();
    if (bErr) throw bErr;
    if (!before) return NextResponse.json({ error: 'Change order not found' }, { status: 404 });
    // Deciding a CO (approve / reject / un-approve) takes the same permission as POST /approve and /reject.
    if (isCoDecision(before, patch.status)) {
      const full = await requirePermission(req, 'Change Orders', 'Full', { db });
      if (!full.ok) return full.res;
    }
    /* Edit Amount on an APPROVED change order changes the contract by the
       difference; a status written here is still an approval or a reversal.
       Both go through the one shared step (lib/change-order-status). */
    const w = await writeChangeOrder(db, user.tenantId, id, patch, { actorId: user.id, before: before as Record<string, unknown> });
    if (!w.ok) return NextResponse.json({ error: w.error }, { status: w.status });
    const data = w.after;
    return NextResponse.json({ changeOrder: data, success: true });
  } catch (e) {
    return apiError('change-orders/[id]/update PATCH', e);
  }
}
