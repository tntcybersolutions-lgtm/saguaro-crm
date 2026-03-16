import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { onPayAppCreated } from '@/lib/triggers';

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const db = createServerClient();

    const projectId = body.projectId;
    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

    const { data: project } = await db.from('projects').select('*').eq('id', projectId).single();
    const p = project as any;

    // Get next application number
    const { data: lastApp } = await db
      .from('pay_applications')
      .select('application_number')
      .eq('project_id', projectId)
      .order('application_number', { ascending: false })
      .limit(1)
      .single();
    const appNumber = ((lastApp as any)?.application_number || 0) + 1;

    const { data: payApp, error } = await db.from('pay_applications').insert({
      tenant_id: user.tenantId,
      project_id: projectId,
      application_number: appNumber,
      period_from: body.periodFrom,
      period_to: body.periodTo,
      status: body.status || 'draft',
      contract_sum: body.contractSum || p?.contract_amount || 0,
      change_orders_total: body.changeOrdersTotal || 0,
      contract_sum_to_date: body.contractSumToDate || p?.contract_amount || 0,
      prev_completed: body.prevCompleted || 0,
      this_period: body.thisPeriod || 0,
      materials_stored: body.materialsStored || 0,
      total_completed: body.totalCompleted || 0,
      percent_complete: body.percentComplete || 0,
      retainage_percent: body.retainagePercent || 10,
      retainage_amount: body.retainageAmount || 0,
      total_earned_less_retainage: body.totalEarnedLessRetainage || 0,
      prev_payments: body.prevPayments || 0,
      current_payment_due: body.currentPaymentDue || 0,
      owner_name: p?.owner_entity?.name || body.ownerName,
      owner_address: p?.owner_entity?.address || body.ownerAddress,
      architect_name: p?.architect_entity?.name || body.architectName,
      notes: body.notes,
    }).select().single();

    if (error) throw error;

    // Insert SOV line items if provided
    if (body.lineItems && body.lineItems.length > 0) {
      await db.from('schedule_of_values').insert(
        body.lineItems.map((item: any, i: number) => ({
          tenant_id: user.tenantId,
          project_id: projectId,
          pay_app_id: (payApp as any).id,
          line_number: i + 1,
          description: item.description,
          scheduled_value: item.scheduledValue || 0,
          work_from_prev: item.workFromPrev || 0,
          work_this_period: item.workThisPeriod || 0,
          materials_stored: item.materialsStored || 0,
          total_completed: item.totalCompleted || 0,
          percent_complete: item.percentComplete || 0,
          balance_to_finish: item.balanceToFinish || 0,
          retainage: item.retainage || 0,
          csi_code: item.csiCode,
        }))
      );
    }

    // Non-blocking trigger
    onPayAppCreated((payApp as any).id).catch(console.error);

    return NextResponse.json({ payApp, success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
