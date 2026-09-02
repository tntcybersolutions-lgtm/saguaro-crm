import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { must } from '@/lib/db-write';

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
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
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
    // Bump the lead's updated_at to reflect the new activity. (lead_pipeline has
    // no last_contact_date column, so only updated_at is touched.)
    await must(supabase.from('lead_pipeline').update({ updated_at: new Date().toISOString() }).eq('id', params.id).eq('tenant_id', user.tenantId), 'lead_pipeline update');
    return NextResponse.json({ activity: data }, { status: 201 });
  } catch (e: unknown) {
    // A raw Error's text is the database's words, not ours — log it, show the line we wrote.
    console.error('[leads/id/activities]', e);
    const msg = "Failed";
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
