import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');

  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ payApps: [], source: 'unauth' }, { status: 401 });

    const db = createServerClient();
    // Respect an explicit user drag-reorder (sort_order) first; rows never
    // reordered (null sort_order) fall back to newest-app-first as before.
    let query = db
      .from('pay_applications')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('app_number', { ascending: false });
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ payApps: data || [], source: 'live' });
  } catch (e) {
    return apiError('pay-apps/list GET', e, undefined, 500, { payApps: [], source: 'error' });
  }
}
