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
    equipment_name: body.equipment_name || body.equipmentName || '',
    operator: body.operator || '',
    hours_used: Number(body.hours_used || body.hoursUsed) || 0,
    condition: body.condition || 'Good',
    notes: body.notes || '',
    work_date:
      body.work_date ||
      body.workDate ||
      new Date().toISOString().split('T')[0],
  };

  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('equipment_logs')
      .insert(row)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, entry: data });
  } catch (err: unknown) {
    const msg = 'Internal server error';
    console.error('[equipment/create] error:', msg);
    return NextResponse.json(
      { error: `[equipment/create] Database error: ${msg}` },
      { status: 500 }
    );
  }
}
