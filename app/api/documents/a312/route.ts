import { NextRequest, NextResponse } from 'next/server';
import { generateA312, saveDocument } from '@/lib/pdf-engine';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    const body = await req.json();
    const db = createServerClient();
    const { data: project } = await db.from('projects').select('*').eq('id', body.projectId).single();
    const p = project as any;

    const pdfBytes = await generateA312({
      projectName: p?.name || body.projectName,
      ownerName: p?.owner_entity?.name || body.ownerName || '',
      gcName: body.gcName || '',
      gcAddress: body.gcAddress || '',
      suretyName: body.suretyName || '',
      suretyAddress: body.suretyAddress || '',
      contractAmount: p?.contract_amount || body.contractAmount || 0,
      bondAmount: body.bondAmount || p?.contract_amount || 0,
      contractDate: p?.start_date || body.contractDate || '',
      bondType: body.bondType || 'both',
    });

    const pdfUrl = await saveDocument(body.projectId, 'a312-bond', pdfBytes, body, user?.id || p?.tenant_id);
    return NextResponse.json({ pdfUrl, success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
