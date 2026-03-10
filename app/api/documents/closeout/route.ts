import { NextRequest, NextResponse } from 'next/server';
import { DocumentGenerator } from '../../../../document-generator';

export async function POST(req: NextRequest) {
  const body      = await req.json().catch(() => ({})) as Record<string, unknown>;
  const tenantId  = String(body.tenantId  ?? '');
  const projectId = String(body.projectId ?? '');
  if (!tenantId || !projectId)
    return NextResponse.json({ error: 'tenantId and projectId required' }, { status: 400 });
  const result = await DocumentGenerator.generateCloseoutPackage({ tenantId, projectId });
  return NextResponse.json(result);
}
