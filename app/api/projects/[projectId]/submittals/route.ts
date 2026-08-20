import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

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
      .from('submittals')
      .select('*')
      .eq('project_id', params.projectId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ submittals: data ?? [] });
  } catch {
    return NextResponse.json({ submittals: [] });
  }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const supabase = createServerClient();

    // Verify project belongs to this tenant.
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', params.projectId)
      .eq('tenant_id', user.tenantId)
      .single();
    if (projectError || !project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // The field page sends multipart/form-data (with optional attachment) when online
    // and JSON when queued offline — accept both.
    let fields: Record<string, string> = {};
    let fileName: string | null = null;
    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      for (const [k, v] of form.entries()) {
        if (typeof v === 'string') fields[k] = v;
        else if (v && typeof (v as File).name === 'string') fileName = (v as File).name;
      }
    } else {
      fields = (await req.json()) ?? {};
    }

    const title = (fields.title || '').trim();
    if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 });

    // Map only to real submittals columns (linked_spec/attachment are not columns).
    const record: Record<string, unknown> = {
      tenant_id: user.tenantId,
      project_id: params.projectId,
      title,
      description: fields.description || null,
      spec_section: fields.spec_section || null,
      submittal_type: fields.submittal_type || null,
      subcontractor: fields.subcontractor || null,
      priority: fields.priority || null,
      due_date: fields.due_date || null,
      status: fields.status || 'pending',
      submitted_by: fields.subcontractor || user.email || null,
      created_by: user.id,
      file_name: fileName,
    };

    const { data, error } = await supabase
      .from('submittals')
      .insert(record)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ submittal: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
