import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (!body.projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  try {
    const db = createServerClient();
    const { data, error } = await db.from('contracts').insert({
      project_id: body.projectId,
      sub_name: body.sub_name || '',
      trade: body.trade || '',
      amount: body.amount || 0,
      scope: body.scope || '',
      start_date: body.start_date || null,
      end_date: body.end_date || null,
      retainage_pct: body.retainage_pct || 10,
      status: 'Draft',
      tenant_id: user.tenantId,
      created_by: user.id,
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, contract: data });
  } catch (err: any) {
    console.error('[contracts/create] error:', err?.message);
    return NextResponse.json({ error: err.message || 'Failed to create contract' }, { status: 500 });
  }
}
