import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const db = createServerClient();
    const { error } = await db.from('purchase_orders').delete().eq('id', params.id).eq('tenant_id', user.tenantId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[purchase-orders/delete]', err);
    return NextResponse.json({ error: 'Failed to delete purchase order' }, { status: 500 });
  }
}
