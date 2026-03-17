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
      project_id:        body.project_id,
      tenant_id:         user.tenantId,
      type:              body.type              || 'Other',
      result:            body.result            || 'pending',
      inspector_name:    body.inspector_name    || '',
      agency:            body.agency            || '',
      notes:             body.notes             || '',
      scheduled_date:    body.scheduled_date    || new Date().toISOString().split('T')[0],
      checklist:         body.checklist         || '[]',
      checklist_total:   body.checklist_total   || 0,
      checklist_passed:  body.checklist_passed  || 0,
      deficiency_count:  body.deficiency_count  || 0,
      status:            'Scheduled',
    };

    const { data, error } = await supabase
      .from('inspections')
      .insert(row)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, inspection: data });
  } catch (err: unknown) {
    const msg = 'Internal server error';
    console.error('[inspections/create] error:', msg);
    return NextResponse.json(
      { error: `[inspections/create] Database error: ${msg}` },
      { status: 500 }
    );
  }
}
