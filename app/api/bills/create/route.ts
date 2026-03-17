import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  try {
    const db = createServerClient();
    const { data, error } = await db.from('bills').insert({
      ...body,
      tenant_id: user.tenantId,
      created_by: user.id,
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, bill: data });
  } catch (err) {
    console.error('[bills/create]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
