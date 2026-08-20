import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { generateG702, generateG703 } from '@/lib/pdf-engine';
import { PDFDocument } from 'pdf-lib';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  try {
    const db = createServerClient();

    // 1. Load full pay application + project join
    const { data: payApp } = await db
      .from('pay_applications')
      .select('*, projects(id, name, address, state, zip, project_number, owner_name, owner_address, architect_name, contract_value, contract_amount, retainage_pct, gc_name, gc_entity, gc_address, gc_license_number, gc_license, pm_name, pm_email, pm_phone, county)')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single();

    if (!payApp) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const pa = payApp as Record<string, unknown>;
    const project = (pa.projects || {}) as Record<string, unknown>;

    // 2. Load SOV line items
    const { data: sovItems } = await db
      .from('sov_line_items')
      .select('*')
      .eq('pay_application_id', id)
      .eq('tenant_id', user.tenantId)
      .order('sort_order');

    const items = (sovItems || []) as Record<string, unknown>[];

    // 3. Load tenant (GC branding)
    const { data: tenant } = await db
      .from('tenants')
      .select('name, logo_url')
      .eq('id', user.tenantId)
      .single();

    const t = (tenant || {}) as Record<string, unknown>;

    // 4. Load PM profile
    const { data: profile } = await db
      .from('profiles')
      .select('full_name, first_name, title')
      .eq('id', user.id)
      .single();

    const pm = (profile || {}) as Record<string, unknown>;

    // 5. Build G702 input
    const gcName = String(t.name || project.gc_entity || project.gc_name || 'General Contractor');
    const contractSumToDate = Number(pa.contract_sum_to_date || pa.contract_sum || 0);

    const g702Bytes = await generateG702({
      projectName: String(project.name || ''),
      projectAddress: [project.address, project.state, project.zip].filter(Boolean).join(', '),
      ownerName: String(pa.owner_name || project.owner_name || ''),
      architectName: String(pa.architect_name || project.architect_name || ''),
      gcName,
      appNumber: Number(pa.app_number || 1),
      periodFrom: String(pa.period_from || ''),
      periodTo: String(pa.period_to || ''),
      contractSum: Number(pa.original_contract_sum || contractSumToDate),
      changeOrdersTotal: Number(pa.net_change_by_change_orders || pa.change_orders_total || 0),
      contractSumToDate,
      prevCompleted: items.reduce((s, i) => s + Number(i.work_from_previous || 0), 0),
      thisPeriod: items.reduce((s, i) => s + Number(i.work_this_period || 0), 0),
      materialsStored: items.reduce((s, i) => s + Number(i.materials_presently_stored || 0), 0),
      totalCompleted: Number(pa.total_completed_stored || 0),
      percentComplete: Number(pa.percent_complete || 0),
      retainagePercent: Number(pa.retainage_percent || 10),
      retainageAmount: Number(pa.retainage_held || 0),
      totalEarnedLessRetainage: Number(pa.total_earned_less_retainage || 0),
      prevPayments: Number(pa.less_previous_certificates || 0),
      currentPaymentDue: Number(pa.current_payment_due || 0),
    });

    // 6. Build G703 input
    const g703Bytes = await generateG703({
      projectName: String(project.name || ''),
      appNumber: Number(pa.app_number || 1),
      periodTo: String(pa.period_to || ''),
      lineItems: items.map((i) => ({
        lineNumber: Number(i.sort_order || 0) + 1,
        description: String(i.description || ''),
        scheduledValue: Number(i.scheduled_value || 0),
        workFromPrev: Number(i.work_from_previous || 0),
        workThisPeriod: Number(i.work_this_period || 0),
        materialsStored: Number(i.materials_presently_stored || 0),
        totalCompleted: Number(i.total_completed_stored || 0),
        percentComplete: Number(i.pct_complete || 0),
        balanceToFinish: Number(i.balance_to_finish || 0),
        retainage: Number(i.retainage || 0),
      })),
    });

    // 7. Merge G702 + G703 into single PDF
    const merged = await PDFDocument.create();
    const g702Doc = await PDFDocument.load(g702Bytes);
    const g703Doc = await PDFDocument.load(g703Bytes);

    const [g702Pages, g703Pages] = await Promise.all([
      merged.copyPages(g702Doc, g702Doc.getPageIndices()),
      merged.copyPages(g703Doc, g703Doc.getPageIndices()),
    ]);
    g702Pages.forEach(p => merged.addPage(p));
    g703Pages.forEach(p => merged.addPage(p));

    const pdfBytes = await merged.save();

    // 8. Upload to storage
    const fileName = `pay-app-${pa.app_number}.pdf`;
    const storagePath = `documents/${user.tenantId}/pay-apps/${id}/${fileName}`;

    const { error: uploadErr } = await db.storage
      .from('documents')
      .upload(storagePath, Buffer.from(pdfBytes), {
        contentType: 'application/pdf',
        upsert: true,
      });

    let pdfUrl = '';
    if (!uploadErr) {
      const { data: urlData } = db.storage.from('documents').getPublicUrl(storagePath);
      pdfUrl = urlData.publicUrl;
    } else {
      console.error('[generate-pdf] upload error:', uploadErr.message);
    }

    // 9. Update pay_application with pdf_url
    await db.from('pay_applications').update({
      pdf_url: pdfUrl || null,
      pdf_generated_at: new Date().toISOString(),
      g702_pdf_url: pdfUrl || null,
      updated_at: new Date().toISOString(),
    }).eq('id', id).eq('tenant_id', user.tenantId);

    return NextResponse.json({ data: { pdf_url: pdfUrl } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    console.error('[pay-applications/generate-pdf]', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
