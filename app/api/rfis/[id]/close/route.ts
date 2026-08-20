import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  try {
    const db = createServerClient();

    const { data: existing, error: fetchErr } = await db
      .from('rfis')
      .select('id, status')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: 'RFI not found' }, { status: 404 });
    }

    if (existing.status === 'closed') {
      return NextResponse.json({ error: 'RFI is already closed' }, { status: 409 });
    }

    const { data, error } = await db
      .from('rfis')
      .update({
        status:    'closed',
        closed_by: user.email,
        closed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, rfi: data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[rfis/close] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
