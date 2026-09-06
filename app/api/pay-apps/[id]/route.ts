import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const db = createServerClient();
    const [{ data: payApp }, { data: lineItems }] = await Promise.all([
      db.from('pay_applications').select('*, projects(*)').eq('id', id).eq('tenant_id', user.tenantId).single(),
      db.from('schedule_of_values').select('*').eq('tenant_id', user.tenantId).eq('pay_app_id', id).order('line_number'),
    ]);
    if (!payApp) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ payApp, lineItems: lineItems || [] });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const db = createServerClient();

    // Update pay app header fields
    const headerFields: Record<string, any> = {};
    const allowed = [
      'period_from','period_to','contract_sum','change_orders_total','contract_sum_to_date',
      'prev_completed','this_period','materials_stored','total_completed','percent_complete',
      'retainage_percent','retainage_amount','total_earned_less_retainage','prev_payments',
      'current_payment_due','net_amount_due','notes','owner_name','owner_address','architect_name',
    ];
    for (const k of allowed) {
      if (body[k] !== undefined) headerFields[k] = body[k];
    }

    if (Object.keys(headerFields).length > 0) {
      const { error } = await db
        .from('pay_applications')
        .update(headerFields)
        .eq('id', id)
        .eq('tenant_id', user.tenantId);
      if (error) throw error;
    }

    // Replace SOV line items if provided
    if (Array.isArray(body.lineItems)) {
      await db.from('schedule_of_values').delete().eq('tenant_id', user.tenantId).eq('pay_app_id', id);
      if (body.lineItems.length > 0) {
        const { error: liErr } = await db.from('schedule_of_values').insert(
          body.lineItems.map((item: any, i: number) => ({
            tenant_id: user.tenantId,
            project_id: body.projectId,
            pay_app_id: id,
            line_number: i + 1,
            description: item.description,
            scheduled_value: item.scheduled_value ?? item.scheduledValue ?? 0,
            work_from_prev: item.work_from_prev ?? item.workFromPrev ?? 0,
            work_this_period: item.work_this_period ?? item.workThisPeriod ?? 0,
            materials_stored: item.materials_stored ?? item.materialsStored ?? 0,
            total_completed: item.total_completed ?? item.totalCompleted ?? 0,
            percent_complete: item.percent_complete ?? item.percentComplete ?? 0,
            balance_to_finish: item.balance_to_finish ?? item.balanceToFinish ?? 0,
            retainage: item.retainage ?? 0,
            csi_code: item.csi_code ?? item.csiCode,
          }))
        );
        if (liErr) throw liErr;
      }
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const db = createServerClient();

    // Whitelist to real pay_applications columns the pay-apps list page may patch.
    const allowed = [
      'current_payment_due', 'status', 'app_number', 'period_from', 'period_to',
      'scheduled_value', 'this_period', 'percent_complete', 'net_payment_due',
      'contract_sum', 'notes', 'internal_notes',
    ];
    const updates: Record<string, unknown> = {};
    for (const k of allowed) {
      if (body[k] !== undefined) updates[k] = body[k];
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: true });
    }
    updates.updated_at = new Date().toISOString();

    const { data, error } = await db
      .from('pay_applications')
      .update(updates)
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ payApp: data });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const db = createServerClient();
    // Remove SOV child rows first, then the pay app (tenant-scoped).
    await db.from('schedule_of_values').delete().eq('tenant_id', user.tenantId).eq('pay_app_id', id);
    const { error } = await db
      .from('pay_applications')
      .delete()
      .eq('id', id)
      .eq('tenant_id', user.tenantId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
