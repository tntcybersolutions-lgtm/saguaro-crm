import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('sov_line_items')
      .select('*')
      .eq('pay_application_id', id)
      .eq('tenant_id', user.tenantId)
      .order('sort_order');

    if (error) throw error;
    return NextResponse.json({ data: data || [] });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: payAppId } = await params;

  try {
    const db = createServerClient();
    const body = await req.json();
    const itemId = body.itemId as string;
    if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 });

    // Load current item
    const { data: item } = await db
      .from('sov_line_items')
      .select('*')
      .eq('id', itemId)
      .eq('pay_application_id', payAppId)
      .eq('tenant_id', user.tenantId)
      .single();

    if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    const row = item as Record<string, unknown>;

    // Update fields
    const workThisPeriod = body.work_this_period ?? row.work_this_period ?? 0;
    const matStored = body.materials_presently_stored ?? row.materials_presently_stored ?? 0;
    const workFromPrev = Number(row.work_from_previous || 0);
    const scheduledValue = Number(row.scheduled_value || 0);

    const totalCompletedStored = workFromPrev + Number(workThisPeriod) + Number(matStored);
    const pctComplete = scheduledValue > 0 ? (totalCompletedStored / scheduledValue) * 100 : 0;
    const balanceToFinish = scheduledValue - totalCompletedStored;

    // Load pay app for retainage pct
    const { data: payApp } = await db
      .from('pay_applications')
      .select('retainage_percent')
      .eq('id', payAppId)
      .eq('tenant_id', user.tenantId)
      .single();

    const retainagePct = Number((payApp as Record<string, unknown> | null)?.retainage_percent || 10);
    const retainage = totalCompletedStored * (retainagePct / 100);

    const { error: updateErr } = await db
      .from('sov_line_items')
      .update({
        work_this_period: Number(workThisPeriod),
        materials_presently_stored: Number(matStored),
        total_completed_stored: totalCompletedStored,
        pct_complete: Math.round(pctComplete * 10) / 10,
        balance_to_finish: balanceToFinish,
        retainage,
        updated_at: new Date().toISOString(),
      })
      .eq('id', itemId)
      .eq('tenant_id', user.tenantId);

    if (updateErr) throw updateErr;

    // Recalculate pay_application totals from all items
    const { data: allItems } = await db
      .from('sov_line_items')
      .select('scheduled_value, total_completed_stored, retainage')
      .eq('pay_application_id', payAppId)
      .eq('tenant_id', user.tenantId);

    const items = (allItems || []) as Record<string, unknown>[];
    const completedToDate = items.reduce((s, i) => s + Number(i.total_completed_stored || 0), 0);
    const totalRetainage = items.reduce((s, i) => s + Number(i.retainage || 0), 0);
    const contractSumToDate = items.reduce((s, i) => s + Number(i.scheduled_value || 0), 0);

    // Load previous certs
    const { data: pa } = await db
      .from('pay_applications')
      .select('less_previous_certificates')
      .eq('id', payAppId)
      .eq('tenant_id', user.tenantId)
      .single();

    const lessPrevCerts = Number((pa as Record<string, unknown> | null)?.less_previous_certificates || 0);
    const totalEarnedLessRetainage = completedToDate - totalRetainage;
    const currentPaymentDue = totalEarnedLessRetainage - lessPrevCerts;
    const balToFinish = contractSumToDate - completedToDate;
    const pct = contractSumToDate > 0 ? (completedToDate / contractSumToDate) * 100 : 0;

    await db.from('pay_applications').update({
      total_completed_stored: completedToDate,
      retainage_held: totalRetainage,
      total_earned_less_retainage: totalEarnedLessRetainage,
      current_payment_due: currentPaymentDue,
      balance_to_finish: balToFinish,
      percent_complete: Math.round(pct * 10) / 10,
      contract_sum_to_date: contractSumToDate,
      updated_at: new Date().toISOString(),
    }).eq('id', payAppId).eq('tenant_id', user.tenantId);

    return NextResponse.json({
      success: true,
      totals: {
        completedToDate,
        retainageAmount: totalRetainage,
        totalEarnedLessRetainage,
        currentPaymentDue,
        balanceToFinish: balToFinish,
        percentComplete: Math.round(pct * 10) / 10,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
