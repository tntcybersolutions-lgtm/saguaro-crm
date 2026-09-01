import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

// Uploads a spec PDF to storage and persists the file metadata on the
// specification row. The web specs page posts multipart/form-data with a `file`
// blob (NOT JSON), so this reads formData, pushes the bytes to the
// `project-files` bucket, and updates file_name/file_url/storage_path. The old
// implementation called req.json() and 500'd on every real upload.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 });

    const db = createServerClient();

    // Confirm the spec exists and belongs to the caller's tenant BEFORE writing,
    // so a wrong id / cross-tenant id fails loudly instead of updating 0 rows.
    const { data: spec } = await db
      .from('specifications')
      .select('id, project_id')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();
    if (!spec) return NextResponse.json({ error: 'Spec not found' }, { status: 404 });

    const filename = file.name || `spec-${Date.now()}.pdf`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const path = `projects/${(spec as { project_id: string }).project_id}/specs/${Date.now()}-${filename}`;
    const { error: uploadError } = await db.storage
      .from('project-files')
      .upload(path, buffer, { contentType: file.type || 'application/pdf' });
    if (uploadError) throw uploadError;

    const { data: urlData } = db.storage.from('project-files').getPublicUrl(path);
    const url = urlData?.publicUrl || '';

    const { data, error } = await db
      .from('specifications')
      .update({
        file_name: filename,
        file_url: url,
        pdf_url: url,
        file_type: file.type || 'application/pdf',
        file_size: String(file.size || buffer.length),
        storage_path: path,
      })
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ success: true, spec: data, url });
  } catch (err: unknown) {
    // A raw Error's text is the database's words, not ours — log it, show the line we wrote.
    console.error('[specs/id/upload]', err);
    const msg = "Internal server error";
    console.error('[specs/upload] error:', msg);
    return NextResponse.json({ error: `Failed to upload spec file: ${msg}` }, { status: 500 });
  }
}
