import { NextRequest, NextResponse } from 'next/server';
import { generateG702, generateG703, saveDocument } from '@/lib/pdf-engine';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    const body = await req.json();
    const db = createServerClient();

    const [{ data: payApp }, { data: lineItems }] = await Promise.all([
      db.from('pay_applications').select('*, projects(*)').eq('id', body.payAppId).single(),
      db.from('schedule_of_values').select('*').eq('pay_app_id', body.payAppId).order('line_number'),
    ]);

    if (!payApp) return NextResponse.json({ error: 'Pay app not found' }, { status: 404 });
    const pa = payApp as any;
    const project = pa.projects;

    const g702Bytes = await generateG702({
      projectName: project?.name || '',
      projectAddress: project?.address || '',
      ownerName: pa.owner_name || project?.owner_entity?.name || '',
      architectName: pa.architect_name || project?.architect_entity?.name || '',
      gcName: body.gcName || project?.gc_name || 'General Contractor',
      appNumber: pa.app_number,
      periodFrom: pa.period_from || '',
      periodTo: pa.period_to || '',
      contractSum: pa.contract_sum || 0,
      changeOrdersTotal: pa.change_orders_total || 0,
      contractSumToDate: pa.contract_sum_to_date || 0,
      prevCompleted: pa.prev_completed || 0,
      thisPeriod: pa.this_period || 0,
      materialsStored: pa.materials_stored || 0,
      totalCompleted: pa.total_completed || 0,
      percentComplete: pa.percent_complete || 0,
      retainagePercent: pa.retainage_percent || 10,
      retainageAmount: pa.retainage_amount || 0,
      totalEarnedLessRetainage: pa.total_earned_less_retainage || 0,
      prevPayments: pa.prev_payments || 0,
      currentPaymentDue: pa.current_payment_due || 0,
    });

    const g703Bytes = await generateG703({
      projectName: project?.name || '',
      appNumber: pa.app_number,
      periodTo: pa.period_to || '',
      lineItems: (lineItems || []).map((i: any, idx: number) => ({
        lineNumber: i.line_number || idx + 1,
        description: i.description,
        scheduledValue: i.scheduled_value || 0,
        workFromPrev: i.work_from_prev || 0,
        workThisPeriod: i.work_this_period || 0,
        materialsStored: i.materials_stored || 0,
        totalCompleted: i.total_completed || 0,
        percentComplete: i.percent_complete || 0,
        balanceToFinish: i.balance_to_finish || 0,
        retainage: i.retainage || 0,
      })),
    });

    const tenantId = user?.id || project?.tenant_id;
    const [g702Url, g703Url] = await Promise.all([
      saveDocument(body.projectId || project?.id, 'g702', g702Bytes, { payAppId: body.payAppId }, tenantId),
      saveDocument(body.projectId || project?.id, 'g703', g703Bytes, { payAppId: body.payAppId }, tenantId),
    ]);

    // Update pay app with PDF URLs
    await db.from('pay_applications').update({ g702_pdf_url: g702Url, g703_pdf_url: g703Url }).eq('id', body.payAppId);

    return NextResponse.json({ g702Url, g703Url, success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
