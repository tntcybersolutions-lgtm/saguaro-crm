import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { generateLienWaiver, saveDocument } from '@/lib/pdf-engine';

export async function POST(req: NextRequest) {
  try {
    /* There was no auth check here at all. getUser() was called, its null
       case ignored, and the row below written with
         tenant_id: user?.tenantId || p?.tenant_id
       -- falling back to the tenant of the project that was just fetched
       by an id off the request. An unauthenticated caller who knew a
       project id could file a lien waiver, a legal document, into that
       company's account. The fallback is gone: the tenant comes from the
       session or the request does not proceed. */
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const db = createServerClient();

    const { data: project } = await db.from('projects').select('*')
      .eq('id', body.projectId).eq('tenant_id', user.tenantId).single();
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
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

    const pdfUrl = await saveDocument(body.projectId, `lien-waiver-${body.waiverType}`, pdfBytes, body, user.tenantId);

    // Save to DB
    const { data: waiver } = await db.from('lien_waivers').insert({
      tenant_id: user.tenantId,
      project_id: body.projectId,
      sub_id: body.subId || null,
      pay_application_id: body.payAppId || null,
      waiver_type: body.waiverType,
      state: body.state || p?.state || 'AZ',
      amount: body.amount,
      through_date: body.throughDate,
      status: 'pending',
      pdf_url: pdfUrl,
    }).select().single();

    return NextResponse.json({ pdfUrl, waiver, success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
