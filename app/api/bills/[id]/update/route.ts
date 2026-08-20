import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  try {
    const db = createServerClient();
    const { data, error } = await db.from('bills').update(body).eq('id', params.id).eq('tenant_id', user.tenantId).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, bill: data });
  } catch (err) {
    console.error('[bills/update]', err);
    return NextResponse.json({ error: 'Failed to update bill' }, { status: 500 });
  }
}
