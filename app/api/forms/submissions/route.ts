import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('project_id');
    const templateId = searchParams.get('template_id');
    const status = searchParams.get('status');

    const db = createServerClient();
    let query = db
      .from('form_submissions')
      .select('*, form_templates(name, category)')
      .eq('tenant_id', user.tenantId)
      .order('submitted_at', { ascending: false });

    if (projectId) query = query.eq('project_id', projectId);
    if (templateId) query = query.eq('template_id', templateId);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: 'Failed to list submissions', details: error.message }, { status: 500 });
    }

    return NextResponse.json({ submissions: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { project_id, template_id, form_data, notes } = body;

    if (!project_id || !template_id || !form_data) {
      return NextResponse.json({ error: 'project_id, template_id, and form_data are required' }, { status: 400 });
    }

    const db = createServerClient();

    // Verify the template exists for this tenant
    const { data: template, error: templateError } = await db
      .from('form_templates')
      .select('id, name')
      .eq('id', template_id)
      .eq('tenant_id', user.tenantId)
      .single();

    if (templateError || !template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const { data, error } = await db
      .from('form_submissions')
      .insert({
        tenant_id: user.tenantId,
        project_id,
        template_id,
        form_data,
        notes: notes || null,
        submitted_by: user.id,
        submitted_at: new Date().toISOString(),
        status: 'submitted',
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: 'Failed to submit form', details: error.message }, { status: 500 });
    }

    return NextResponse.json({ submission: data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}
