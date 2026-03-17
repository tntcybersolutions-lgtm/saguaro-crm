import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const body = await req.json().catch(() => ({}));
    const newStatus = body.status || 'complete';
    const updateData: Record<string, unknown> = { status: newStatus };
    if (newStatus === 'complete' || newStatus === 'Complete') {
      updateData.completed_at = new Date().toISOString();
    }
    const { error } = await supabase
      .from('punch_list_items')
      .update(updateData)
      .eq('id', id)
      .eq('tenant_id', user.tenantId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = 'Internal server error';
    console.error('[punch-list/complete] error:', msg);
    return NextResponse.json(
      { error: `[punch-list/complete] Database error: ${msg}` },
      { status: 500 }
    );
  }
}
