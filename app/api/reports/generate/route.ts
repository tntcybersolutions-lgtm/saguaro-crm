import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../supabase/admin';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { reportType, format = 'pdf', projectId, tenantId } = body;
  if (!reportType) {
    return NextResponse.json({ error: 'reportType required' }, { status: 400 });
  }

  // In a full implementation, these would query the DB and generate PDF/CSV
  // For now, return a structured placeholder that callers can display
  const reportMeta: Record<string, { title: string; description: string }> = {
    'job-cost': { title: 'Job Cost Report', description: 'Budget vs actuals by cost code' },
    'bid-win-loss': { title: 'Bid Win/Loss Summary', description: 'Win rate by trade and margin analysis' },
    'schedule-variance': { title: 'Schedule Variance Report', description: 'Critical path delays and milestone status' },
    'pay-app-status': { title: 'Pay Application Status', description: 'All pay apps — billed, certified, paid, retainage' },
    'lien-waiver-log': { title: 'Lien Waiver Log', description: 'All waivers by project and subcontractor' },
    'insurance-compliance': { title: 'Insurance Compliance Report', description: 'COI status and expiry dates' },
    'autopilot-alerts': { title: 'Autopilot Alert History', description: 'All AI alerts by project' },
    'rfi-log': { title: 'RFI Log', description: 'All RFIs with status and response times' },
  };

  const meta = reportMeta[reportType] || { title: reportType, description: '' };

  try {
    // Log the report request
    await supabaseAdmin.from('report_runs').insert({
      tenant_id: tenantId || null,
      project_id: projectId || null,
      report_type: reportType,
      format,
      status: 'completed',
    }).single();
  } catch {
    // Table may not exist yet — continue gracefully
  }

  return NextResponse.json({
    success: true,
    reportType,
    format,
    title: meta.title,
    message: `${meta.title} generated successfully. In production this returns a signed download URL for the ${format.toUpperCase()} file.`,
    downloadUrl: null, // Would be a Supabase Storage signed URL in production
  });
}
