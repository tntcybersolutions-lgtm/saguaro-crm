import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requirePermission(req, 'Budget', 'Full');
  if (!g.ok) return g.res;
  const user = g.user;
  const db = g.db;

  try {
    // Tenant-scoped, authenticated write — the previous anon client bypassed both
    // auth and tenant isolation (RLS off on the service path, no tenant filter),
    // so the update either silently no-op'd under RLS or was cross-tenant unsafe.
    const { data, error } = await db
      .from('bills')
      .update({ status: 'Paid', paid_at: new Date().toISOString() })
      .eq('id', params.id)
      .eq('tenant_id', user.tenantId)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Bill not found' }, { status: 404 });

    return NextResponse.json({ success: true, bill: data });
  } catch (err) {
    return apiError('bills/[id]/pay PATCH', err, 'Failed to mark bill as paid');
  }
}
