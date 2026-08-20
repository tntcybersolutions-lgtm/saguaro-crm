import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  try {
    const db = createServerClient();

    const { data: co, error: fetchErr } = await db
      .from('change_orders')
      .select('id, status')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single();

    if (fetchErr || !co) return NextResponse.json({ error: 'Change order not found' }, { status: 404 });
    if (co.status !== 'draft') return NextResponse.json({ error: 'Only draft change orders can be submitted' }, { status: 400 });

    const { data, error } = await db
      .from('change_orders')
      .update({
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        submitted_by: user.id,
      })
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select('id, co_number, status')
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
