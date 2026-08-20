import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServerClient();

    const { data: existing, error: fetchErr } = await db
      .from('daily_logs')
      .select('id, status')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single();
    if (fetchErr || !existing) {
      return NextResponse.json({ error: 'Daily log not found' }, { status: 404 });
    }
    if (existing.status !== 'submitted') {
      return NextResponse.json({ error: 'Only submitted logs can be approved' }, { status: 400 });
    }

    const { data, error } = await db
      .from('daily_logs')
      .update({
        status: 'approved',
        approved_by: user.email,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, log: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
