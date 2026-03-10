import { NextRequest, NextResponse } from 'next/server';
import { DocumentGenerator } from '../../../../document-generator';

export async function POST(req: NextRequest) {
  const body      = await req.json().catch(() => ({})) as Record<string, unknown>;
  const tenantId  = String(body.tenantId  ?? '');
  const projectId = String(body.projectId ?? '');
  if (!tenantId || !projectId)
    return NextResponse.json({ error: 'tenantId and projectId required' }, { status: 400 });
  const docId = await DocumentGenerator.generateSubstantialCompletionCertificate({
    tenantId, projectId,
    contractId:     body.contractId     as string | undefined,
    completionDate: body.completionDate as string | undefined,
  });
  return NextResponse.json({ documentId: docId });
}
