import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }

  const row = {
    tenant_id: user.tenantId,
    project_id: body.project_id || body.projectId || null,
    drawing_id: body.drawing_id || body.drawingId || null,
    x_pct: Number(body.x_pct) || 0,
    y_pct: Number(body.y_pct) || 0,
    title: body.title || '',
    note: body.note || body.notes || '',
    category: body.category || 'Other',
    created_by_email: user.email || '',
  };

  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('drawing_pins')
      .insert(row)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, pin: data });
  } catch (err: unknown) {
    const msg = 'Internal server error';
    console.error('[drawings/pin] error:', msg);
    return NextResponse.json(
      { error: `[drawings/pin] Database error: ${msg}` },
      { status: 500 }
    );
  }
}
