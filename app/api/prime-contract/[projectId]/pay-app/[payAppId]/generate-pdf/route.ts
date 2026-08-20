import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; payAppId: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId, payAppId } = await params;
  const db = createServerClient();

  try {
    // Load all data
    const { data: payApp } = await db
      .from('owner_pay_applications')
      .select('*')
      .eq('id', payAppId)
      .eq('tenant_id', user.tenantId)
      .single();

    if (!payApp) return NextResponse.json({ error: 'Pay application not found' }, { status: 404 });

    const { data: contract } = await db
      .from('prime_contracts')
      .select('*')
      .eq('id', payApp.prime_contract_id)
      .eq('tenant_id', user.tenantId)
      .single();

    if (!contract) return NextResponse.json({ error: 'Prime contract not found' }, { status: 404 });

    const { data: project } = await db
      .from('projects')
      .select('name, address, city, state')
      .eq('id', projectId)
      .eq('tenant_id', user.tenantId)
      .single();

    const { data: lineItems } = await db
      .from('owner_pay_app_line_items')
      .select('*')
      .eq('owner_pay_app_id', payAppId)
      .eq('tenant_id', user.tenantId)
      .order('item_number');

    const projectName = project?.name || 'Project';
    const projectLocation = [project?.address, project?.city, project?.state].filter(Boolean).join(', ');

    // Build G703 rows
    const g703Rows = (lineItems || []).map((li: any) => `
      <tr>
        <td style="text-align:center">${li.item_number || ''}</td>
        <td>${li.description || ''}</td>
        <td style="text-align:right">${fmt(li.scheduled_value || 0)}</td>
        <td style="text-align:right">${fmt(li.previous_applications || 0)}</td>
        <td style="text-align:right">${fmt(li.work_this_period || 0)}</td>
        <td style="text-align:right">${fmt(li.materials_stored || 0)}</td>
        <td style="text-align:right">${fmt(li.total_completed_stored || 0)}</td>
        <td style="text-align:center">${li.pct_complete || 0}%</td>
        <td style="text-align:right">${fmt(li.balance_to_finish || 0)}</td>
        <td style="text-align:right">${fmt(li.retainage || 0)}</td>
      </tr>`).join('');

    const totalScheduled = (lineItems || []).reduce((s: number, li: any) => s + Number(li.scheduled_value || 0), 0);
    const totalPrev = (lineItems || []).reduce((s: number, li: any) => s + Number(li.previous_applications || 0), 0);
    const totalWork = (lineItems || []).reduce((s: number, li: any) => s + Number(li.work_this_period || 0), 0);
    const totalMat = (lineItems || []).reduce((s: number, li: any) => s + Number(li.materials_stored || 0), 0);
    const totalCompleted = (lineItems || []).reduce((s: number, li: any) => s + Number(li.total_completed_stored || 0), 0);
    const totalBal = (lineItems || []).reduce((s: number, li: any) => s + Number(li.balance_to_finish || 0), 0);
    const totalRet = (lineItems || []).reduce((s: number, li: any) => s + Number(li.retainage || 0), 0);

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>G702/G703 — Application #${payApp.application_number}</title>
<style>
  @media print { body { margin: 0; } .page-break { page-break-before: always; } }
  body { font-family: 'Times New Roman', serif; color: #1a1a1a; max-width: 1000px; margin: 0 auto; padding: 20px; }
  h1 { font-size: 18px; text-align: center; margin-bottom: 4px; }
  h2 { font-size: 14px; text-align: center; margin-top: 2px; font-weight: normal; }
  .header-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 16px 0; font-size: 12px; }
  .header-grid .label { font-weight: bold; }
  .summary-table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 12px; }
  .summary-table td { padding: 6px 8px; border: 1px solid #333; }
  .summary-table .label { width: 60%; font-weight: normal; }
  .summary-table .value { text-align: right; font-weight: bold; }
  .highlight { background: #f0f0d0; font-size: 14px; }
  .g703 { width: 100%; border-collapse: collapse; font-size: 10px; margin-top: 12px; }
  .g703 th, .g703 td { border: 1px solid #333; padding: 4px 6px; }
  .g703 th { background: #e8e8e8; font-weight: bold; text-align: center; font-size: 9px; }
  .totals td { font-weight: bold; border-top: 2px solid #000; }
  .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px; font-size: 11px; }
  .sig-line { border-top: 1px solid #000; margin-top: 40px; padding-top: 4px; }
</style>
</head><body>

<!-- PAGE 1: G702 -->
<h1>APPLICATION AND CERTIFICATE FOR PAYMENT</h1>
<h2>AIA Document G702</h2>

<div class="header-grid">
  <div>
    <div><span class="label">TO OWNER:</span> ${contract.owner_name || ''}</div>
    <div>${contract.owner_company || ''}</div>
    <div>${contract.owner_address || ''}</div>
  </div>
  <div>
    <div><span class="label">APPLICATION NO:</span> ${payApp.application_number}</div>
    <div><span class="label">PERIOD FROM:</span> ${payApp.period_from}</div>
    <div><span class="label">PERIOD TO:</span> ${payApp.period_to}</div>
    <div><span class="label">CONTRACT DATE:</span> ${contract.contract_date || 'N/A'}</div>
  </div>
  <div>
    <div><span class="label">FROM CONTRACTOR:</span> ${contract.gc_company_name || ''}</div>
    <div>${contract.gc_address || ''}</div>
  </div>
  <div>
    <div><span class="label">PROJECT:</span> ${projectName}</div>
    <div>${projectLocation}</div>
  </div>
</div>

<table class="summary-table">
  <tr><td class="label">1. ORIGINAL CONTRACT SUM</td><td class="value">${fmt(payApp.original_contract_sum || 0)}</td></tr>
  <tr><td class="label">2. Net change by Change Orders</td><td class="value">${fmt(payApp.net_change_by_change_orders || 0)}</td></tr>
  <tr><td class="label">3. CONTRACT SUM TO DATE (Line 1 + 2)</td><td class="value">${fmt(payApp.contract_sum_to_date || 0)}</td></tr>
  <tr><td class="label">4. TOTAL COMPLETED & STORED TO DATE</td><td class="value">${fmt(payApp.completed_stored_to_date || 0)}</td></tr>
  <tr><td class="label">5. RETAINAGE (${contract.retainage_pct || 10}%)</td><td class="value">${fmt(payApp.total_retainage || 0)}</td></tr>
  <tr><td class="label">6. TOTAL EARNED LESS RETAINAGE (Line 4 less Line 5)</td><td class="value">${fmt(payApp.total_earned_less_retainage || 0)}</td></tr>
  <tr><td class="label">7. LESS PREVIOUS CERTIFICATES FOR PAYMENT</td><td class="value">${fmt(payApp.less_previous_certificates || 0)}</td></tr>
  <tr class="highlight"><td class="label" style="font-weight:bold;font-size:14px;">8. CURRENT PAYMENT DUE</td><td class="value" style="font-size:16px;">${fmt(payApp.current_payment_due || 0)}</td></tr>
  <tr><td class="label">9. BALANCE TO FINISH, INCLUDING RETAINAGE</td><td class="value">${fmt(payApp.balance_to_finish_including_retainage || 0)}</td></tr>
</table>

<div class="sig-grid">
  <div>
    <div style="font-weight:bold;">CONTRACTOR:</div>
    <div class="sig-line">Signature</div>
    <div class="sig-line">Date</div>
    <div style="margin-top:8px;">State of: ________________</div>
    <div>Notarized: ________________</div>
  </div>
  <div>
    <div style="font-weight:bold;">ARCHITECT:</div>
    <div class="sig-line">Signature — ${payApp.certified_by_name || '________________________'}</div>
    <div class="sig-line">Date — ${payApp.certified_date || '________________________'}</div>
    <div style="margin-top:8px;">Amount Certified: ${payApp.certified_amount ? fmt(payApp.certified_amount) : '________________'}</div>
  </div>
</div>

<!-- PAGE 2: G703 -->
<div class="page-break"></div>
<h1>CONTINUATION SHEET</h1>
<h2>AIA Document G703 — Application #${payApp.application_number}</h2>

<table class="g703">
  <thead><tr>
    <th style="width:5%">A<br>Item No.</th>
    <th style="width:25%">B<br>Description of Work</th>
    <th style="width:10%">C<br>Scheduled Value</th>
    <th style="width:10%">D<br>From Previous Application</th>
    <th style="width:10%">E<br>This Period</th>
    <th style="width:8%">F<br>Materials Stored</th>
    <th style="width:10%">G<br>Total Completed & Stored</th>
    <th style="width:5%">H<br>%</th>
    <th style="width:10%">I<br>Balance to Finish</th>
    <th style="width:7%">J<br>Retainage</th>
  </tr></thead>
  <tbody>
    ${g703Rows}
    <tr class="totals">
      <td></td>
      <td style="text-align:right;font-weight:bold;">TOTALS</td>
      <td style="text-align:right">${fmt(totalScheduled)}</td>
      <td style="text-align:right">${fmt(totalPrev)}</td>
      <td style="text-align:right">${fmt(totalWork)}</td>
      <td style="text-align:right">${fmt(totalMat)}</td>
      <td style="text-align:right">${fmt(totalCompleted)}</td>
      <td style="text-align:center">${totalScheduled > 0 ? Math.round(totalCompleted / totalScheduled * 100) : 0}%</td>
      <td style="text-align:right">${fmt(totalBal)}</td>
      <td style="text-align:right">${fmt(totalRet)}</td>
    </tr>
  </tbody>
</table>

</body></html>`;

    // Update pay app with generated timestamp
    await db.from('owner_pay_applications').update({
      generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', payAppId).eq('tenant_id', user.tenantId);

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}
