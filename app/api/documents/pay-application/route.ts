import { NextRequest, NextResponse } from 'next/server';
import { DocumentGenerator } from '../../../../document-generator';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const tenantId   = String(body.tenantId   ?? '');
  const projectId  = String(body.projectId  ?? '');
  const contractId = String(body.contractId ?? '');
  if (!tenantId || !projectId || !contractId)
    return NextResponse.json({ error: 'tenantId, projectId, contractId required' }, { status: 400 });
  const result = await DocumentGenerator.generatePayApplication({ tenantId, projectId, contractId,
    applicationNumber: body.applicationNumber as number | undefined,
    periodFrom: body.periodFrom as string | undefined,
    periodTo:   body.periodTo   as string | undefined,
  });
  return NextResponse.json(result);
}
