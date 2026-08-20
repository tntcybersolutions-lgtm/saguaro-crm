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
    const category = searchParams.get('category');
    const includeGlobal = searchParams.get('include_global') !== 'false';

    const db = createServerClient();
    let query = db
      .from('form_templates')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('name', { ascending: true });

    if (projectId && includeGlobal) {
      query = query.or(`project_id.eq.${projectId},is_global.eq.true`);
    } else if (projectId) {
      query = query.eq('project_id', projectId);
    }

    if (category) query = query.eq('category', category);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: 'Failed to list templates', details: error.message }, { status: 500 });
    }

    return NextResponse.json({ templates: data || [] });
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
    const { name, description, category, fields, project_id, is_global } = body;

    if (!name || !fields) {
      return NextResponse.json({ error: 'name and fields are required' }, { status: 400 });
    }

    const db = createServerClient();
    const { data, error } = await db
      .from('form_templates')
      .insert({
        tenant_id: user.tenantId,
        name,
        description: description || null,
        category: category || null,
        fields,
        project_id: project_id || null,
        is_global: is_global || false,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: 'Failed to create template', details: error.message }, { status: 500 });
    }

    return NextResponse.json({ template: data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}
