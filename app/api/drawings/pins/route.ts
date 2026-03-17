import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const drawingId = searchParams.get('drawingId') || searchParams.get('drawing_id');
  const projectId = searchParams.get('projectId') || searchParams.get('project_id');

  try {
    const db = createServerClient();
    let query = db
      .from('drawing_pins')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: true });

    if (drawingId) {
      query = query.eq('drawing_id', drawingId);
    }
    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ pins: data || [] });
  } catch (err: unknown) {
    const msg = 'Internal server error';
    console.error('[drawings/pins] error:', msg);
    return NextResponse.json(
      { error: `[drawings/pins] Database error: ${msg}` },
      { status: 500 }
    );
  }
}
