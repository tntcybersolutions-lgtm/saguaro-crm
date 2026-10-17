import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

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
      console.error('[forms/templates] list failed', error);
      return NextResponse.json({ error: "Couldn't load form templates. Please try again." }, { status: 500 });
    }

    return NextResponse.json({ templates: data || [] });
  } catch (err: any) {
    return apiError('forms/templates GET', err, "Couldn't load form templates. Please try again.");
  }
}

export async function POST(req: NextRequest) {
  try {
    const gate = await requirePermission(req, 'Safety', 'Edit');
  if (!gate.ok) return gate.res;
  const user = gate.user;
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const name: string | null = (body.name ?? '').toString().trim() || null;
    const description: string | null = body.description ?? null;
    const category: string | null = body.category ?? null;
    const fields = body.fields ?? null;
    const projectId: string | null = body.project_id ?? body.projectId ?? null;
    const isGlobal: boolean = body.is_global ?? body.isGlobal ?? false;

    if (!name || !Array.isArray(fields) || fields.length === 0) {
      return NextResponse.json(
        { error: 'Give the template a name and add at least one field.' },
        { status: 400 },
      );
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
        project_id: projectId,
        is_global: isGlobal,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error('[forms/templates] insert failed', error);
      return NextResponse.json({ error: "Couldn't save the form template. Please try again." }, { status: 500 });
    }

    return NextResponse.json({ template: data }, { status: 201 });
  } catch (err: any) {
    return apiError('forms/templates POST', err, "Couldn't save the form template. Please try again.");
  }
}
