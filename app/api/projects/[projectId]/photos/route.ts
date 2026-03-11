import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data, error } = await supabase.from('photos').select('*').eq('project_id', params.projectId).order('date', { ascending: false });
    if (error || !data?.length) return NextResponse.json({ photos: [], demo: true });
    return NextResponse.json({ photos: data });
  } catch {
    return NextResponse.json({ photos: [], demo: true });
  }
}
