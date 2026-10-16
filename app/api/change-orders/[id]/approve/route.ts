import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { onChangeOrderApproved } from '@/lib/triggers';
import { runInBackground } from '@/lib/background';
import { apiError } from '@/lib/api-error';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Change Orders', 'Full');
  if (!g.ok) return g.res;
  try {
    const db = g.db;
    // Tenant-scope the write: g.db is the service-role client (RLS bypassed), so
    // matching by id alone would let one tenant approve another tenant's CO.
    const { error } = await db.from('change_orders').update({
      status: 'approved',
      approved_by: g.user.id,
      approved_at: new Date().toISOString(),
    }).eq('id', id).eq('tenant_id', g.user.tenantId);
    if (error) throw error;
    runInBackground(onChangeOrderApproved(id), 'onChangeOrderApproved');
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('change-orders/[id]/approve POST', e);
  }
}
