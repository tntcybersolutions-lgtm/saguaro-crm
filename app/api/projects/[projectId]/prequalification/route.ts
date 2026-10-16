import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const { data: forms } = await supabase.from('prequalification_forms').select('*').eq('tenant_id', user.tenantId).order('created_at', { ascending: false });
    const { data: submissions } = await supabase.from('prequalification_submissions').select('*').eq('tenant_id', user.tenantId).order('created_at', { ascending: false });
    return NextResponse.json({ forms: forms ?? [], submissions: submissions ?? [] });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error('[projects/[projectId]/prequalification] read failed:', detail);
    // A failed read must not render as an empty result — return a real
    // status so the UI can show an error state with a retry.
    return apiError('projects/projectId/prequalification', e, 'Failed to load forms');
  }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const g = await requirePermission(req, 'Safety', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const supabase = createServerClient();
    const body = await req.json();
    if (body._type === 'submission') {
      // prequalification_submissions has no project/vendor/max_score columns; the
      // form reference lives in template_id and the subcontractor in sub_id. Vendor
      // identity, project context and max_score are folded into the answers jsonb.
      const { data, error } = await supabase.from('prequalification_submissions').insert({
        tenant_id: user.tenantId, template_id: body.form_id || null,
        sub_id: body.subcontractor_id || null,
        answers: {
          ...(body.answers || {}),
          project_id: params.projectId || null,
          vendor_name: body.vendor_name ?? null,
          vendor_email: body.vendor_email ?? null,
          max_score: body.max_score ?? 100,
        },
        documents: body.documents || [], score: body.score || 0,
        status: body.status || 'pending',
      }).select().single();
      if (error) throw error;
      return NextResponse.json({ submission: data }, { status: 201 });
    }
    // prequalification_forms keeps free-form template config in the form_data jsonb;
    // there are no top-level name/questions/scoring columns and no created_by column.
    const { data, error } = await supabase.from('prequalification_forms').insert({
      tenant_id: user.tenantId, project_id: params.projectId || null,
      form_data: {
        name: body.name ?? null,
        description: body.description ?? null,
        questions: body.questions || [],
        scoring_criteria: body.scoring_criteria || [],
        required_documents: body.required_documents || [],
        auto_qualify_threshold: body.auto_qualify_threshold ?? 70,
        created_by: user.id,
      },
      status: body.status || 'active',
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ form: data }, { status: 201 });
  } catch (e: unknown) {
    return apiError('projects/[projectId]/prequalification POST', e);
  }
}
