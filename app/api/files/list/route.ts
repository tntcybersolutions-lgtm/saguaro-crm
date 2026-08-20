import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

/**
 * File List — lists files in Supabase Storage for a project.
 * GET /api/files/list?projectId={id}&folder={optional}
 */
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get('projectId') || '';
    const folder = url.searchParams.get('folder') || '';
    const bucket = url.searchParams.get('bucket') || 'project-files';

    if (!projectId) {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
    }

    const supabase = createServerClient();

    // Verify tenant owns this project
    const { data: project } = await supabase.from('projects').select('id').eq('id', projectId).eq('tenant_id', user.tenantId).single();
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const basePath = `projects/${projectId}/files${folder ? `/${folder}` : ''}`;

    const { data, error } = await supabase.storage
      .from(bucket)
      .list(basePath, {
        limit: 100,
        sortBy: { column: 'created_at', order: 'desc' },
      });

    if (error) throw error;

    const files = (data || [])
      .filter(f => f.name !== '.emptyFolderPlaceholder')
      .map(f => ({
        name: f.name,
        path: `${basePath}/${f.name}`,
        size: f.metadata?.size || 0,
        contentType: f.metadata?.mimetype || 'application/octet-stream',
        created_at: f.created_at,
        updated_at: f.updated_at,
      }));

    return NextResponse.json({ files, folder: basePath });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[files/list] error:', msg);
    return NextResponse.json({ error: `Failed to list files: ${msg}` }, { status: 500 });
  }
}
