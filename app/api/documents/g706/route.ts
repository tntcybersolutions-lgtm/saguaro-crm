import { NextRequest, NextResponse } from 'next/server';
import { generateG706, saveDocument } from '@/lib/pdf-engine';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const db = createServerClient();

    // body.projectId is caller-supplied and this client is the service role key,
    // so without the tenant filter this fetched ANY project by id — and its
    // name, address, owner entity and contract amount were then rendered into
    // the returned G706. That handed another tenant's contract value to anyone
    // who knew a project id.
    const { data: project } = await db
      .from('projects')
      .select('*')
      .eq('id', body.projectId)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    const p = project as any;

    // Check if all lien waivers received
    const { count: pendingWaivers } = await db.from('lien_waivers').select('*', { count: 'exact', head: true }).eq('project_id', body.projectId).eq('tenant_id', user.tenantId).neq('status', 'signed');
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
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
