import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { onPayAppApproved } from '@/lib/triggers';
import { runInBackground } from '@/lib/background';
import { apiError } from '@/lib/api-error';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Pay Apps', 'Full');
  if (!g.ok) return g.res;
  const user = g.user;
  const { id } = await params;
  try {
    const db = g.db;
    const { error } = await db
      .from('pay_applications')
      .update({ status: 'approved', approved_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', user.tenantId);
    if (error) throw error;
    runInBackground(onPayAppApproved(id), 'onPayAppApproved');
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('pay-apps/[id]/approve POST', e);
  }
}
