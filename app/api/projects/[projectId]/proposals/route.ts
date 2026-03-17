import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data, error } = await supabase.from('proposals').select('*').eq('project_id', params.projectId).order('created_date', { ascending: true });
    if (error) throw error;
    return NextResponse.json({ proposals: data || [] });
  } catch (err: unknown) {
    const msg = 'Internal server error';
    console.error('[projects/proposals] error:', msg);
    return NextResponse.json({ error: `Failed to fetch proposals: ${msg}` }, { status: 500 });
  }
}
