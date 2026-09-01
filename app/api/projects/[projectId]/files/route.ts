import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { signFields } from '@/lib/storage-signing';

export const runtime = 'nodejs';

/**
 * List a project's files from the canonical `project_files` table.
 * Tenant-scoped (was anon + project-only — a cross-tenant read gap), hides
 * soft-deleted rows, and signs the private-bucket URLs so they actually open.
 */
export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const admin = createServerClient() as any;
    const url = new URL(req.url);
    const includeDeleted = url.searchParams.get('trash') === '1';
    /* Files can be tagged to a thing rather than a folder — a marked-up copy
       returned against one contract, a photo against one RFI. Uploading already
       recorded that; this is how a screen asks for only its own. */
    const entityType = url.searchParams.get('entityType');
    const entityId = url.searchParams.get('entityId');
    let q = admin
      .from('project_files')
      .select('*')
      .eq('project_id', params.projectId)
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false });
    q = includeDeleted ? q.not('deleted_at', 'is', null) : q.is('deleted_at', null);
    if (entityType) q = q.eq('entity_type', entityType);
    if (entityId) q = q.eq('entity_id', entityId);
    const { data, error } = await q;
    if (error) throw error;
    const files = await signFields((data as any[]) || [], ['file_url', 'poster_url'], 3600);
    return NextResponse.json({ files });
  } catch (err: unknown) {
    // A raw Error's text is the database's words, not ours — log it, show the line we wrote.
    console.error('[projects/projectId/files]', err);
    const msg = "Internal server error";
    console.error('[project/files] error:', msg);
    return NextResponse.json({ error: `Failed to fetch project files: ${msg}` }, { status: 500 });
  }
}
