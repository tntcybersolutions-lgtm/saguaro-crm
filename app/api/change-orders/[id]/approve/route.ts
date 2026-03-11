import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { onChangeOrderApproved } from '@/lib/triggers';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const user = await getUser(req);
    const db = createServerClient();
    const { error } = await db.from('change_orders').update({
      status: 'approved',
      approved_by: user?.id,
      approved_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) throw error;
    onChangeOrderApproved(id).catch(console.error);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
