import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { recomputeAfter } from '@/lib/commitments-server';

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requirePermission(req, 'Budget', 'Full');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const db = createServerClient();
    /* Read the project before the row goes, or there is nothing left to tell
       the rollup which budget to correct — and a deleted PO whose commitment is
       never released is exactly the drift this chain used to suffer from. */
    const { data: doomed } = await db
      .from('purchase_orders').select('project_id')
      .eq('id', params.id).eq('tenant_id', user.tenantId).maybeSingle();

    const { error } = await db.from('purchase_orders').delete().eq('id', params.id).eq('tenant_id', user.tenantId);
    if (error) throw error;

    recomputeAfter(db, user.tenantId, (doomed as { project_id?: string } | null)?.project_id, 'po:delete');
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[purchase-orders/delete]', err);
    return NextResponse.json({ error: 'Failed to delete purchase order' }, { status: 500 });
  }
}
