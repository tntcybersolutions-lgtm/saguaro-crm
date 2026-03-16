import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ logs: [], source: 'unauth' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  try {
    const db = createServerClient();
    let query = db
      .from('daily_logs')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('log_date', { ascending: false }).limit(1000);
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ logs: data || [], source: 'live' });
  } catch {
    return NextResponse.json({ logs: [], source: 'error' }, { status: 500 });
  }
}
