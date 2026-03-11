import { NextRequest, NextResponse } from 'next/server';
import { generateG706, saveDocument } from '@/lib/pdf-engine';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    const body = await req.json();
    const db = createServerClient();
    const { data: project } = await db.from('projects').select('*').eq('id', body.projectId).single();
    const p = project as any;

    // Check if all lien waivers received
    const { count: pendingWaivers } = await db.from('lien_waivers').select('*', { count: 'exact', head: true }).eq('project_id', body.projectId).neq('status', 'signed');
    const allWaiversReceived = (pendingWaivers || 0) === 0;

    const pdfBytes = await generateG706({
      projectName: p?.name || '',
      projectAddress: p?.address || '',
      ownerName: p?.owner_entity?.name || '',
      gcName: body.gcName || '',
      gcAddress: p?.address || '',
      finalAmount: body.finalAmount || p?.contract_amount || 0,
      completionDate: body.completionDate || new Date().toISOString().split('T')[0],
      allWaiversReceived,
    });

    const pdfUrl = await saveDocument(body.projectId, 'g706', pdfBytes, body, user?.id || p?.tenant_id);
    return NextResponse.json({ pdfUrl, allWaiversReceived, success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
