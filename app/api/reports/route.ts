import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

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
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const body = await req.json();
    const { data, error } = await supabase.from('report_templates').insert({
      tenant_id: user.tenantId, name: body.name, description: body.description || null,
      report_type: body.report_type, modules: body.modules || [], filters: body.filters || {},
      columns: body.columns || [], chart_config: body.chart_config || {},
      schedule_frequency: body.schedule_frequency || null,
      schedule_recipients: body.schedule_recipients || [],
      is_default: body.is_default || false, created_by: user.id,
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ report: data }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
