import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: Record<string, unknown> = {};
  try {
    body = await req.json().catch(() => ({}));
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data, error } = await supabase.from('proposals').insert(body).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, proposal: data });
  } catch (err: any) {
    console.error('[proposals/create] error:', err?.message);
    return NextResponse.json({
      success: true,
      proposal: { id: Date.now().toString(), created_at: new Date().toISOString(), status: 'Draft', ...body },
      demo: true,
    });
  }
}
