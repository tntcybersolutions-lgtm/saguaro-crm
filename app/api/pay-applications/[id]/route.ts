import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  try {
    const db = createServerClient();
    const [{ data: payApp }, { data: lineItems }] = await Promise.all([
      db.from('pay_applications')
        .select('*, projects(id, name, address, state, zip, project_number, owner_name, owner_address, architect_name, contract_value, contract_amount, retainage_pct, gc_name, gc_entity, gc_address, gc_license_number, gc_license, pm_name, pm_email, pm_phone, county)')
        .eq('id', id)
        .eq('tenant_id', user.tenantId)
        .single(),
      db.from('sov_line_items')
        .select('*')
        .eq('pay_application_id', id)
        .eq('tenant_id', user.tenantId)
        .order('sort_order'),
    ]);

    if (!payApp) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const pa = payApp as Record<string, unknown>;

    // Include approved change orders summary
    const { data: cos } = await db
      .from('change_orders')
      .select('id, co_number, title, amount, status')
      .eq('project_id', String(pa.project_id))
      .eq('tenant_id', user.tenantId)
      .eq('status', 'approved');

    const netChangeByCO = cos?.reduce((s, c) => s + Number((c as Record<string, unknown>).amount || 0), 0) || 0;

    return NextResponse.json({
      data: { ...payApp, approved_change_orders: cos || [], net_change_by_co: netChangeByCO },
      lineItems: lineItems || [],
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  try {
    const db = createServerClient();
    const body = await req.json();

    const allowed = [
      'period_from', 'period_to', 'retainage_percent', 'notes',
      'notary_state', 'notary_county', 'notary_public', 'subscribed_before',
      'notary_commission_expires', 'application_date',
    ];

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const k of allowed) {
      if (body[k] !== undefined) updates[k] = body[k];
    }

    const { error } = await db
      .from('pay_applications')
      .update(updates)
      .eq('id', id)
      .eq('tenant_id', user.tenantId);

    if (error) throw error;
    return NextResponse.json({ success: true });
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
    // sov_line_items cascade-deleted by FK
    const { error } = await db
      .from('pay_applications')
      .delete()
      .eq('id', id)
      .eq('tenant_id', user.tenantId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
