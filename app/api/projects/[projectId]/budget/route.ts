import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const supabase = createServerClient();

    // Verify project belongs to this tenant
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', params.projectId)
      .eq('tenant_id', user.tenantId)
      .single();
    if (projectError || !project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data, error } = await supabase
      .from('budget_lines')
      .select('*')
      .eq('project_id', params.projectId)
      .order('cost_code', { ascending: true });
    if (error) throw error;
    return NextResponse.json({ lines: data ?? [] });
  } catch {
    return NextResponse.json({ lines: [] });
  }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const supabase = createServerClient();

    // Verify project belongs to this tenant
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', params.projectId)
      .eq('tenant_id', user.tenantId)
      .single();
    if (projectError || !project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const record = { ...body, project_id: params.projectId };
    const { data, error } = await supabase.from('budget_lines').insert(record).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, line: data });
  } catch (err: any) {
    console.error('[budget/POST] error:', err?.message);
    return NextResponse.json({ error: err?.message || 'Insert failed' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const supabase = createServerClient();

    // Verify project belongs to this tenant
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', params.projectId)
      .eq('tenant_id', user.tenantId)
      .single();
    if (projectError || !project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const { id, ...updates } = body;
    const { error } = await supabase
      .from('budget_lines')
      .update(updates)
      .eq('id', id as string)
      .eq('project_id', params.projectId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[budget/PATCH] error:', err?.message);
    return NextResponse.json({ error: err?.message || 'Update failed' }, { status: 500 });
  }
}
