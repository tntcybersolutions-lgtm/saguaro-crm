import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  try {
    const db = createServerClient();
    const { data: item } = await db
      .from('punch_list')
      .select('status')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single();

    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (item.status !== 'completed') {
      return NextResponse.json({ error: 'Item must be completed before verification' }, { status: 400 });
    }

    const { error } = await db
      .from('punch_list')
      .update({
        status: 'verified',
        verified_at: new Date().toISOString(),
        verified_by: user.email,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('tenant_id', user.tenantId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
