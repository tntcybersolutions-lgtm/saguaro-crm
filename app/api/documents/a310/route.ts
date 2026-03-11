import { NextRequest, NextResponse } from 'next/server';
import { generateA310, saveDocument } from '@/lib/pdf-engine';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    const body = await req.json();
    const db = createServerClient();
    const { data: project } = await db.from('projects').select('*').eq('id', body.projectId).single();
    const p = project as any;

    const pdfBytes = await generateA310({
      projectName: p?.name || body.projectName,
      projectAddress: p?.address || '',
      ownerName: p?.owner_entity?.name || body.ownerName || '',
      gcName: body.gcName || '',
      gcAddress: body.gcAddress || p?.address || '',
      suretyName: body.suretyName || '',
      bondAmount: body.bondAmount || 0,
      bidDate: body.bidDate || '',
    });

    const pdfUrl = await saveDocument(body.projectId, 'a310-bid-bond', pdfBytes, body, user?.id || p?.tenant_id);
    return NextResponse.json({ pdfUrl, success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
