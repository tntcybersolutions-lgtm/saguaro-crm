import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('form_submissions')
      .select('*')
      .eq('project_id', params.projectId)
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[projects/[projectId]/forms/submissions] read failed:', error.message);
      return NextResponse.json({ error: 'Failed to load submissions', detail: error.message }, { status: 500 });
    }
    return NextResponse.json({ submissions: data || [] });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error('[projects/[projectId]/forms/submissions] read failed:', detail);
    // A failed read must not render as an empty result — return a real
    // status so the UI can show an error state with a retry.
    return NextResponse.json({ error: 'Failed to load submissions', detail }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = await req.json();
    const supabase = createServerClient();

    // projectId comes from the URL and this client is the service role key, so
    // it has to be proved to belong to the caller before anything is written
    // against it. Without this any signed-in user could post a submission into
    // another tenant's job by editing the URL.
    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .eq('id', params.projectId)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    // Named columns only. This used to spread ...body into the row, which let a
    // caller set tenant_id, id or reviewed_by directly — the request deciding
    // which tenant owns the record it creates.
    const record = {
      tenant_id: user.tenantId,
      project_id: params.projectId,
      template_id: body.template_id ?? null,
      data: body.data ?? null,
      responses: body.responses ?? null,
      location: body.location ?? null,
      notes: body.notes ?? null,
      submitted_by: user.email,
      status: body.status || 'submitted',
      submitted_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from('form_submissions').insert(record as never).select().single();
    if (error) {
      // This previously answered 200 with a made-up `fs-<timestamp>` id when the
      // insert failed. Since form_submissions.tenant_id is NOT NULL and the row
      // above never set it, EVERY submission failed and every one of them was
      // reported to the user as saved. Report the failure.
      console.error('[projects/[projectId]/forms/submissions] write failed:', error.message);
      return NextResponse.json({ error: 'Failed to submit form', detail: error.message }, { status: 500 });
    }
    return NextResponse.json({ submission: data });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error('[projects/[projectId]/forms/submissions] write failed:', detail);
    return NextResponse.json({ error: 'Failed to submit form', detail }, { status: 500 });
  }
}
