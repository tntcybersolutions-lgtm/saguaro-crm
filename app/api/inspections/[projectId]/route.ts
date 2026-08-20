import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServerClient();

    const [{ data: inspections, error: iErr }, { data: templates, error: tErr }] = await Promise.all([
      db.from('inspections')
        .select('*')
        .eq('project_id', projectId)
        .eq('tenant_id', user.tenantId)
        .order('created_at', { ascending: false }),
      db.from('inspection_templates')
        .select('*')
        .eq('tenant_id', user.tenantId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
    ]);

    if (iErr) throw iErr;
    if (tErr) throw tErr;

    return NextResponse.json({
      inspections: inspections || [],
      templates: templates || [],
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const inspectionType = body.inspection_type as string;
  if (!inspectionType) return NextResponse.json({ error: 'Missing required field: inspection_type' }, { status: 400 });

  try {
    const db = createServerClient();

    // If template_id provided, load template fields
    let checklist: unknown[] = [];
    if (body.template_id) {
      const { data: tpl } = await db
        .from('inspection_templates')
        .select('fields')
        .eq('id', body.template_id)
        .eq('tenant_id', user.tenantId)
        .single();
      if (tpl) checklist = (tpl as Record<string, unknown>).fields as unknown[] || [];
    }

    const row = {
      project_id: projectId,
      tenant_id: user.tenantId,
      inspection_type: inspectionType,
      inspector: body.inspector_name || '',
      agency: body.agency || '',
      notes: body.notes || '',
      scheduled_date: body.inspection_date || new Date().toISOString().split('T')[0],
      checklist: body.checklist || checklist,
      checklist_total: Array.isArray(body.checklist) ? (body.checklist as unknown[]).length : checklist.length,
      checklist_passed: 0,
      deficiency_count: 0,
      result: 'pending',
      status: 'Scheduled',
      created_by: user.id,
    };

    const { data, error } = await db
      .from('inspections')
      .insert(row)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ inspection: data }, { status: 201 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
