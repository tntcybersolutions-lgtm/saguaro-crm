import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category') || 'overall';
    const projectId = searchParams.get('project_id') || searchParams.get('projectId');
    const period = searchParams.get('period') || searchParams.get('timeframe');
    const requestedUserId = searchParams.get('userId') || searchParams.get('user_id') || user.id;
    const limit = Math.min(parseInt(searchParams.get('limit') || '25', 10), 100);

    const db = createServerClient();
    // Real `leaderboards` schema: id, tenant_id, project_id, category,
    // entity_type, entity_id, entity_name, score, rank, period, metadata, updated_at.
    // (No user_id / points columns and no profiles FK.)
    let query = db
      .from('leaderboards')
      .select('id, project_id, category, entity_type, entity_id, entity_name, score, rank, period, metadata')
      .eq('tenant_id', user.tenantId)
      .eq('category', category)
      .order('score', { ascending: false })
      .limit(limit);

    if (projectId) query = query.eq('project_id', projectId);
    if (period) query = query.eq('period', period);

    const { data, error } = await query;

    if (error) {
      return apiError('gamification/leaderboard', error, 'Failed to fetch leaderboard');
    }

    // Map to the shape the page expects: { id, name, score, rank, trend, is_current_user }
    const entries = (data || []).map((entry: any, index: number) => {
      const meta = entry.metadata || {};
      return {
        id: entry.id,
        name: entry.entity_name || 'Unknown',
        score: entry.score ?? 0,
        rank: entry.rank ?? index + 1,
        trend: (meta.trend as 'up' | 'down' | 'same') || 'same',
        is_current_user: entry.entity_id === requestedUserId,
      };
    });

    return NextResponse.json({
      entries,
      leaderboard: entries,
      category,
      period: period || 'all_time',
    });
  } catch (err: any) {
    return apiError('gamification/leaderboard', err, 'Internal server error');
  }
}
