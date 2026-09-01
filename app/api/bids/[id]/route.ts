import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';

import { apiError } from '@/lib/api-error';
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const g = await requirePermission(req, 'Projects', 'Edit');
    if (!g.ok) return g.res;
    const user = g.user;
    const db = createServerClient();
    const body = await req.json();
    const updates: Record<string, any> = {};
    if (body.bid_amount !== undefined) updates.bid_amount = Number(body.bid_amount);
    if (body.margin_pct !== undefined) updates.margin_pct = Number(body.margin_pct);
    if (body.notes !== undefined) updates.notes = body.notes;
    const { error } = await db
      .from('bid_history')
      .update(updates)
      .eq('id', params.id)
      .eq('tenant_id', user.tenantId);
    if (error) return apiError('bids/id', error, undefined, 500);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to update bid' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const g = await requirePermission(req, 'Projects', 'Full');
    if (!g.ok) return g.res;
    const user = g.user;
    const db = createServerClient();
    const { error } = await db
      .from('bid_history')
      .delete()
      .eq('id', params.id)
      .eq('tenant_id', user.tenantId);
    if (error) return apiError('bids/id', error, undefined, 500);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete bid' }, { status: 500 });
  }
}
