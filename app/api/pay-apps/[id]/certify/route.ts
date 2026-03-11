import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { onPayAppCertified } from '@/lib/triggers';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const db = createServerClient();
    const { error } = await db
      .from('pay_applications')
      .update({ status: 'certified', certified_date: new Date().toISOString().split('T')[0] })
      .eq('id', id);
    if (error) throw error;
    onPayAppCertified(id).catch(console.error);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
