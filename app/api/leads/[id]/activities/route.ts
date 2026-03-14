import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase.from('lead_activities').select('*').eq('lead_id', params.id).order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ activities: data ?? [] });
  } catch { return NextResponse.json({ activities: [] }); }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const body = await req.json();
    const { data, error } = await supabase.from('lead_activities').insert({
      tenant_id: user.tenantId, lead_id: params.id,
      activity_type: body.activity_type || 'note', description: body.description,
      outcome: body.outcome || null, scheduled_at: body.scheduled_at || null,
      completed_at: body.completed_at || null, created_by: body.created_by || null,
    }).select().single();
    if (error) throw error;
    // Update last_contact_date on the lead
    await supabase.from('lead_pipeline').update({ last_contact_date: new Date().toISOString().split('T')[0], updated_at: new Date().toISOString() }).eq('id', params.id);
    return NextResponse.json({ activity: data }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
