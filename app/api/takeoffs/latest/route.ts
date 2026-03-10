import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../supabase/admin';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');

  if (!projectId) {
    return NextResponse.json({ error: 'projectId query param required' }, { status: 400 });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('takeoffs')
      .select('id, project_id, status, materials')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return NextResponse.json({ takeoff: null });
    }

    return NextResponse.json({
      takeoff: {
        id: data.id,
        projectId: data.project_id,
        status: data.status,
        materials: data.materials ?? [],
      },
    });
  } catch {
    // Table may not exist yet — return null gracefully
    return NextResponse.json({ takeoff: null });
  }
}
