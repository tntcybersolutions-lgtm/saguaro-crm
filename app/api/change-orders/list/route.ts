import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');

  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ changeOrders: [], source: 'unauth' }, { status: 401 });

    const db = createServerClient();
    let query = db.from('change_orders').select('*').eq('tenant_id', user.tenantId).order('co_number', { ascending: false });
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ changeOrders: data || [], source: 'live' });
  } catch {
    return NextResponse.json({ changeOrders: [], source: 'error' });
  }
}
