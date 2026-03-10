import { NextRequest, NextResponse } from 'next/server';
import { DocumentGenerator } from '../../../../document-generator';
import { supabaseAdmin } from '../../../../supabase/admin';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const [segment] = path;

  if (segment === 'list') {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId') || '';
    const tenantId  = searchParams.get('tenantId')  || '';
    const docType   = searchParams.get('type')       || '';

    try {
      let query = supabaseAdmin
        .from('generated_documents')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (projectId) query = query.eq('project_id', projectId);
      if (tenantId)  query = query.eq('tenant_id', tenantId);
      if (docType)   query = query.eq('doc_type', docType);

      const { data, error } = await query;
      if (error) throw error;

      return NextResponse.json({ documents: data || [] });
    } catch {
      return NextResponse.json({ documents: [] });
    }
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const [segment] = path;

  if (segment === 'bid-package') {
    const body         = await req.json().catch(() => ({})) as Record<string, unknown>;
    const tenantId     = String(body.tenantId     ?? '');
    const projectId    = String(body.projectId    ?? '');
    const bidPackageId = String(body.bidPackageId ?? '');
    if (!tenantId || !projectId || !bidPackageId)
      return NextResponse.json({ error: 'tenantId, projectId, bidPackageId required' }, { status: 400 });
    const result = await DocumentGenerator.generateBidDocumentPackage({ tenantId, projectId, bidPackageId });
    return NextResponse.json(result);
  }

  if (segment === 'closeout') {
    const body      = await req.json().catch(() => ({})) as Record<string, unknown>;
    const tenantId  = String(body.tenantId  ?? '');
    const projectId = String(body.projectId ?? '');
    if (!tenantId || !projectId)
      return NextResponse.json({ error: 'tenantId and projectId required' }, { status: 400 });
    const result = await DocumentGenerator.generateCloseoutPackage({ tenantId, projectId });
    return NextResponse.json(result);
  }

  if (segment === 'lien-waiver') {
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

  if (segment === 'pay-application') {
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

  if (segment === 'seed-templates') {
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (token !== process.env.SAGUARO_API_SECRET)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await DocumentGenerator.seedDocumentTemplates();
    return NextResponse.json({ success: true, message: 'Document templates seeded.' });
  }

  if (segment === 'substantial-completion') {
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

  if (segment === 'w9-request') {
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

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
