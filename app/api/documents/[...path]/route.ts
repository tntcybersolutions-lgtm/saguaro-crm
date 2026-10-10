import { NextRequest, NextResponse } from 'next/server';
import { DocumentGenerator } from '../../../../document-generator';
import { supabaseAdmin } from '../../../../supabase/admin';
import { getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { signStoredUrl } from '@/lib/storage-signing';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const [segment] = path;

  if (segment === 'list') {
    // AUTH + TENANT: was unauthenticated and scoped by a client-supplied
    // ?tenantId= (cross-tenant document leak). Tenant comes from the session.
    const user = await getUser(req);
    if (!user) return NextResponse.json({ documents: [], error: 'unauthorized' }, { status: 401 });
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

      // 'documents' bucket is private — sign each URL on read.
      const documents = await Promise.all(
        (data || []).map(async (d: any) => ({ ...d, pdf_url: await signStoredUrl('documents', d.pdf_url) })),
      );
      return NextResponse.json({ documents });
    } catch (e) {
    // A failed read must NOT render as an empty list. The screen would say
    // "no documents" with total confidence when the truth is that the query
    // failed — and the old body carried source:'error', which no screen has
    // ever read. Real status, real server-side log, correlation id.
    return apiError('documents/[...path]', e, 'Could not load documents');
  }
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

/**
 * POST /api/documents/[...path]
 *
 * This handler had no authentication of any kind, and all seven of its branches
 * — bid-package, closeout, lien-waiver, pay-application, seed-templates,
 * substantial-completion, w9-request — read `tenantId` straight from the
 * request body. Anyone on the internet could generate documents against any
 * tenant by naming its id: bid packages, lien waivers, pay applications,
 * closeout books, all built from that tenant's live project data.
 *
 * The guard is here rather than in each branch so a new branch cannot be added
 * without it, and `authTenantId` below is the ONLY tenant any branch may use.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const [segment] = path;

  /* seed-templates is machine-to-machine and carries its own SAGUARO_API_SECRET
     bearer check below — it seeds global templates and belongs to no tenant, so
     requiring a user session here would break it. Every other branch acts on
     tenant data and needs a real caller. */
  let authTenantId = '';
  if (segment !== 'seed-templates') {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    authTenantId = user.tenantId;
  }

  /* Retired. This built a second, different jacket: it read a bid_jackets
     table that does not exist and a due_at column bid_packages does not have,
     looked the package up without its tenant, and returned no file. The only
     caller (the package page) sent packageId where this read bidPackageId, so
     it answered 400 every time. There is one jacket PDF now, made from the
     live jacket by POST /api/bid-packages/<id>/generate-jacket. */
  if (segment === 'bid-package') {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const id = String(body.bidPackageId ?? body.packageId ?? '').trim();
    return NextResponse.json(
      {
        error: 'This way of making a bid jacket PDF has been retired. Use Download PDF on the bid package.',
        use: id ? `/api/bid-packages/${encodeURIComponent(id)}/generate-jacket` : '/api/bid-packages/<id>/generate-jacket',
      },
      { status: 410 },
    );
  }

  if (segment === 'closeout') {
    const body      = await req.json().catch(() => ({})) as Record<string, unknown>;
    const tenantId     = authTenantId; // never body.tenantId — the caller does not choose the tenant
    const projectId = String(body.projectId ?? '');
    if (!tenantId || !projectId)
      return NextResponse.json({ error: 'tenantId and projectId required' }, { status: 400 });
    const result = await DocumentGenerator.generateCloseoutPackage({ tenantId, projectId });
    return NextResponse.json(result);
  }

  if (segment === 'lien-waiver') {
    const body         = await req.json().catch(() => ({})) as Record<string, unknown>;
    const tenantId     = authTenantId; // never body.tenantId — the caller does not choose the tenant
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
    const tenantId     = authTenantId; // never body.tenantId — the caller does not choose the tenant
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
    const tenantId     = authTenantId; // never body.tenantId — the caller does not choose the tenant
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
    const tenantId     = authTenantId; // never body.tenantId — the caller does not choose the tenant
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
