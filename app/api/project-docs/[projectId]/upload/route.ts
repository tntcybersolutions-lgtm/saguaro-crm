import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId } = await params;
  const db = createServerClient();

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const title = formData.get('title') as string || '';
    const docType = formData.get('document_type') as string || 'general';
    const autoExtract = formData.get('auto_extract') === 'true';

    if (!file) return NextResponse.json({ error: 'Missing required field: file' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = `${projectId}/${Date.now()}-${file.name}`;

    const { error: uploadError } = await db.storage
      .from('project-documents')
      .upload(fileName, buffer, { contentType: file.type });

    if (uploadError) throw uploadError;

    const { data: urlData } = db.storage
      .from('project-documents')
      .getPublicUrl(fileName);

    const { data: doc, error: insertError } = await db
      .from('project_documents')
      .insert({
        tenant_id: user.tenantId,
        project_id: projectId,
        title: title || file.name,
        document_type: docType,
        file_name: file.name,
        file_url: urlData.publicUrl,
        file_size: file.size,
        mime_type: file.type,
        storage_path: fileName,
        extraction_status: autoExtract ? 'pending' : 'none',
        created_by: user.id,
        uploaded_by: user.id,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return NextResponse.json({ data: doc }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}
