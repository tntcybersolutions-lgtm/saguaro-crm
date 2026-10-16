import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

// Uploads a proposal PDF to storage and writes its public URL onto the
// proposal's `pdf_url` column (tenant-scoped). The calling page
// (app/projects/[projectId]/proposal/page.tsx -> handleUpload) POSTs a
// multipart body with field `file` and ignores the response body, optimistically
// showing "PDF uploaded.". We still return { success, url, proposal } so the
// contract is complete and the row can refresh on next fetch.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  const { id } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 });

    const db = createServerClient();

    // Mirror the drawings/upload pattern: same `project-files` bucket + getPublicUrl.
    const filename = file.name || `proposal-${Date.now()}.pdf`;
    const path = `proposals/${id}/${Date.now()}-${filename}`;
    let url = '';
    const buffer = Buffer.from(await file.arrayBuffer());
    const { data: uploadData, error: uploadError } = await db.storage
      .from('project-files')
      .upload(path, buffer, { contentType: file.type || 'application/pdf' });
    if (uploadError) throw uploadError;
    if (uploadData) {
      const { data: urlData } = db.storage.from('project-files').getPublicUrl(path);
      url = urlData?.publicUrl || '';
    }

    const { data, error } = await db
      .from('proposals')
      .update({ pdf_url: url })
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ success: true, url, proposal: data });
  } catch (err: unknown) {
    return apiError('proposals/[id]/upload POST', err);
  }
}
