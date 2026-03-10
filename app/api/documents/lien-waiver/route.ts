import { NextRequest, NextResponse } from 'next/server';
import { DocumentGenerator } from '../../../../document-generator';

export async function POST(req: NextRequest) {
  const body         = await req.json().catch(() => ({})) as Record<string, unknown>;
  const tenantId     = String(body.tenantId     ?? '');
  const projectId    = String(body.projectId    ?? '');
  const waiverType   = String(body.waiverType   ?? '');
  const state        = String(body.state        ?? '');
  const claimantName = String(body.claimantName ?? '');
  const amount       = Number(body.amount       ?? 0);
  const throughDate  = String(body.throughDate  ?? '');
  if (!tenantId || !projectId || !waiverType || !state || !claimantName || !amount || !throughDate)
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  const docId = await DocumentGenerator.generateLienWaiver({
    tenantId, projectId, contractId: body.contractId as string | undefined,
    waiverType: waiverType as 'conditional_partial'|'unconditional_partial'|'conditional_final'|'unconditional_final',
    state, claimantName,
    claimantAddress: body.claimantAddress as string | undefined,
    amount, throughDate,
    exceptions: body.exceptions as string | undefined,
  });
  return NextResponse.json({ documentId: docId });
}
