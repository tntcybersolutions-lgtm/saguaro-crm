import { NextRequest, NextResponse } from 'next/server';
import { generateWH347, saveDocument } from '@/lib/pdf-engine';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { must } from '@/lib/db-write';

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  try {
    const user = await getUser(req);
    const body = await req.json();
    const db = createServerClient();
    const { data: project } = await db.from('projects').select('*').eq('id', body.projectId).single();
    const p = project as any;

    const pdfBytes = await generateWH347({
      projectName: p?.name || body.projectName,
      projectAddress: p?.address || '',
      gcName: body.gcName || '',
      weekEnding: body.weekEnding,
      payrollNumber: body.payrollNumber || 1,
      employees: body.employees || [],
    });

    const pdfUrl = await saveDocument(body.projectId, 'wh347', pdfBytes, body, user?.id || p?.tenant_id);

    // Save certified payroll record
    await must(db.from('certified_payroll').insert({
      tenant_id: user?.id || p?.tenant_id,
      project_id: body.projectId,
      week_ending: body.weekEnding,
      payroll_number: body.payrollNumber || 1,
      status: 'submitted',
      entries: body.employees || [],
      total_gross: (body.employees || []).reduce((s: number, e: any) => s + (e.grossEarnings || 0), 0),
      total_net: (body.employees || []).reduce((s: number, e: any) => s + (e.netPay || 0), 0),
      pdf_url: pdfUrl,
      submitted_at: new Date().toISOString(),
    }), 'certified_payroll insert');

    return NextResponse.json({ pdfUrl, success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
