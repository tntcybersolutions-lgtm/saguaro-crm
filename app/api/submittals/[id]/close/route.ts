import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServerClient();

    const { data: existing, error: fetchErr } = await db
      .from('submittals')
      .select('id, status')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single();
    if (fetchErr || !existing) {
      return NextResponse.json({ error: 'Submittal not found' }, { status: 404 });
    }

    const { data, error } = await db
      .from('submittals')
      .update({
        status: 'closed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, submittal: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
