import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data, error } = await supabase.from('specs').select('*').eq('project_id', params.projectId).order('section', { ascending: true });
    if (error || !data?.length) return NextResponse.json({ specs: [], demo: true });
    return NextResponse.json({ specs: data });
  } catch {
    return NextResponse.json({ specs: [], demo: true });
  }
}
