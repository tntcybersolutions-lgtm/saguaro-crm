import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { onPayAppSubmitted } from '@/lib/triggers';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  try {
    const db = createServerClient();
    const { error } = await db
      .from('pay_applications')
      .update({ status: 'submitted', submitted_date: new Date().toISOString().split('T')[0] })
      .eq('id', id);
    if (error) throw error;
    onPayAppSubmitted(id).catch(console.error);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
