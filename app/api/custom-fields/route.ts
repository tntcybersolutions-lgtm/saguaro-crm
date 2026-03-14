import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const url = new URL(req.url);
    const module = url.searchParams.get('module');
    let q = supabase.from('custom_field_definitions').select('*').eq('tenant_id', user.tenantId);
    if (module) q = q.eq('module', module);
    const { data, error } = await q.order('sort_order');
    if (error) throw error;
    return NextResponse.json({ fields: data ?? [] });
  } catch { return NextResponse.json({ fields: [] }); }
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const body = await req.json();
    const { data, error } = await supabase.from('custom_field_definitions').insert({
      tenant_id: user.tenantId, module: body.module, field_name: body.field_name,
      field_label: body.field_label, field_type: body.field_type || 'text',
      options: body.options || [], required: body.required || false,
      default_value: body.default_value || null, sort_order: body.sort_order || 0,
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ field: data }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
