import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ projectId: string; payAppId: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { payAppId } = await params;
  const db = createServerClient();

  try {
    const { data: payApp, error } = await db
      .from('owner_pay_applications')
      .select('*')
      .eq('id', payAppId)
      .eq('tenant_id', user.tenantId)
      .single();

    if (error || !payApp) return NextResponse.json({ error: 'Pay application not found' }, { status: 404 });

    const { data: lineItems } = await db
      .from('owner_pay_app_line_items')
      .select('*')
      .eq('owner_pay_app_id', payAppId)
      .eq('tenant_id', user.tenantId)
      .order('item_number');

    return NextResponse.json({ pay_app: payApp, line_items: lineItems || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { payAppId } = await params;
  const body = await req.json();
  const db = createServerClient();

  try {
    // Load pay app
    const { data: payApp } = await db
      .from('owner_pay_applications')
      .select('*, prime_contracts!inner(retainage_pct)')
      .eq('id', payAppId)
      .eq('tenant_id', user.tenantId)
      .single();

    if (!payApp) return NextResponse.json({ error: 'Pay application not found' }, { status: 404 });

    const retainagePct = Number((payApp as any).prime_contracts?.retainage_pct || payApp.retainage_pct || 10);

    // Update line items if provided
    if (body.line_items && Array.isArray(body.line_items)) {
      for (const li of body.line_items) {
        if (!li.id) continue;
        const updates: Record<string, any> = {};
        if (li.work_this_period !== undefined) updates.work_this_period = Number(li.work_this_period) || 0;
        if (li.materials_stored !== undefined) updates.materials_stored = Number(li.materials_stored) || 0;

        // Calculate retainage for this line
        const workTotal = Number(li.previous_applications || 0) +
          Number(li.work_this_period || 0) + Number(li.materials_stored || 0);
        updates.retainage = Math.round(workTotal * retainagePct / 100 * 100) / 100;

        await db.from('owner_pay_app_line_items')
          .update(updates)
          .eq('id', li.id)
          .eq('tenant_id', user.tenantId);
      }
    }

    // Recalculate G702 totals from line items
    const { data: allLines } = await db
      .from('owner_pay_app_line_items')
      .select('*')
      .eq('owner_pay_app_id', payAppId)
      .eq('tenant_id', user.tenantId);

    let completedStored = 0;
    let totalRetainage = 0;
    for (const li of allLines || []) {
      completedStored += Number(li.total_completed_stored || 0);
      totalRetainage += Number(li.retainage || 0);
    }

    const retainageOnWork = Math.round(completedStored * retainagePct / 100 * 100) / 100;
    const totalEarnedLessRetainage = completedStored - retainageOnWork;
    const prevCerts = Number(payApp.less_previous_certificates || 0);
    const currentPaymentDue = totalEarnedLessRetainage - prevCerts;
    const contractSum = Number(payApp.contract_sum_to_date || 0);
    const balanceToFinish = contractSum - completedStored + retainageOnWork;

    const { data: updated, error: upErr } = await db
      .from('owner_pay_applications')
      .update({
        completed_stored_to_date: completedStored,
        retainage_on_completed_work: retainageOnWork,
        total_retainage: retainageOnWork,
        total_earned_less_retainage: totalEarnedLessRetainage,
        current_payment_due: currentPaymentDue,
        balance_to_finish_including_retainage: balanceToFinish,
        updated_at: new Date().toISOString(),
      })
      .eq('id', payAppId)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();

    if (upErr) throw upErr;

    const { data: updatedLines } = await db
      .from('owner_pay_app_line_items')
      .select('*')
      .eq('owner_pay_app_id', payAppId)
      .eq('tenant_id', user.tenantId)
      .order('item_number');

    return NextResponse.json({ pay_app: updated, line_items: updatedLines || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { payAppId } = await params;
  const db = createServerClient();

  try {
    const { error } = await db
      .from('owner_pay_applications')
      .update({ status: 'voided', updated_at: new Date().toISOString() })
      .eq('id', payAppId)
      .eq('tenant_id', user.tenantId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { payAppId } = await params;
  const body = await req.json();
  const db = createServerClient();
  const action = body.action;

  try {
    if (action === 'certify') {
      if (!body.certified_by_name) {
        return NextResponse.json({ error: 'Missing required field: certified_by_name' }, { status: 400 });
      }

      const { data: payApp } = await db
        .from('owner_pay_applications')
        .select('current_payment_due, prime_contract_id')
        .eq('id', payAppId)
        .eq('tenant_id', user.tenantId)
        .single();

      if (!payApp) return NextResponse.json({ error: 'Pay application not found' }, { status: 404 });

      const certifiedAmt = body.certified_amount !== undefined
        ? Number(body.certified_amount)
        : Number(payApp.current_payment_due);

      await db.from('owner_pay_applications').update({
        status: 'certified',
        certified_amount: certifiedAmt,
        certified_by_name: body.certified_by_name,
        certified_date: body.certified_date || new Date().toISOString().split('T')[0],
        certification_notes: body.certification_notes || null,
        updated_at: new Date().toISOString(),
      }).eq('id', payAppId).eq('tenant_id', user.tenantId);

      // Update prime contract total_billed
      const { data: pc } = await db
        .from('prime_contracts')
        .select('id, total_billed')
        .eq('id', payApp.prime_contract_id)
        .eq('tenant_id', user.tenantId)
        .single();

      if (pc) {
        await db.from('prime_contracts').update({
          total_billed: Number(pc.total_billed || 0) + certifiedAmt,
          updated_at: new Date().toISOString(),
        }).eq('id', pc.id).eq('tenant_id', user.tenantId);
      }

      // Update SOV billed_to_date per line
      const { data: lineItems } = await db
        .from('owner_pay_app_line_items')
        .select('prime_contract_sov_id, work_this_period, materials_stored')
        .eq('owner_pay_app_id', payAppId)
        .eq('tenant_id', user.tenantId);

      for (const li of lineItems || []) {
        if (!li.prime_contract_sov_id) continue;
        const lineAmount = Number(li.work_this_period || 0) + Number(li.materials_stored || 0);
        if (lineAmount <= 0) continue;

        const { data: sovLine } = await db
          .from('prime_contract_sov')
          .select('id, billed_to_date')
          .eq('id', li.prime_contract_sov_id)
          .eq('tenant_id', user.tenantId)
          .single();

        if (sovLine) {
          await db.from('prime_contract_sov').update({
            billed_to_date: Number(sovLine.billed_to_date || 0) + lineAmount,
            updated_at: new Date().toISOString(),
          }).eq('id', sovLine.id).eq('tenant_id', user.tenantId);
        }
      }

      return NextResponse.json({ success: true, certified_amount: certifiedAmt });
    }

    if (action === 'mark_paid') {
      if (!body.paid_amount) {
        return NextResponse.json({ error: 'Missing required field: paid_amount' }, { status: 400 });
      }

      const { data: payApp } = await db
        .from('owner_pay_applications')
        .select('prime_contract_id')
        .eq('id', payAppId)
        .eq('tenant_id', user.tenantId)
        .single();

      if (!payApp) return NextResponse.json({ error: 'Pay application not found' }, { status: 404 });

      await db.from('owner_pay_applications').update({
        status: 'paid',
        paid_amount: Number(body.paid_amount),
        paid_date: body.paid_date || new Date().toISOString().split('T')[0],
        check_number: body.check_number || null,
        payment_notes: body.payment_notes || null,
        updated_at: new Date().toISOString(),
      }).eq('id', payAppId).eq('tenant_id', user.tenantId);

      // Update prime contract total_paid
      const { data: pc } = await db
        .from('prime_contracts')
        .select('id, total_paid')
        .eq('id', payApp.prime_contract_id)
        .eq('tenant_id', user.tenantId)
        .single();

      if (pc) {
        await db.from('prime_contracts').update({
          total_paid: Number(pc.total_paid || 0) + Number(body.paid_amount),
          updated_at: new Date().toISOString(),
        }).eq('id', pc.id).eq('tenant_id', user.tenantId);
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action. Use action: certify or mark_paid' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}
