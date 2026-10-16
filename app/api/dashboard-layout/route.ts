import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/**
 * dashboard_layouts columns: id, tenant_id, user_id, layout_data (jsonb), created_at, updated_at
 * The full DashboardLayout object (name, columns, preset, widgets) lives in layout_data.
 *
 * There is NO unique constraint on user_id, so a user can own many NAMED layouts.
 * The home dashboard renders the most-recently-updated layout ("the active one").
 */

function flatten(row: any) {
  if (!row) return null;
  const ld = (row.layout_data && typeof row.layout_data === 'object') ? row.layout_data : {};
  return {
    name: ld.name ?? 'My Dashboard',
    columns: ld.columns ?? 3,
    preset: ld.preset,
    widgets: Array.isArray(ld.widgets) ? ld.widgets : [],
    id: row.id,
    createdAt: ld.createdAt ?? row.created_at,
    updatedAt: ld.updatedAt ?? row.updated_at,
  };
}

function toLayoutData(body: any) {
  return {
    name: (typeof body.name === 'string' && body.name.trim()) ? body.name.trim() : 'My Dashboard',
    columns: [2, 3, 4].includes(body.columns) ? body.columns : 3,
    preset: body.preset ?? null,
    widgets: Array.isArray(body.widgets) ? body.widgets : [],
  };
}

/** GET /api/dashboard-layout → { layout } : the user's active (most-recent) layout. */
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('dashboard_layouts')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    const row = (data ?? [])[0];
    return NextResponse.json({ layout: flatten(row) ?? { name: 'My Dashboard', columns: 3, widgets: [] } });
  } catch {
    return NextResponse.json({ layout: { name: 'My Dashboard', columns: 3, widgets: [] } });
  }
}

/**
 * POST /api/dashboard-layout → { layout }
 * Body: { id?, name, columns, preset?, widgets }
 * With an id it updates that layout in place; without one it inserts a NEW named
 * layout (so "Save As" produces coexisting layouts). No user_id upsert.
 */
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const body = await req.json().catch(() => ({}));
    const layout_data = toLayoutData(body);
    const now = new Date().toISOString();

    // Update in place when an owned id is supplied.
    if (body.id) {
      const { data, error } = await supabase
        .from('dashboard_layouts')
        .update({ layout_data, updated_at: now })
        .eq('id', body.id)
        .eq('user_id', user.id)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (data) return NextResponse.json({ layout: flatten(data) });
      // id not found / not owned → fall through to insert a fresh row.
    }

    const { data, error } = await supabase
      .from('dashboard_layouts')
      .insert({ tenant_id: user.tenantId, user_id: user.id, layout_data, updated_at: now })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ layout: flatten(data) });
  } catch (e) {
    return apiError('dashboard-layout POST', e);
  }
}
