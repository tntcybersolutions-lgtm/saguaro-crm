import { NextRequest, NextResponse } from 'next/server';
import { DocumentGenerator } from '../../../../document-generator';

export async function POST(req: NextRequest) {
  const body         = await req.json().catch(() => ({})) as Record<string, unknown>;
  const tenantId     = String(body.tenantId     ?? '');
  const projectId    = String(body.projectId    ?? '');
  const bidPackageId = String(body.bidPackageId ?? '');
  if (!tenantId || !projectId || !bidPackageId)
    return NextResponse.json({ error: 'tenantId, projectId, bidPackageId required' }, { status: 400 });
  const result = await DocumentGenerator.generateBidDocumentPackage({ tenantId, projectId, bidPackageId });
  return NextResponse.json(result);
}
