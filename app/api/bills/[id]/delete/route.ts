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
    /* Read the project before the row goes — a deleted bill whose cost is
       never released is the same drift the incremental rollup used to cause. */
    const { data: doomed } = await db
      .from('bills').select('project_id')
      .eq('id', params.id).eq('tenant_id', user.tenantId).maybeSingle();

    const { error } = await db.from('bills').delete().eq('id', params.id).eq('tenant_id', user.tenantId);
    if (error) throw error;
    recomputeAfter(db, user.tenantId, (doomed as { project_id?: string } | null)?.project_id, 'bill:delete');
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[bills/delete]', err);
    return NextResponse.json({ error: 'Failed to delete bill' }, { status: 500 });
  }
}
