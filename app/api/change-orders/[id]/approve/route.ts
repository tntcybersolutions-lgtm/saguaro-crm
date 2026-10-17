import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { applyChangeOrderMoney } from '@/lib/change-order-cascade';
import { writeChangeOrder } from '@/lib/change-order-status';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Change Orders', 'Full');
  if (!g.ok) return g.res;
  try {
    const db = g.db;
    const { data: before, error: bErr } = await db.from('change_orders').select('*')
      .eq('id', id).eq('tenant_id', g.user.tenantId).maybeSingle();
    if (bErr) throw bErr;
    if (!before) return NextResponse.json({ error: 'Change order not found' }, { status: 404 });
    /* Approving an approved CO is a no-op. The cascade used to run again and
       add the amount to the contract a second time. */
    if (String((before as { status?: string | null }).status || '').toLowerCase() === 'approved') {
      // Re-check only (delta 0): heals a job whose earlier cascade failed.
      await applyChangeOrderMoney(db, g.user.tenantId, before as never, before as never);
      return NextResponse.json({ success: true, changeOrder: before, alreadyApproved: true });
    }
    // The one shared step (lib/change-order-status): stamps, contract, budget, owner notice.
    const w = await writeChangeOrder(db, g.user.tenantId, id, { status: 'approved' }, { actorId: g.user.id, before: before as Record<string, unknown> });
    if (!w.ok) return NextResponse.json({ error: w.error }, { status: w.status });
    const after = w.after;
    return NextResponse.json({ success: true, changeOrder: after });
  } catch (e) {
    return apiError('change-orders/[id]/approve POST', e);
  }
}
