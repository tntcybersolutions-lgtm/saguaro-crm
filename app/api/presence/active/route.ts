import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ users: [] });

    const db = createServerClient();
    const params = req.nextUrl.searchParams;
    const page = params.get('page');
    const projectId = params.get('project_id');

    // Active = last_seen_at within the last 60 seconds
    const cutoff = new Date(Date.now() - 60_000).toISOString();

    let query = db
      .from('presence_sessions')
      .select('user_id, user_name, page_path, last_seen_at')
      .eq('tenant_id', user.tenantId)
      .gt('last_seen_at', cutoff)
      .neq('user_id', user.id);

    if (page) {
      query = query.eq('page_path', page);
    }

    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    const { data, error } = await query.order('last_seen_at', { ascending: false });

    if (error) {
      console.error('Presence active error:', error.message);
      return NextResponse.json({ users: [] });
    }

    return NextResponse.json({ users: data || [] });
  } catch (err: any) {
    console.error('Presence active error:', err);
    return NextResponse.json({ users: [] });
  }
}
