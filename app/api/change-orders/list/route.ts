import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

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
  } catch (e) {
    // A failed read must NOT render as an empty list. The screen would say
    // "no change orders" with total confidence when the truth is that the query
    // failed — and the old body carried source:'error', which no screen has
    // ever read. Real status, real server-side log, correlation id.
    return apiError('change-orders/list', e, 'Could not load change orders');
  }
}
