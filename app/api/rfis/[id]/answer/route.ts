import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { onRFIAnswered } from '@/lib/triggers';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json();
    const db = createServerClient();
    const { error } = await db.from('rfis').update({
      answer: body.answer,
      status: 'answered',
      answered_date: new Date().toISOString().split('T')[0],
    }).eq('id', id);
    if (error) throw error;
    onRFIAnswered(id).catch(console.error);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
