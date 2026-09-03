import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { signFields } from '@/lib/storage-signing';

import { apiError } from '@/lib/api-error';
export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const supabase = createServerClient();

    // Verify project belongs to this tenant
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('tenant_id', user.tenantId)
      .single();
    if (projectError || !project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data, error } = await supabase
      .from('drawings')
      .select('*')
      .eq('project_id', projectId)
      .order('sheet_number', { ascending: true });
    if (error) throw error;
    // drawings/project-files buckets are private — sign URLs on read.
    return NextResponse.json({ drawings: await signFields(data ?? [], ['url', 'file_url', 'thumbnail_url']) });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error('[projects/[projectId]/drawings] read failed:', detail);
    // A failed read must not render as an empty result — return a real
    // status so the UI can show an error state with a retry.
    return apiError('projects/projectId/drawings', e, 'Failed to load drawings');
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;

  const body = await req.json().catch(() => ({}));
  const db = createServerClient();

  const row = {
    project_id: projectId,
    tenant_id: user.tenantId,
    sheet_number: body.sheet || '',
    name: body.name || '',
    notes: body.description || '',
    url: body.file_url || '',
  };

  const { data, error } = await db.from('drawings').insert(row).select().single();
  if (error) return apiError('projects/projectId/drawings', error, undefined, 500);
  return NextResponse.json({ drawing: data });
}
