import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data, error } = await supabase.from('todos').select('*').eq('project_id', params.projectId).order('created_at', { ascending: false });
    if (error || !data?.length) return NextResponse.json({ todos: [], demo: true });
    return NextResponse.json({ todos: data });
  } catch {
    return NextResponse.json({ todos: [], demo: true });
  }
}
