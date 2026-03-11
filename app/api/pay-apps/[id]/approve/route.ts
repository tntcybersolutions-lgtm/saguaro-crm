import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { onPayAppApproved } from '@/lib/triggers';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const db = createServerClient();
    const { error } = await db
      .from('pay_applications')
      .update({ status: 'approved', approved_date: new Date().toISOString().split('T')[0] })
      .eq('id', id);
    if (error) throw error;
    onPayAppApproved(id).catch(console.error);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
