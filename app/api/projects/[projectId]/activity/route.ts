import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const module = url.searchParams.get('module') || '';
  const actionUser = url.searchParams.get('user') || '';
  const limit = 50;
  const offset = (page - 1) * limit;

  try {
    const supabase = createServerClient();
    let query = supabase
      .from('activity_log')
      .select('*')
      .eq('project_id', params.projectId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (module) query = query.eq('module', module);
    if (actionUser) query = query.eq('user_email', actionUser);

    const { data, error } = await query;
    if (error) return NextResponse.json({ activities: [], hasMore: false });
    return NextResponse.json({
      activities: data || [],
      hasMore: (data || []).length === limit,
      page,
    });
  } catch {
    return NextResponse.json({ activities: [], hasMore: false });
  }
}
