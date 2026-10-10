import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error';
import { generateA310, saveDocument } from '@/lib/pdf-engine';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  try {
    const user = await getUser(req);
    const body = await req.json();
    const db = createServerClient();
    const { data: project } = await db.from('projects').select('*')
      .eq('id', body.projectId).eq('tenant_id', g.user.tenantId).single();
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
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

    const pdfUrl = await saveDocument(body.projectId, 'a310-bid-bond', pdfBytes, body, g.user.tenantId);
    return NextResponse.json({ pdfUrl, success: true });
  } catch (e) {
    return apiError('documents/a310', e, "Couldn't generate the A310 bid bond. Please try again.");
  }
}
