import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { signStoredUrl } from '@/lib/storage-signing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BUCKET = 'project-files';
const MAX_BYTES = 100 * 1024 * 1024; // 100MB — signed contract PDFs/scans

/**
 * Attach a signed (executed) contract document.
 *
 * Was: read `req.json()` expecting { file_name, file_url } — but the contracts
 * page posts multipart FormData('file', file), so every save 500'd and no signed
 * contract ever attached. Now: parse the uploaded file, push it to the private
 * `project-files` bucket under a TENANT-PREFIXED path (same pattern as
 * files/upload — RLS-safe), persist the stored url onto `contracts.pdf_url`
 * (tenant-scoped; service-role bypasses RLS so we filter tenant_id + id), keep a
 * `contract_documents` history row, and return a short-lived signed URL that
 * actually resolves.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Budget', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;

  try {
    const db = createServerClient();

    // Verify the contract belongs to this tenant BEFORE writing anything.
    // Service-role bypasses RLS, so scope explicitly on tenant_id + id.
    const { data: contract, error: cErr } = await db
      .from('contracts')
      .select('id, project_id')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single();
    if (cErr || !contract) {
      return NextResponse.json({ error: 'Contract not found.' }, { status: 404 });
    }

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file was provided.' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'That file is too large. Try a file under 100MB.' }, { status: 413 });
    }

    const safeName = (file.name || `contract-${Date.now()}.pdf`).replace(/[^\w.\-() ]+/g, '_');
    const ts = Date.now();
    const path = `${user.tenantId}/projects/${contract.project_id}/contracts/${ts}-${safeName}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || 'application/octet-stream';

    const { error: upErr } = await db.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType, upsert: false });
    if (upErr) throw upErr;

    // Store the (private-bucket) public-URL form. It won't open directly, but
    // signStoredUrl/signUrl parse the path back out of it on every read.
    const publicUrl = db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

    // Persist the attachment onto the contract itself so it lists + shows "View
    // PDF" immediately. Tenant-scoped update (RLS bypass → explicit filters).
    const { error: updErr } = await db
      .from('contracts')
      .update({ pdf_url: publicUrl, updated_at: new Date().toISOString() } as never)
      .eq('id', id)
      .eq('tenant_id', user.tenantId);
    if (updErr) throw updErr;

    // Keep a document-history row (best-effort; the contract already has the url).
    await db.from('contract_documents').insert({
      tenant_id: user.tenantId,
      contract_id: id,
      title: file.name || safeName,
      file_url: publicUrl,
      doc_type: contentType,
      uploaded_by: user.id,
    } as never);

    const signed = await signStoredUrl(BUCKET, publicUrl, 3600);
    return NextResponse.json({ success: true, pdf_url: signed, file_url: signed, url: signed });
  } catch (err: unknown) {
    // A raw Error's text is the database's words, not ours — log it, show the line we wrote.
    console.error('[contracts/id/upload]', err);
    const msg = "server error";
    console.error('[contracts/upload] error:', msg);
    return NextResponse.json(
      { error: 'Failed to upload the signed contract. Please try again.' },
      { status: 500 },
    );
  }
}
