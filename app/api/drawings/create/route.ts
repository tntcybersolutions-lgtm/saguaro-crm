import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    if (!body.projectId || !body.drawing_number || !body.title) {
      return NextResponse.json({ error: 'projectId, drawing_number, and title are required' }, { status: 400 });
    }
    const db = createServerClient();
    const { data, error } = await db.from('project_drawings').insert({
      tenant_id: user.tenantId,
      project_id: body.projectId,
      drawing_number: body.drawing_number || body.drawingNumber || '',
      title: body.title || '',
      discipline: body.discipline || 'Architectural',
      revision: body.revision ?? 0,
      revision_date: body.revision_date || null,
      status: body.status || 'current',
      url: body.url || '',
      notes: body.notes || '',
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, drawing: data });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
