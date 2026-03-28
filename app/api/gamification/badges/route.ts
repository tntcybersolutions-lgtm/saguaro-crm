import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('user_id') || user.id;
    const projectId = searchParams.get('project_id');

    const db = createServerClient();
    let query = db
      .from('user_badges')
      .select('*, badge_definitions(name, description, icon, category, points)')
      .eq('tenant_id', user.tenantId)
      .eq('user_id', userId)
      .order('awarded_at', { ascending: false });

    if (projectId) query = query.eq('project_id', projectId);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: 'Failed to list badges', details: error.message }, { status: 500 });
    }

    return NextResponse.json({ badges: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { user_id, badge_id, project_id, reason } = body;

    if (!user_id || !badge_id) {
      return NextResponse.json({ error: 'user_id and badge_id are required' }, { status: 400 });
    }

    const db = createServerClient();

    // Verify badge definition exists
    const { data: badgeDef, error: defError } = await db
      .from('badge_definitions')
      .select('id, name, points')
      .eq('id', badge_id)
      .single();

    if (defError || !badgeDef) {
      return NextResponse.json({ error: 'Badge definition not found' }, { status: 404 });
    }

    // Check if user already has this badge for this project
    let existingQuery = db
      .from('user_badges')
      .select('id')
      .eq('tenant_id', user.tenantId)
      .eq('user_id', user_id)
      .eq('badge_id', badge_id);

    if (project_id) existingQuery = existingQuery.eq('project_id', project_id);

    const { data: existing } = await existingQuery;

    if (existing && existing.length > 0) {
      return NextResponse.json({ error: 'Badge already awarded', badge_id: existing[0].id }, { status: 409 });
    }

    const { data, error } = await db
      .from('user_badges')
      .insert({
        tenant_id: user.tenantId,
        user_id,
        badge_id,
        project_id: project_id || null,
        reason: reason || null,
        awarded_by: user.id,
        awarded_at: new Date().toISOString(),
      })
      .select('*, badge_definitions(name, description, icon, category, points)')
      .single();

    if (error) {
      return NextResponse.json({ error: 'Failed to award badge', details: error.message }, { status: 500 });
    }

    // Update user points in leaderboard
    if (badgeDef.points) {
      try {
        await db.rpc('increment_user_points', {
          p_tenant_id: user.tenantId,
          p_user_id: user_id,
          p_project_id: project_id || null,
          p_points: badgeDef.points,
        });
      } catch {
        // points update is best-effort
      }
    }

    return NextResponse.json({ badge: data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}
