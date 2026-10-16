import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { must } from '@/lib/db-write';
import { apiError } from '@/lib/api-error';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    /* params.id is a lead id off the URL and this client is the service role,
       so with no tenant filter any signed-in user could read any company's
       lead activity log — every call note, every follow-up, by id. */
    const { data, error } = await supabase.from('lead_activities').select('*')
      .eq('tenant_id', user.tenantId)
      .eq('lead_id', params.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ activities: data ?? [] });
  } catch (e: unknown) {
    /* This returned { activities: [] } with a 200, so a failed read looked
       exactly like a lead with no activity. */
    return apiError('leads/[id]/activities GET', e, 'Could not load the activity log');
  }
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
    return apiError('leads/[id]/activities POST', e);
  }
}
