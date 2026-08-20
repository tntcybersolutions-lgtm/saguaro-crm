import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const db = createServerClient();
    const body = await req.json();
    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (body.bid_amount !== undefined) updates.bid_amount = Number(body.bid_amount);
    if (body.margin_pct !== undefined) updates.margin_pct = Number(body.margin_pct);
    if (body.notes !== undefined) updates.notes = body.notes;
    const { error } = await db
      .from('bid_history')
      .update(updates)
      .eq('id', params.id)
      .eq('tenant_id', user.tenantId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to update bid' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const db = createServerClient();
    const { error } = await db
      .from('bid_history')
      .delete()
      .eq('id', params.id)
      .eq('tenant_id', user.tenantId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete bid' }, { status: 500 });
  }
}
