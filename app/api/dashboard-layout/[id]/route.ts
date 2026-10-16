import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/**
 * dashboard_layouts columns: id, tenant_id, user_id, layout_data (jsonb), created_at, updated_at
 * The full DashboardLayout object is stored in layout_data.
 *
 * GET returns the full DashboardLayout the page consumes:
 *   { id, name, columns, widgets, preset?, createdAt?, updatedAt? }
 */

function flatten(row: any) {
  if (!row) return null;
  const ld = (row.layout_data && typeof row.layout_data === 'object') ? row.layout_data : {};
  return {
    ...ld,
    id: row.id,
    createdAt: ld.createdAt ?? row.created_at,
    updatedAt: ld.updatedAt ?? row.updated_at,
  };
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('dashboard_layouts')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(flatten(data));
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const body = await req.json().catch(() => ({}));

    const { data: existing } = await supabase
      .from('dashboard_layouts')
      .select('layout_data')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single();
    const prev = (existing?.layout_data && typeof existing.layout_data === 'object') ? existing.layout_data : {};
    const merged = { ...prev, ...body, updatedAt: new Date().toISOString() };

    const { data, error } = await supabase
      .from('dashboard_layouts')
      .update({ layout_data: merged, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .eq('user_id', user.id)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json(flatten(data));
  } catch (e) {
    return apiError('dashboard-layout/[id] PATCH', e);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const { error } = await supabase
      .from('dashboard_layouts')
      .delete()
      .eq('id', params.id)
      .eq('user_id', user.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError('dashboard-layout/[id] DELETE', e);
  }
}
