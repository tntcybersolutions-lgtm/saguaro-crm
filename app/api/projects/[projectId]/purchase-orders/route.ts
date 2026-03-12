import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data, error } = await supabase.from('purchase_orders').select('*').eq('project_id', params.projectId).order('created_at', { ascending: false });
    if (error || !data?.length) return NextResponse.json({ purchase_orders: [], demo: true });
    return NextResponse.json({ purchase_orders: data });
  } catch {
    return NextResponse.json({ purchase_orders: [], demo: true });
  }
}
