import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';

/** Flatten a report_templates row into the ReportTemplate shape the builder consumes. */
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

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase.from('report_templates').select('*').eq('tenant_id', user.tenantId).order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ reports: data ?? [] });
  } catch { return NextResponse.json({ reports: [] }); }
}

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Reports', 'Edit');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const body = await req.json();

    // report_type is NOT NULL. The builder's draft field is `type`, not
    // `report_type` — the old code only read body.report_type, so every create
    // violated the NOT NULL constraint, the insert threw, and the page's
    // fire-and-forget POST swallowed it and showed a phantom "created". Accept
    // either key and fall back to 'table' so a create can never silently fail.
    const reportType = body.report_type ?? body.type ?? 'table';
    if (!body.name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    // Store the FULL builder object in template_data so every field round-trips
    // (chartKind, schedule, columns, filters, modules, preset, description).
    // GET /api/reports flattens template_data and overrides id/name/type from
    // the mirrored scalar columns, so keeping id/createdAt here is harmless.
    const { data, error } = await supabase.from('report_templates').insert({
      tenant_id: user.tenantId,
      name: body.name,
      report_type: reportType,
      is_default: body.is_default || false,
      template_data: { ...body, created_by: user.id },
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ report: flatten(data) }, { status: 201 });
  } catch (e: unknown) {
    // A raw Error's text is the database's words, not ours — log it, show the line we wrote.
    console.error('[reports]', e);
    const msg = "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
