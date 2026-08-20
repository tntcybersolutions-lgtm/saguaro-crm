import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ purchaseOrders: [], source: 'unauth' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('project_id');

  try {
    const db = createServerClient();
    let query = db
      .from('purchase_orders')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false });

    if (projectId) query = query.eq('project_id', projectId);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ purchaseOrders: data || [], source: 'live' });
  } catch {
    return NextResponse.json({ purchaseOrders: [], source: 'error' }, { status: 500 });
  }
}
