import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { generateLienWaiver, saveDocument } from '@/lib/pdf-engine';

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    const body = await req.json();
    const db = createServerClient();

    const { data: project } = await db.from('projects').select('*').eq('id', body.projectId).single();
    const p = project as any;

    const pdfBytes = await generateLienWaiver({
      waiverType: body.waiverType,
      state: body.state || p?.state || 'AZ',
      claimantName: body.claimantName,
      projectName: p?.name || body.projectName,
      projectAddress: p?.address || '',
      ownerName: p?.owner_entity?.name || '',
      gcName: p?.gc_name || '',
      throughDate: body.throughDate,
      amount: body.amount,
      checkNumber: body.checkNumber,
    });

    const pdfUrl = await saveDocument(body.projectId, `lien-waiver-${body.waiverType}`, pdfBytes, body, user?.id || p?.tenant_id);

    // Save to DB
    const { data: waiver } = await db.from('lien_waivers').insert({
      tenant_id: user?.id || p?.tenant_id,
      project_id: body.projectId,
      sub_id: body.subId || null,
      pay_app_id: body.payAppId || null,
      waiver_type: body.waiverType,
      state: body.state || p?.state || 'AZ',
      amount: body.amount,
      through_date: body.throughDate,
      status: 'pending',
      pdf_url: pdfUrl,
    }).select().single();

    return NextResponse.json({ pdfUrl, waiver, success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
