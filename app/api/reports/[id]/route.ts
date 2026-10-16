import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { requestDay } from '@/lib/time-zone';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/**
 * report_templates columns: id, tenant_id, name, report_type, template_data (jsonb), is_default, created_at
 * The full ReportTemplate object from the builder is stored in template_data; scalar
 * columns (name, report_type, is_default) are mirrored for querying.
 */

function flatten(row: any) {
  if (!row) return null;
  const data = (row.template_data && typeof row.template_data === 'object') ? row.template_data : {};
  return {
    ...data,
    id: row.id,
    name: row.name ?? data.name,
    type: row.report_type ?? data.type,
    is_default: row.is_default ?? data.is_default ?? false,
    createdAt: data.createdAt ?? row.created_at,
  };
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('report_templates')
      .select('*')
      .eq('id', params.id)
      .eq('tenant_id', user.tenantId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ report: flatten(data) });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}

async function update(req: NextRequest, id: string, tenantId: string) {
  const supabase = createServerClient();
  const body = await req.json().catch(() => ({}));

  // Merge over existing template_data so PATCH semantics work for partial bodies.
  const { data: existing } = await supabase
    .from('report_templates')
    .select('template_data')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();
  const prev = (existing?.template_data && typeof existing.template_data === 'object') ? existing.template_data : {};
  const merged = { ...prev, ...body, updatedAt: (await requestDay(req.headers, supabase, tenantId, 'reports')).today };

  const update: Record<string, unknown> = { template_data: merged };
  if (body.name !== undefined) update.name = body.name;
  if (body.type !== undefined) update.report_type = body.type;
  if (body.report_type !== undefined) update.report_type = body.report_type;
  if (body.is_default !== undefined) update.is_default = body.is_default;

  const { data, error } = await supabase
    .from('report_templates')
    .update(update)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requirePermission(req, 'Reports', 'Edit');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const data = await update(req, params.id, user.tenantId);
    return NextResponse.json({ report: flatten(data) });
  } catch (e) {
    return apiError('reports/[id] PUT', e);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requirePermission(req, 'Reports', 'Edit');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const data = await update(req, params.id, user.tenantId);
    return NextResponse.json({ report: flatten(data) });
  } catch (e) {
    return apiError('reports/[id] PATCH', e);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requirePermission(req, 'Reports', 'Full');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const { error } = await supabase
      .from('report_templates')
      .delete()
      .eq('id', params.id)
      .eq('tenant_id', user.tenantId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError('reports/[id] DELETE', e);
  }
}
