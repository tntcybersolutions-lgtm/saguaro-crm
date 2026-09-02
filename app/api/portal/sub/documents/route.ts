import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { signStoredUrl } from '@/lib/storage-signing';
import { must } from '@/lib/db-write';

const BUCKET = 'project-files';
const MAX_BYTES = 100 * 1024 * 1024; // 100 MB — videos allowed
const ALLOWED = /\.(pdf|xlsx?|docx?|csv|png|jpe?g|webp|heic|mp4|mov|webm)$/i;
// Categories that ALSO feed the compliance engine (and the payment gate).
const COMPLIANCE_CATEGORIES = new Set(['insurance', 'w9', 'lien_waiver', 'safety_cert', 'license', 'bond']);

async function authenticateSubPortal(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') || req.headers.get('x-portal-token');
  if (!token) return null;
  const db = createServerClient();
  const { data: session } = await db
    .from('portal_sub_sessions')
    .select('*')
    .eq('token', token)
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
      .contains('visible_to', ['sub'])
      .order('created_at', { ascending: false });
    if (category) query = query.eq('category', category);
    const { data: documents, error } = await query;
    if (error) throw error;

    const signed = await Promise.all(
      (documents || []).map(async (d: { file_url: string | null }) => ({
        ...d,
        file_url: d.file_url ? await signStoredUrl(BUCKET, d.file_url, 3600).catch(() => d.file_url) : d.file_url,
      })),
    );
    return NextResponse.json({ documents: signed });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST — sub uploads a document (multipart form: file, category, title?, expiry_date?).
 *  PDF / Excel / Word / CSV / images / video. Compliance categories also upsert the
 *  sub's compliance record so the payment gate and expiry alerts see them instantly. */
export async function POST(req: NextRequest) {
  try {
    const session = await authenticateSubPortal(req);
    if (!session) return NextResponse.json({ error: 'Invalid or expired portal token' }, { status: 401 });
    const db = createServerClient();

    const form = await req.formData();
    const file = form.get('file') as File | null;
    const category = String(form.get('category') || 'other');
    const title = String(form.get('title') || '') || (file?.name ?? 'Document');
    const expiry = String(form.get('expiry_date') || '') || null;

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File too large (100 MB max)' }, { status: 413 });
    const safeName = (file.name || 'upload').replace(/[^\w.\-]+/g, '_');
    if (!ALLOWED.test(safeName)) {
      return NextResponse.json({ error: 'Unsupported file type. Allowed: PDF, Excel, Word, CSV, images, video.' }, { status: 415 });
    }

    const path = `${session.tenant_id}/projects/${session.project_id}/sub-portal/${session.sub_id || session.id}/${Date.now()}-${safeName}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || 'application/octet-stream';
    const { error: upErr } = await db.storage.from(BUCKET).upload(path, buffer, { contentType, upsert: false });
    if (upErr) throw upErr;
    const publicUrl = db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

    const { data: doc, error: insErr } = await db
      .from('portal_documents')
      .insert({
        tenant_id: session.tenant_id,
        project_id: session.project_id,
        session_id: session.id,
        title,
        category,
        doc_type: contentType,
        file_url: publicUrl,
        file_size: file.size,
        status: 'submitted',
        uploaded_by: session.sub_company || 'sub',
        visible_to: ['sub', 'gc'],
      } as never)
      .select()
      .single();
    if (insErr) throw insErr;

    // Compliance categories flow straight into the compliance record + payment gate.
    if (COMPLIANCE_CATEGORIES.has(category) && session.sub_id) {
      await must(db.from('portal_sub_compliance_docs').insert({
        tenant_id: session.tenant_id,
        sub_id: session.sub_id,
        doc_type: category,
        file_url: publicUrl,
        expiry_date: expiry,
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
      metadata: { title, category, file: safeName, size: file.size, by: session.sub_company },
    } as never), 'portal_activity insert');

    const signedUrl = await signStoredUrl(BUCKET, publicUrl, 3600).catch(() => publicUrl);
    return NextResponse.json({ success: true, document: { ...(doc as object), file_url: signedUrl } });
  } catch {
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 });
  }
}
