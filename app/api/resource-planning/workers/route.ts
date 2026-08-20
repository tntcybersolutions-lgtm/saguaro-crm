import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const trade = searchParams.get('trade');

  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ workers: [], source: 'unauth' }, { status: 401 });

    const db = createServerClient();
    let query = db.from('workers').select('*').eq('tenant_id', user.tenantId).order('name', { ascending: true });
    if (projectId) query = query.eq('project_id', projectId);
    if (trade) query = query.eq('trade', trade);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ workers: data || [], source: 'live' });
  } catch (e: unknown) { return NextResponse.json({ workers: [], source: 'error' }); }
}
