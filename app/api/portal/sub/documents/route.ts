import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { signStoredUrl } from '@/lib/storage-signing';
import { must } from '@/lib/db-write';
import { apiError } from '@/lib/api-error';
import { rosterSubId } from '@/lib/sub-portal-scope';
import {
  SUB_FILES_BUCKET, documentContentType, expiryDay, ownsDocumentPath, subPortalFilePrefix,
} from '@/lib/sub-portal-files';
import { fileNameFromUrl } from '@/lib/sub-portal-view';

export const runtime = 'nodejs';

// Categories that ALSO feed the compliance engine (and the payment gate).
const COMPLIANCE_CATEGORIES = new Set(['insurance', 'w9', 'lien_waiver', 'safety_cert', 'license', 'bond']);

async function authenticateSubPortal(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') || req.headers.get('x-portal-token');
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

/** GET — list documents visible to the sub, with URLS SIGNED so they actually
 *  open (the bucket is private; raw public-URL forms 400 without a signature). */
export async function GET(req: NextRequest) {
  try {
    const session = await authenticateSubPortal(req);
    if (!session) return NextResponse.json({ error: 'Invalid or expired portal token' }, { status: 401 });
    const db = createServerClient();
    const category = req.nextUrl.searchParams.get('category');

    let query = db
      .from('portal_documents')
      .select('*')
      .eq('project_id', session.project_id!)
      .eq('tenant_id', session.tenant_id)
      .or(`status.eq.visible,session_id.eq.${session.id}`)
      .order('created_at', { ascending: false });
    if (category) query = query.eq('category', category);
    const { data: documents, error } = await query;
    if (error) throw error;

    // signStoredUrl never throws: a file it can't sign comes back '' (logged
    // there), so the row shows no View link instead of one that 400s.
    const signed = await Promise.all(
      (documents || []).map(async (d: { file_url: string | null }) => ({
        ...d,
        file_url: d.file_url ? await signStoredUrl(SUB_FILES_BUCKET, d.file_url, 3600) : d.file_url,
      })),
    );
    return NextResponse.json({ documents: signed });
  } catch (err) {
    return apiError('portal/sub/documents', err, "Couldn't load the documents. Please try again.");
  }
}

/**
 * POST — record a document the sub just uploaded.
 *   { path, category?, title?, size?, expiry_date? }
 * `path` is the object the browser put into storage through
 * /api/portal/sub/documents/upload-url. It must sit directly in this session's
 * own folder and must actually be in storage. (This used to take the file
 * itself as multipart form data, which the serverless request cap limited to
 * ~4.5 MB.) Compliance categories also file the sub's compliance record so the
 * payment gate and expiry alerts see them instantly.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await authenticateSubPortal(req);
    if (!session) return NextResponse.json({ error: 'Invalid or expired portal token' }, { status: 401 });

    // Nothing posts multipart here any more; a page loaded before the change still might.
    if ((req.headers.get('content-type') || '').toLowerCase().includes('multipart/form-data')) {
      return NextResponse.json({ error: 'This page was updated. Reload it and upload the file again.' }, { status: 400 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: 'Upload the file first, then save.', field: 'file' }, { status: 400 });

    // Only this session's own folder (the folder upload-url hands out).
    const path = body.path;
    if (!ownsDocumentPath(subPortalFilePrefix(session), path)) {
      return NextResponse.json({ error: 'Upload the file first, then save.', field: 'file' }, { status: 400 });
    }

    const expiry = expiryDay(body.expiry_date);
    if (!expiry.ok) {
      return NextResponse.json({ error: 'The expiration date isn’t a real date.', field: 'expiry_date' }, { status: 400 });
    }

    const rawCategory = typeof body.category === 'string' ? body.category.trim() : '';
    const category = /^[a-z_]{1,40}$/.test(rawCategory) ? rawCategory : 'other';
    const fileName = fileNameFromUrl(path);
    const typedTitle = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : '';
    const title = typedTitle || fileName || 'Document';
    const size = typeof body.size === 'number' && Number.isFinite(body.size) && body.size >= 0 ? Math.round(body.size) : null;
    const contentType = documentContentType(path);

    // The upload has to have landed: signing a path that isn't there fails.
    const viewUrl = await signStoredUrl(SUB_FILES_BUCKET, path, 3600);
    if (!viewUrl) {
      return NextResponse.json({ error: 'We couldn’t find the uploaded file. Choose it and upload again.', field: 'file' }, { status: 400 });
    }

    const db = createServerClient();
    const fileUrl = db.storage.from(SUB_FILES_BUCKET).getPublicUrl(path).data.publicUrl;

    const { data: doc, error: insErr } = await db
      .from('portal_documents')
      .insert({
        tenant_id: session.tenant_id,
        project_id: session.project_id,
        session_id: session.id,
        title,
        category,
        doc_type: contentType,
        file_url: fileUrl,
        file_size: size,
        status: 'submitted',
        uploaded_by: session.sub_company || 'sub',
      } as never)
      .select()
      .single();
    if (insErr) throw insErr;

    // Compliance categories flow straight into the compliance record + payment gate.
    const subId = rosterSubId(session);
    if (COMPLIANCE_CATEGORIES.has(category) && subId) {
      await must(db.from('portal_sub_compliance_docs').insert({
        tenant_id: session.tenant_id,
        sub_id: subId,
        doc_type: category,
        file_url: fileUrl,
        expiry_date: expiry.day,
        status: 'pending_review',
      } as never), 'portal_sub_compliance_docs insert');
    }

    // History — every action timestamped.
    await must(db.from('portal_activity').insert({
      tenant_id: session.tenant_id,
      project_id: session.project_id,
      session_id: session.id,
      action: 'document_uploaded',
      description: `Uploaded ${title} (${category})`,
      metadata: { title, category, file: fileName, size, by: session.sub_company },
    } as never), 'portal_activity insert');

    return NextResponse.json({ success: true, document: { ...(doc as object), file_url: viewUrl } });
  } catch (err) {
    return apiError('portal/sub/documents', err, "Couldn't save the document. Please try again.");
  }
}
