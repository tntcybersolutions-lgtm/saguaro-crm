import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body */ }

  if (!body.projectId && !body.project_id) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  }

  try {
    const db = createServerClient();

    const row = {
      project_id:  body.projectId  || body.project_id,
      tenant_id:   user.tenantId,
      description: body.description || '',
      location:    body.location    || '',
      trade:       body.trade       || 'General Contractor',
      priority:    body.priority    || 'Medium',
      status:      body.status      || 'open',
      due_date:    body.due_date    || null,
      notes:       body.notes       || '',
    };

    const { data, error } = await db
      .from('punch_list_items')
      .insert(row)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, item: data });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
