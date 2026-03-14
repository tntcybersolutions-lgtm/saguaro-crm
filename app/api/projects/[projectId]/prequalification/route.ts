import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const { data: forms } = await supabase.from('prequalification_forms').select('*').eq('tenant_id', user.tenantId).order('created_at', { ascending: false });
    const { data: submissions } = await supabase.from('prequalification_submissions').select('*').eq('tenant_id', user.tenantId).order('submitted_at', { ascending: false });
    return NextResponse.json({ forms: forms ?? [], submissions: submissions ?? [] });
  } catch { return NextResponse.json({ forms: [], submissions: [] }); }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const body = await req.json();
    if (body._type === 'submission') {
      const { data, error } = await supabase.from('prequalification_submissions').insert({
        tenant_id: user.tenantId, form_id: body.form_id, project_id: params.projectId || null,
        subcontractor_id: body.subcontractor_id || null, vendor_name: body.vendor_name,
        vendor_email: body.vendor_email || null, answers: body.answers || {},
        documents: body.documents || [], score: body.score || 0, max_score: body.max_score || 100,
        status: body.status || 'pending',
      }).select().single();
      if (error) throw error;
      return NextResponse.json({ submission: data }, { status: 201 });
    }
    const { data, error } = await supabase.from('prequalification_forms').insert({
      tenant_id: user.tenantId, project_id: params.projectId || null,
      name: body.name, description: body.description || null,
      questions: body.questions || [], scoring_criteria: body.scoring_criteria || [],
      required_documents: body.required_documents || [],
      auto_qualify_threshold: body.auto_qualify_threshold || 70,
      status: body.status || 'active', created_by: user.id,
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ form: data }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
