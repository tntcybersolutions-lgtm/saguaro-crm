import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { DEMO_CHANGE_ORDERS, DEMO_PROJECT } from '../../../../demo-data';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  try {
    const db = createServerClient();
    let query = db.from('change_orders').select('*').order('co_number', { ascending: false });
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (error) throw error;
    if ((data || []).length === 0) {
      const demoCOs = DEMO_CHANGE_ORDERS.map(co => ({
        ...co,
        project_id: projectId || DEMO_PROJECT.id,
        title: co.title,
        cost_impact: co.cost_impact,
        schedule_impact: co.schedule_impact_days,
      }));
      return NextResponse.json({ changeOrders: demoCOs, source: 'demo' });
    }
    return NextResponse.json({ changeOrders: data || [] });
  } catch {
    const demoCOs = DEMO_CHANGE_ORDERS.map(co => ({
      ...co,
      project_id: projectId || DEMO_PROJECT.id,
    }));
    return NextResponse.json({ changeOrders: demoCOs, source: 'demo' });
  }
}
