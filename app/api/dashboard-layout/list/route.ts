import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/**
 * dashboard_layouts columns: id, tenant_id, user_id, layout_data (jsonb), created_at, updated_at
 * The full DashboardLayout object is stored in layout_data.
 *
 * The dashboard-config page consumes this as a bare JSON array of
 * SavedLayoutSummary: { id, name, preset?, widgetCount, updatedAt }.
 */

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('dashboard_layouts')
      .select('id, layout_data, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });
    if (error) throw error;

    const summaries = (data ?? []).map((row: any) => {
      const ld = (row.layout_data && typeof row.layout_data === 'object') ? row.layout_data : {};
      return {
        id: row.id,
        name: ld.name ?? 'Untitled Layout',
        preset: ld.preset,
        widgetCount: Array.isArray(ld.widgets) ? ld.widgets.length : 0,
        updatedAt: row.updated_at ?? ld.updatedAt ?? '',
      };
    });
    return NextResponse.json(summaries);
  } catch (e) {
    // A failed read must NOT render as an empty list. The screen would say
    // "no saved dashboards" with total confidence when the truth is that the query
    // failed — and the old body carried source:'error', which no screen has
    // ever read. Real status, real server-side log, correlation id.
    return apiError('dashboard-layout/list', e, 'Could not load your saved dashboards');
  }
}
