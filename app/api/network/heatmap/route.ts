import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  try {
    const db = createServerClient();
    let query = db.from('network_heatmap_surveys').select('*').eq('tenant_id', user.tenantId).order('created_at', { ascending: false });
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ surveys: data || [] });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, {status: 500});
  }
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    if (!body.project_id || !body.name) return NextResponse.json({ error: 'project_id and name required' }, { status: 400 });
    const db = createServerClient();
    const { data, error } = await db.from('network_heatmap_surveys').insert({
      tenant_id: user.tenantId,
      project_id: body.project_id,
      name: body.name,
      floor_plan_url: body.floor_plan_url || null,
      floor_plan_width: body.floor_plan_width || 800,
      floor_plan_height: body.floor_plan_height || 600,
      ap_placements: body.ap_placements || [],
      walls: body.walls || [],
      survey_points: body.survey_points || [],
      coverage_percent: body.coverage_percent || 0,
      dead_zones: body.dead_zones || 0,
      created_by: user.id,
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, survey: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
