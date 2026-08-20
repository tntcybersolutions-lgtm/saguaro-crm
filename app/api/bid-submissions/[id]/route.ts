import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('bid_submissions')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    return NextResponse.json({ data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  try {
    const body = await req.json();
    const db = createServerClient();

    // Only allow updating specific fields
    const allowed = [
      'leveling_notes', 'adjusted_amount', 'scope_gap_amount', 'scope_complete',
      'exclusions', 'inclusions', 'clarifications', 'assumptions',
      'risk_score', 'status', 'base_bid', 'alternate_1', 'alternate_2',
      'company_name', 'contact_name', 'contact_email', 'contact_phone',
    ];
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key];
    }
    // Keep base_amount in sync with base_bid
    if (updates.base_bid !== undefined) {
      updates.base_amount = updates.base_bid;
    }

    const { data, error } = await db
      .from('bid_submissions')
      .update(updates)
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    return NextResponse.json({ data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  try {
    const db = createServerClient();

    // Check if awarded
    const { data: sub } = await db
      .from('bid_submissions')
      .select('id, is_awarded, bid_package_id')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single();
    if (!sub) return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    if (sub.is_awarded) return NextResponse.json({ error: 'Cannot delete an awarded submission' }, { status: 409 });

    const { error } = await db
      .from('bid_submissions')
      .delete()
      .eq('id', id)
      .eq('tenant_id', user.tenantId);
    if (error) throw error;

    // Recalculate bid_packages stats
    const { data: remaining } = await db
      .from('bid_submissions')
      .select('id, base_bid')
      .eq('bid_package_id', sub.bid_package_id)
      .eq('tenant_id', user.tenantId)
      .not('base_bid', 'is', null)
      .order('base_bid', { ascending: true });

    if (remaining && remaining.length > 0) {
      await db.from('bid_submissions').update({ is_low_bid: false })
        .eq('bid_package_id', sub.bid_package_id).eq('tenant_id', user.tenantId);
      await db.from('bid_submissions').update({ is_low_bid: true })
        .eq('id', remaining[0].id).eq('tenant_id', user.tenantId);

      const lowBid = remaining[0].base_bid;
      const highBid = remaining[remaining.length - 1].base_bid;
      const spreadPct = lowBid > 0 ? ((highBid - lowBid) / lowBid * 100) : 0;
      await db.from('bid_packages').update({
        bid_count: remaining.length,
        low_bid_amount: lowBid,
        spread_pct: Math.round(spreadPct * 10) / 10,
      }).eq('id', sub.bid_package_id).eq('tenant_id', user.tenantId);
    } else {
      await db.from('bid_packages').update({
        bid_count: 0, low_bid_amount: null, spread_pct: null,
      }).eq('id', sub.bid_package_id).eq('tenant_id', user.tenantId);
    }

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
