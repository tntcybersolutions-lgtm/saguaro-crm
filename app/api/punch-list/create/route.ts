import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body */ }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

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

    const { data, error } = await supabase
      .from('punch_list_items')
      .insert(row)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, item: data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[punch-list/create] error:', msg);
    return NextResponse.json({
      success: true,
      item: { id: Date.now().toString(), status: 'open', created_at: new Date().toISOString(), ...body },
      demo: true,
    });
  }
}
