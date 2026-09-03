import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { signStoredUrl } from '@/lib/storage-signing';
import { apiError } from '@/lib/api-error';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();
    const { id } = await params;

    // Fetch the BIM model with tenant check
    const { data: model, error: modelErr } = await supabase
      .from('bim_models')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single();

    if (modelErr || !model) {
      return NextResponse.json({ error: 'BIM model not found' }, { status: 404 });
    }

    // Count elements for this model
    const { count, error: countErr } = await supabase
      .from('bim_elements')
      .select('*', { count: 'exact', head: true })
      .eq('bim_model_id', id)
      .eq('tenant_id', user.tenantId);

    if (countErr) {
      console.warn('[bim/get] element count error:', countErr.message);
    }

    // Resolve a short-lived signed URL for the actual model file so the client
    // 3D viewer can fetch it from the private `project-files` bucket. Falls back
    // to any legacy glb/original URL columns.
    let fileUrl: string | null = null;
    if (model.storage_path) {
      fileUrl = await signStoredUrl('project-files', model.storage_path, 3600);
    } else if (model.glb_url || model.original_url) {
      fileUrl = model.glb_url || model.original_url;
    }

    return NextResponse.json({
      model: { ...model, file_url: fileUrl },
      elementCount: count ?? 0,
    });
  } catch (err: unknown) {
    console.error('[bim/get]', err);
    return apiError('bim/id', err, 'Failed to fetch model');
  }
}
