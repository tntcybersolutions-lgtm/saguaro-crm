import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    if (!body.code) {
      return NextResponse.json({ error: 'code is required' }, { status: 400 });
    }
    if (!body.name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    const db = createServerClient();
    const { data, error } = await db.from('cost_codes').insert({
      tenant_id: user.tenantId,
      code: body.code,
      name: body.name,
      project_id: body.project_id || body.projectId || null,
      division: body.division || null,
      category: body.category || null,
      budget_amount: body.budget_amount || body.budgetAmount || null,
      unit: body.unit || null,
      unit_cost: body.unit_cost || body.unitCost || null,
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, costCode: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
