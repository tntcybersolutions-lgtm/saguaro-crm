import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';

const VALID_EXTENSIONS = ['ifc', 'rvt', 'glb'];
const MAX_SIZE = 200 * 1024 * 1024; // 200 MB

function mimeFromExt(ext: string): string {
  switch (ext) {
    case 'ifc': return 'application/x-step';
    case 'rvt': return 'application/octet-stream';
    case 'glb': return 'model/gltf-binary';
    default:    return 'application/octet-stream';
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!VALID_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        { error: `Unsupported file type ".${ext}". Accepted: IFC, RVT, GLB.` },
        { status: 400 },
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 200 MB.` },
        { status: 400 },
      );
    }

    const projectId = formData.get('project_id') as string | null;
    if (!projectId) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 });
    }

    // Verify project belongs to tenant
    const { data: project, error: projErr } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('tenant_id', user.tenantId)
      .single();

    if (projErr || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const modelId = randomUUID();
    const storagePath = `${projectId}/bim/${modelId}/${file.name}`;

    // Upload to Supabase Storage
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadErr } = await supabase.storage
      .from('project-files')
      .upload(storagePath, buffer, {
        contentType: mimeFromExt(ext),
        upsert: false,
      });

    if (uploadErr) {
      console.error('[bim/upload] storage error:', uploadErr.message);
      return NextResponse.json({ error: 'File upload failed' }, { status: 500 });
    }

    // Create bim_models record
    const { data, error: insertErr } = await supabase
      .from('project_documents')
      .insert({
        id: modelId,
        project_id: projectId,
        tenant_id: user.tenantId,
        file_name: file.name,
        file_type: ext,
        file_size: file.size,
        storage_path: storagePath,
        status: 'pending',
        uploaded_by: user.id,
      })
      .select()
      .single();

    if (insertErr) {
      console.error('[bim/upload] insert error:', insertErr.message);
      return NextResponse.json({ error: 'Failed to create model record' }, { status: 500 });
    }

    return NextResponse.json({ success: true, model: data });
  } catch (err: unknown) {
    console.error('[bim/upload]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed' },
      { status: 500 },
    );
  }
}
