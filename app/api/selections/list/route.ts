import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ selections: [], source: 'unauth' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  try {
    const db = createServerClient();
    let query = db
      .from('selections')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('category', { ascending: true }).limit(1000);
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ selections: data || [], source: 'live' });
  } catch (e) {
    return apiError('selections/list GET', e, undefined, 500, { selections: [], source: 'error' });
  }
}
