import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { must } from '@/lib/db-write';
import { signStoredUrl, signUrl } from '@/lib/storage-signing';
import { notOnRoster, rosterSubId, subRecordScope } from '@/lib/sub-portal-scope';
import {
  SUB_FILES_BUCKET, complianceFolder, expiryDay, isComplianceDocType, ownsPath, subPortalFilePrefix,
} from '@/lib/sub-portal-files';
import { fileNameFromUrl } from '@/lib/sub-portal-view';
import { LOCAL_DAY_HEADER, daysUntilDay, plausibleToday } from '@/lib/calendar-day';
import { requestDay } from '@/lib/time-zone';

async function authenticateSubPortal(req: NextRequest) {
  const token =
    req.nextUrl.searchParams.get('token') ||
    req.headers.get('x-portal-token');
  if (!token) return null;

  const db = createServerClient();
  const { data: session } = await db
    .from('portal_sub_sessions')
    .select('*')
    .eq('token', token).gt('expires_at', new Date().toISOString())
    .eq('status', 'active')
    .single();

  return session;
}

type ComplianceRow = { expiry_date?: string | null; file_url?: string | null } & Record<string, unknown>;

/**
 * Expiration status + days left, and a live link to the file (the bucket is private).
 * expiry_date is a calendar day, good through its end (lib/calendar-day): 0 days
 * left is the last valid day, not "expired". `today` is the sub's own day.
 */
async function present(doc: ComplianceRow, today: string) {
  let expiration_status = 'valid';
  let days_until_expiry: number | null = null;
  if (doc.expiry_date) {
    days_until_expiry = daysUntilDay(doc.expiry_date, today);
    if (days_until_expiry !== null && days_until_expiry < 0) expiration_status = 'expired';
    else if (days_until_expiry !== null && days_until_expiry <= 30) expiration_status = 'expiring_soon';
  }
  const file_url = doc.file_url ? (await signUrl(doc.file_url, 3600)) || null : null;
  return { ...doc, file_url, expiration_status, days_until_expiry };
}

/** GET — List compliance documents for this sub with expiration tracking and a link to each file */
export async function GET(req: NextRequest) {
  try {
    const session = await authenticateSubPortal(req);
    if (!session) {
      return NextResponse.json(
        { error: 'Invalid or expired portal token' },
        { status: 401 }
      );
    }

    // Compliance records belong to a roster sub; an email-only invite has none yet (lib/sub-portal-scope).
    const subId = rosterSubId(session);
    if (!subId) return NextResponse.json({ compliance_docs: [] });

    const db = createServerClient();

    const { data: docs, error } = await db
      .from('portal_sub_compliance_docs')
      .select('*')
      .eq('sub_id', subId)
      .eq('tenant_id', session.tenant_id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // The sub's own day; with no day header, their phone's zone, else their GC's company zone.
    const today = plausibleToday(req.headers.get(LOCAL_DAY_HEADER), (await requestDay(req.headers, db, session.tenant_id, 'portal/sub/compliance')).zone);
    const compliance_docs = await Promise.all(((docs || []) as ComplianceRow[]).map((d) => present(d, today)));
    return NextResponse.json({ compliance_docs });
  } catch (err) {
    return apiError('portal/sub/compliance', err, "Couldn't load your compliance documents.");
  }
}

/**
 * POST — record an uploaded compliance document.
 *   { doc_type, path, expiry_date? }
 * `path` is the object the browser just uploaded through
 * /api/portal/sub/compliance/upload-url. It must sit in this session's own
 * compliance folder and must actually be in storage; the record then carries
 * its URL. (This used to take a typed file name and store no file at all.)
 */
export async function POST(req: NextRequest) {
  try {
    const session = await authenticateSubPortal(req);
    if (!session) {
      return NextResponse.json(
        { error: 'Invalid or expired portal token' },
        { status: 401 }
      );
    }

    const scope = subRecordScope(session);
    if (!scope) {
      const r = notOnRoster(session, 'a compliance document');
      return NextResponse.json(r.body, { status: r.status });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: 'Send the document type and the uploaded file.' }, { status: 400 });

    const docType = body.doc_type;
    if (!isComplianceDocType(docType)) {
      return NextResponse.json({ error: 'Pick the document type.', field: 'doc_type' }, { status: 400 });
    }
    const expiry = expiryDay(body.expiry_date ?? body.expires_at);
    if (!expiry.ok) {
      return NextResponse.json({ error: 'The expiration date isn’t a real date.', field: 'expiry_date' }, { status: 400 });
    }

    // Only this session's own compliance folder (the folder upload-url hands out).
    const path = body.path;
    if (!ownsPath(complianceFolder(subPortalFilePrefix(session)), path)) {
      return NextResponse.json({ error: 'Upload the file first, then save.', field: 'file' }, { status: 400 });
    }

    // The upload has to have landed: signing a path that isn't there fails.
    const viewUrl = await signStoredUrl(SUB_FILES_BUCKET, path, 3600);
    if (!viewUrl) {
      return NextResponse.json({ error: 'We couldn’t find the uploaded file. Choose it and upload again.', field: 'file' }, { status: 400 });
    }

    const db = createServerClient();
    const fileUrl = db.storage.from(SUB_FILES_BUCKET).getPublicUrl(path).data.publicUrl;

    // Live portal_sub_compliance_docs columns: tenant_id, sub_id, doc_type,
    // file_url, expiry_date, status, verified_at, created_at. There is no
    // project_id / file_name / carrier / policy_number / coverage_amount
    // column; the file's own name is the last part of file_url.
    const { data: doc, error } = await db
      .from('portal_sub_compliance_docs')
      .insert({
        sub_id: scope.subId,
        tenant_id: scope.tenantId,
        doc_type: docType,
        file_url: fileUrl,
        expiry_date: expiry.day,
        status: 'pending_review',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    // History — every upload timestamped, like the Documents tab's uploads.
    const fileName = fileNameFromUrl(path);
    await must(db.from('portal_activity').insert({
      tenant_id: scope.tenantId,
      project_id: scope.projectId,
      session_id: session.id,
      action: 'document_uploaded',
      description: `Uploaded ${fileName} (${docType.replace(/_/g, ' ')})`,
      metadata: { title: fileName, category: docType, compliance_doc_id: (doc as { id: string }).id, expiry_date: expiry.day, by: session.sub_company },
    } as never), 'portal_activity insert');

    const presented = await present(doc as ComplianceRow, plausibleToday(req.headers.get(LOCAL_DAY_HEADER), (await requestDay(req.headers, db, scope.tenantId, 'portal/sub/compliance')).zone));
    return NextResponse.json(
      { compliance_doc: { ...presented, file_url: viewUrl }, message: 'Document uploaded successfully' },
      { status: 201 }
    );
  } catch (err) {
    return apiError('portal/sub/compliance', err, "Couldn't save the document. Please try again.");
  }
}
