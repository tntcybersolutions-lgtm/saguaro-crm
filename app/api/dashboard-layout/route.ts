import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase.from('dashboard_layouts').select('*').eq('user_id', user.id).single();
    if (error && error.code !== 'PGRST116') throw error;
    return NextResponse.json({ layout: data ?? { widgets: [] } });
  } catch { return NextResponse.json({ layout: { widgets: [] } }); }
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const body = await req.json();
    const { data, error } = await supabase.from('dashboard_layouts').upsert({
      tenant_id: user.tenantId, user_id: user.id,
      layout_name: body.layout_name || 'default', widgets: body.widgets || [],
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' }).select().single();
    if (error) throw error;
    return NextResponse.json({ layout: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
