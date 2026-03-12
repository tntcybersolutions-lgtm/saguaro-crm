import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

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
      .order('sheet', { ascending: true });
    if (error) throw error;
    return NextResponse.json({ drawings: data ?? [] });
  } catch {
    return NextResponse.json({ drawings: [] });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const db = createServerClient();

  const row = {
    project_id: projectId,
    tenant_id: user.tenantId,
    sheet: body.sheet || '',
    name: body.name || '',
    description: body.description || '',
    file_url: body.file_url || '',
    thumbnail_url: body.thumbnail_url || null,
  };

  const { data, error } = await db.from('drawings').insert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ drawing: data });
}
