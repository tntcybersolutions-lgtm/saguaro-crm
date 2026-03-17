import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data, error } = await supabase.from('inspections').select('*').eq('project_id', params.projectId).order('date', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ inspections: data || [] });
  } catch (err: unknown) {
    const msg = 'Internal server error';
    console.error('[project/inspections] error:', msg);
    return NextResponse.json({ error: `Failed to fetch inspections: ${msg}` }, { status: 500 });
  }
}
