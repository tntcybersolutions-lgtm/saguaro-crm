import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { onChangeOrderApproved } from '@/lib/triggers';
import { runInBackground } from '@/lib/background';
import { apiError } from '@/lib/api-error';
import { applyChangeOrderMoney } from '@/lib/change-order-cascade';

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
    // Tenant-scope the write: g.db is the service-role client (RLS bypassed), so
    // matching by id alone would let one tenant approve another tenant's CO.
    const { data: after, error } = await db.from('change_orders').update({
      status: 'approved',
      approved_by: g.user.id,
      approved_at: new Date().toISOString(),
    }).eq('id', id).eq('tenant_id', g.user.tenantId).select('*').single();
    if (error) throw error;
    /* The money moves BEFORE the answer, not in the background: the screen
       reloads the contract right after this returns, and a failure here is a
       failure the GC has to hear about (lib/change-order-cascade). */
    await applyChangeOrderMoney(db, g.user.tenantId, before as never, after as never);
    runInBackground(onChangeOrderApproved(id, { money: false }), 'onChangeOrderApproved');
    return NextResponse.json({ success: true, changeOrder: after });
  } catch (e) {
    return apiError('change-orders/[id]/approve POST', e);
  }
}
