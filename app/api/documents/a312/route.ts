import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error';
import { generateA312, saveDocument } from '@/lib/pdf-engine';
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

    const pdfUrl = await saveDocument(body.projectId, 'a312-bond', pdfBytes, body, g.user.tenantId);
    return NextResponse.json({ pdfUrl, success: true });
  } catch (e) {
    return apiError('documents/a312', e, "Couldn't generate the A312 bond. Please try again.");
  }
}
