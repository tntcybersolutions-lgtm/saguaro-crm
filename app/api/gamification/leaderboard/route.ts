import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category') || 'overall';
    const projectId = searchParams.get('project_id');
    const timeframe = searchParams.get('timeframe') || 'all_time';
    const limit = Math.min(parseInt(searchParams.get('limit') || '25', 10), 100);

    const db = createServerClient();
    let query = db
      .from('leaderboards')
      .select('*, profiles(full_name, email, avatar_url)')
      .eq('tenant_id', user.tenantId)
      .eq('category', category)
      .order('points', { ascending: false })
      .limit(limit);

    if (projectId) query = query.eq('project_id', projectId);
    if (timeframe !== 'all_time') query = query.eq('timeframe', timeframe);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch leaderboard', details: error.message }, { status: 500 });
    }

    // Add rank to each entry
    const leaderboard = (data || []).map((entry: any, index: number) => ({
      ...entry,
      rank: index + 1,
      is_current_user: entry.user_id === user.id,
    }));

    // Find current user's rank if not in the top results
    let currentUserRank = null;
    const userEntry = leaderboard.find((e: any) => e.is_current_user);
    if (!userEntry) {
      let userQuery = db
        .from('leaderboards')
        .select('points')
        .eq('tenant_id', user.tenantId)
        .eq('category', category)
        .eq('user_id', user.id);

      if (projectId) userQuery = userQuery.eq('project_id', projectId);

      const { data: userData } = await userQuery.single();
      if (userData) {
        let rankQuery = db
          .from('leaderboards')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', user.tenantId)
          .eq('category', category)
          .gt('points', userData.points);

        if (projectId) rankQuery = rankQuery.eq('project_id', projectId);

        const { count } = await rankQuery;
        currentUserRank = {
          rank: (count || 0) + 1,
          points: userData.points,
        };
      }
    }

    return NextResponse.json({
      leaderboard,
      category,
      timeframe,
      current_user_rank: userEntry ? { rank: userEntry.rank, points: userEntry.points } : currentUserRank,
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}
