import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const { data: project } = await supabase.from('projects').select('id').eq('id', params.projectId).eq('tenant_id', user.tenantId).single();
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const { data, error } = await supabase.from('specifications').select('*').eq('project_id', params.projectId).order('section_number', { ascending: true });
    if (error) throw error;
    return NextResponse.json({ specs: data ?? [] });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error('[projects/[projectId]/specs] read failed:', detail);
    // A failed read must not render as an empty result — return a real
    // status so the UI can show an error state with a retry.
    return apiError('projects/projectId/specs', e, 'Failed to load specs');
  }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const supabase = createServerClient();
    const body = await req.json();
    const { data, error } = await supabase.from('specifications').insert({
      tenant_id: user.tenantId, project_id: params.projectId,
      section_number: body.section_number, title: body.title,
      content: body.content || null, file_url: body.file_url || null,
      version: body.version || '1.0',
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ spec: data }, { status: 201 });
  } catch (e: unknown) {
    // A raw Error's text is the database's words, not ours — log it, show the line we wrote.
    console.error('[projects/projectId/specs]', e);
    const msg = "Failed";
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
