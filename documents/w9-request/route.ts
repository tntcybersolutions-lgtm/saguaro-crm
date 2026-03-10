import { NextRequest, NextResponse } from 'next/server';
import { DocumentGenerator } from '../../../../document-generator';

export async function POST(req: NextRequest) {
  const body        = await req.json().catch(() => ({})) as Record<string, unknown>;
  const tenantId    = String(body.tenantId    ?? '');
  const projectId   = String(body.projectId   ?? '');
  const vendorName  = String(body.vendorName  ?? '');
  const vendorEmail = String(body.vendorEmail ?? '');
  if (!tenantId || !projectId || !vendorName || !vendorEmail)
    return NextResponse.json({ error: 'tenantId, projectId, vendorName, vendorEmail required' }, { status: 400 });
  const docId = await DocumentGenerator.generateW9Request({
    tenantId, projectId, vendorName, vendorEmail,
    gcCompanyName: body.gcCompanyName as string | undefined,
  });
  return NextResponse.json({ documentId: docId });
}
