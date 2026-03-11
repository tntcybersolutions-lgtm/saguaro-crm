import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json();
    const db = createServerClient();
    const { error } = await db.from('lien_waivers').update({
      status: 'signed',
      signed_date: new Date().toISOString().split('T')[0],
      signed_by: body.signedBy,
    }).eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
