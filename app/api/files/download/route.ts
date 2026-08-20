import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

/**
 * File Download — generates a signed URL for private files or returns public URL.
 * GET /api/files/download?bucket={bucket}&path={storagePath}
 */
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const url = new URL(req.url);
    const bucket = url.searchParams.get('bucket') || 'project-files';
    const path = url.searchParams.get('path') || '';

    if (!path) {
      return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 });
    }

    const supabase = createServerClient();

    // Verify tenant owns this project (path format: projects/{projectId}/...)
    const pathParts = path.split('/');
    const projectIdx = pathParts.indexOf('projects');
    if (projectIdx >= 0 && pathParts[projectIdx + 1]) {
      const projectId = pathParts[projectIdx + 1];
      const { data: project } = await supabase.from('projects').select('id').eq('id', projectId).eq('tenant_id', user.tenantId).single();
      if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // For private buckets, generate a signed URL (1 hour expiry)
    if (bucket === 'blueprints' || bucket === 'private-files') {
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, 3600);

      if (error) throw error;

      return NextResponse.json({
        url: data.signedUrl,
        filename: path.split('/').pop() || 'download',
        signed: true,
        expiresIn: 3600,
      });
    }

    // For public buckets, return the public URL
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);

    return NextResponse.json({
      url: data.publicUrl,
      filename: path.split('/').pop() || 'download',
      signed: false,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[files/download] error:', msg);
    return NextResponse.json({ error: `Download failed: ${msg}` }, { status: 500 });
  }
}
