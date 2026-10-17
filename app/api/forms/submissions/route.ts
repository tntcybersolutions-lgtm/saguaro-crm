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
      console.error('[forms/submissions] list failed', error);
      return NextResponse.json({ error: "Couldn't load form submissions. Please try again." }, { status: 500 });
    }

    return NextResponse.json({ submissions: data || [] });
  } catch (err: any) {
    return apiError('forms/submissions GET', err, "Couldn't load form submissions. Please try again.");
  }
}

export async function POST(req: NextRequest) {
  try {
    const gate = await requirePermission(req, 'Safety', 'Edit');
  if (!gate.ok) return gate.res;
  const user = gate.user;
    if (!user) {
      return NextResponse.json({ error: 'Please sign in to submit this form.' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    // Accept both snake_case and the camelCase the field client sends. The answers
    // live in the `responses` jsonb column (the canonical column used by every reader);
    // `form_data` was a phantom column name and never existed.
    const templateId: string | null = body.template_id ?? body.templateId ?? null;
    const responses = body.responses ?? body.form_data ?? null;
    const projectId: string | null = body.project_id ?? body.projectId ?? null;
    const notes: string | null = body.notes ?? null;
    const location: string | null = body.location ?? null;

    if (!templateId || responses == null || typeof responses !== 'object' || Array.isArray(responses)) {
      return NextResponse.json(
        { error: 'Choose a form and fill in your answers before submitting.' },
        { status: 400 },
      );
    }

    const db = createServerClient();

    // Service role bypasses RLS, so scope the template lookup to THIS tenant — never
    // trust a template_id that belongs to another tenant.
    const { data: template, error: templateError } = await db
      .from('form_templates')
      .select('id')
      .eq('id', templateId)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();

    if (templateError || !template) {
      return NextResponse.json({ error: 'That form template could no longer be found.' }, { status: 404 });
    }

    const { data, error } = await db
      .from('form_submissions')
      .insert({
        tenant_id: user.tenantId,
        project_id: projectId,
        template_id: templateId,
        responses,
        notes,
        location,
        submitted_by: user.id,
        submitted_at: new Date().toISOString(),
        status: 'submitted',
      })
      .select()
      .single();

    if (error) {
      console.error('[forms/submissions] insert failed', error);
      return NextResponse.json({ error: "Couldn't save your form submission. Please try again." }, { status: 500 });
    }

    return NextResponse.json({ submission: data }, { status: 201 });
  } catch (err: any) {
    return apiError('forms/submissions POST', err, "Couldn't save your form submission. Please try again.");
  }
}
