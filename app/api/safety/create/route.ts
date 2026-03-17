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
      tenant_id:     user.tenantId,
      project_id:    body.project_id   || body.projectId   || null,
      description:   body.description  || '',
      severity:      body.severity     || 'Minor',
      injury_type:   body.injury_type  || body.injuryType  || 'No Injury',
      location:      body.location     || '',
      reported_to:   body.reported_to  || body.reportedTo  || '',
      incident_date: body.incident_date || body.incidentDate || new Date().toISOString().split('T')[0],
      reported_by:   user.email        || 'Field User',
      status:        'open',
    };

    const { data, error } = await supabase
      .from('safety_incidents')
      .insert(row)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, incident: data });
  } catch (err: unknown) {
    const msg = 'Internal server error';
    console.error('[safety/create] error:', msg);
    return NextResponse.json(
      { error: `[safety/create] Database error: ${msg}` },
      { status: 500 }
    );
  }
}
