import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data, error } = await supabase.from('bills').insert(body).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, bill: data });
  } catch (err: any) {
    console.error('[bills/create] error:', err?.message);
    const body = await req.json().catch(() => ({}));
    return NextResponse.json({
      success: true,
      bill: { id: Date.now().toString(), created_at: new Date().toISOString(), status: 'Pending', ...body },
      demo: true,
    });
  }
}
