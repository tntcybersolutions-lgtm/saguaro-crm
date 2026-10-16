import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ items: [], source: 'unauth' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  try {
    const db = createServerClient();
    let query = db
      .from('punch_list')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false }).limit(1000);
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ items: data || [], source: 'live' });
  } catch (e) {
    return apiError('punch-list/list GET', e, undefined, 500, { items: [], source: 'error' });
  }
}
