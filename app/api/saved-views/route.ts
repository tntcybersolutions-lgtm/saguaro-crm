import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const module = searchParams.get('module');
    const projectId = searchParams.get('project_id');

    const db = createServerClient();
    let query = db
      .from('saved_views')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .order('name', { ascending: true });

    if (module) query = query.eq('module', module);
    if (projectId) query = query.eq('project_id', projectId);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: 'Failed to list saved views', details: error.message }, { status: 500 });
    }

    return NextResponse.json({ views: data || [] });
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
    const { name, module, filters, columns, sort_by, sort_direction, project_id, is_default } = body;

    if (!name || !module) {
      return NextResponse.json({ error: 'name and module are required' }, { status: 400 });
    }

    const db = createServerClient();

    // If setting as default, unset any existing defaults for this module
    if (is_default) {
      let unsetQuery = db
        .from('saved_views')
        .update({ is_default: false })
        .eq('tenant_id', user.tenantId)
        .eq('user_id', user.id)
        .eq('module', module)
        .eq('is_default', true);

      if (project_id) unsetQuery = unsetQuery.eq('project_id', project_id);

      await unsetQuery;
    }

    const { data, error } = await db
      .from('saved_views')
      .insert({
        tenant_id: user.tenantId,
        user_id: user.id,
        name,
        module,
        filters: filters || {},
        columns: columns || null,
        sort_by: sort_by || null,
        sort_direction: sort_direction || 'asc',
        project_id: project_id || null,
        is_default: is_default || false,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: 'Failed to create saved view', details: error.message }, { status: 500 });
    }

    return NextResponse.json({ view: data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}
