import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('field_issues')
      .select('*')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ issues: data || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    if (!body.title) return NextResponse.json({ error: 'title is required' }, { status: 400 });

    const db = createServerClient();

    const { count } = await db
      .from('field_issues')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId);

    const issueNumber = `FI-${String((count || 0) + 1).padStart(3, '0')}`;

    const { data, error } = await db
      .from('field_issues')
      .insert({
        tenant_id: user.tenantId,
        project_id: projectId,
        issue_number: issueNumber,
        title: body.title,
        description: body.description || null,
        priority: body.priority || 'medium',
        status: body.status || 'open',
        location: body.location || null,
        assigned_to_name: body.assigned_to_name || null,
        due_date: body.due_date || null,
        cost_impact: body.cost_impact || null,
        schedule_impact_days: body.schedule_impact_days || 0,
        reported_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ issue: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}
