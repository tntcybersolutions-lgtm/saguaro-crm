import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const week = new URL(req.url).searchParams.get('week');
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    let query = supabase.from('timesheets').select('*').eq('project_id', params.projectId);
    if (week) query = query.eq('week_start', week);
    const { data, error } = await query.order('employee', { ascending: true });
    if (error || !data?.length) return NextResponse.json({ entries: [], demo: true });
    return NextResponse.json({ entries: data });
  } catch {
    return NextResponse.json({ entries: [], demo: true });
  }
}
