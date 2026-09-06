import { NextRequest, NextResponse } from 'next/server';
import { DocumentGenerator } from '../../../../document-generator';
import { supabaseAdmin } from '../../../../supabase/admin';
import { getUser } from '@/lib/supabase-server';

/* Generated documents — pay applications, lien waivers, contracts, bid and
 * closeout packages.
 *
 * This dispatcher had no auth of any kind and took tenantId from the caller:
 *
 *   GET /api/documents/list with tenantId omitted returned the 100 most recent
 *   generated documents across EVERY tenant, and its catch returned an empty
 *   array so a failure was indistinguishable from "none found".
 *
 *   Every POST branch read tenantId from the request body, so any caller could
 *   generate documents against any tenant.
 *
 * tenantId now comes from the session in both. seed-templates is the one
 * exception: it is a deploy-time operation guarded by SAGUARO_API_SECRET, not
 * by a user session, so it is handled before the session guard.
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const [segment] = path;

  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (segment === 'list') {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId') || '';
    const docType   = searchParams.get('type')       || '';

    try {
      let query = supabaseAdmin
        .from('generated_documents')
        .select('*')
        .eq('tenant_id', user.tenantId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (projectId) query = query.eq('project_id', projectId);
      if (docType)   query = query.eq('doc_type', docType);

      const { data, error } = await query;
      if (error) throw error;

      return NextResponse.json({ documents: data || [] });
    } catch (e: unknown) {
      // Was `catch { return { documents: [] } }`, which reported every failure
      // as an empty result set.
      const message = e instanceof Error ? e.message : 'Internal server error';
      console.error('[documents/list] error:', message);
      return NextResponse.json({ error: message }, { status: 500 });
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

  // Deploy-time seeding, guarded by a shared secret rather than a user session.
  if (segment === 'seed-templates') {
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!process.env.SAGUARO_API_SECRET || token !== process.env.SAGUARO_API_SECRET)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await DocumentGenerator.seedDocumentTemplates();
    return NextResponse.json({ success: true, message: 'Document templates seeded.' });
  }

  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenantId = user.tenantId;

  if (segment === 'bid-package') {
    const body         = await req.json().catch(() => ({})) as Record<string, unknown>;
    const projectId    = String(body.projectId    ?? '');
    const bidPackageId = String(body.bidPackageId ?? '');
    if (!projectId || !bidPackageId)
      return NextResponse.json({ error: 'projectId and bidPackageId required' }, { status: 400 });
    const result = await DocumentGenerator.generateBidDocumentPackage({ tenantId, projectId, bidPackageId });
    return NextResponse.json(result);
  }

  if (segment === 'closeout') {
    const body      = await req.json().catch(() => ({})) as Record<string, unknown>;
    const projectId = String(body.projectId ?? '');
    if (!projectId)
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    const result = await DocumentGenerator.generateCloseoutPackage({ tenantId, projectId });
    return NextResponse.json(result);
  }

  if (segment === 'lien-waiver') {
    const body         = await req.json().catch(() => ({})) as Record<string, unknown>;
    const projectId    = String(body.projectId    ?? '');
    const waiverType   = String(body.waiverType   ?? '');
    const state        = String(body.state        ?? '');
    const claimantName = String(body.claimantName ?? '');
    const amount       = Number(body.amount       ?? 0);
    const throughDate  = String(body.throughDate  ?? '');
    if (!projectId || !waiverType || !state || !claimantName || !amount || !throughDate)
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
    const projectId  = String(body.projectId  ?? '');
    const contractId = String(body.contractId ?? '');
    if (!projectId || !contractId)
      return NextResponse.json({ error: 'projectId and contractId required' }, { status: 400 });
    const result = await DocumentGenerator.generatePayApplication({ tenantId, projectId, contractId,
      applicationNumber: body.applicationNumber as number | undefined,
      periodFrom: body.periodFrom as string | undefined,
      periodTo:   body.periodTo   as string | undefined,
    });
    return NextResponse.json(result);
  }

  if (segment === 'substantial-completion') {
    const body      = await req.json().catch(() => ({})) as Record<string, unknown>;
    const projectId = String(body.projectId ?? '');
    if (!projectId)
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    const docId = await DocumentGenerator.generateSubstantialCompletionCertificate({
      tenantId, projectId,
      contractId:     body.contractId     as string | undefined,
      completionDate: body.completionDate as string | undefined,
    });
    return NextResponse.json({ documentId: docId });
  }

  if (segment === 'w9-request') {
    const body        = await req.json().catch(() => ({})) as Record<string, unknown>;
    const projectId   = String(body.projectId   ?? '');
    const vendorName  = String(body.vendorName  ?? '');
    const vendorEmail = String(body.vendorEmail ?? '');
    if (!projectId || !vendorName || !vendorEmail)
      return NextResponse.json({ error: 'projectId, vendorName and vendorEmail required' }, { status: 400 });
    const docId = await DocumentGenerator.generateW9Request({
      tenantId, projectId, vendorName, vendorEmail,
      gcCompanyName: body.gcCompanyName as string | undefined,
    });
    return NextResponse.json({ documentId: docId });
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
