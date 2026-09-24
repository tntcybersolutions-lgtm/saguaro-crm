import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

// GET /api/change-orders — tenant (+ optional project) scoped list.
// Mirrors app/api/change-orders/list/route.ts.
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

// POST /api/change-orders — create a change order (tenant scoped).
// Mirrors app/api/change-orders/create/route.ts.
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    if (!body.projectId || !body.title) {
      return NextResponse.json({ error: 'projectId and title are required' }, { status: 400 });
    }

    const db = createServerClient();
    const { data: last } = await db.from('change_orders').select('co_number')
      .eq('tenant_id', user.tenantId).eq('project_id', body.projectId).order('co_number', { ascending: false }).limit(1).maybeSingle();
    const coNumber = ((last as any)?.co_number || 0) + 1;

    const { data: co, error } = await db.from('change_orders').insert({
      tenant_id: user.tenantId,
      project_id: body.projectId,
      co_number: coNumber,
      title: body.title,
      description: body.description,
      reason: body.reason,
      status: 'pending',
      amount: body.costImpact || body.amount || 0,
      schedule_impact: body.scheduleImpact || 0,
      submitted_by: user.id,
    }).select().single();

    if (error) throw error;
    // Wrapper mirrors create route; top-level `id` matches what the calling
    // page reads (app/field/change-orders/page.tsx → const data = ...; data.id).
    return NextResponse.json({ id: (co as any)?.id, changeOrder: co, success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
