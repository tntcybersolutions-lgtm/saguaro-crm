import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    if (!body.contract_id) {
      return NextResponse.json({ error: 'Missing required field: contract_id' }, { status: 400 });
    }

    const db = createServerClient();

    // Verify contract exists and belongs to tenant
    const { data: contract, error: fetchErr } = await db
      .from('contracts')
      .select('id, status')
      .eq('id', body.contract_id)
      .eq('tenant_id', user.tenantId)
      .single();

    if (fetchErr || !contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }

    const now = new Date().toISOString();
    const { data, error } = await db
      .from('contracts')
      .update({ status: 'sent', sent_at: now, updated_at: now })
      .eq('id', body.contract_id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ contract: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
