import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { must } from '@/lib/db-write';
import { apiError } from '@/lib/api-error';

/* A deal's activity log is sales data: it is read and written under the Sales
   permission, the same as the deal itself (GET/PATCH /api/leads/[id]). It used
   to read under "any signed-in user" and write under Projects:Edit, so a
   salesperson with Sales access but no project rights could open a deal and
   not log a single call on it. */

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requirePermission(req, 'Sales', 'View');
  if (!g.ok) return g.res;
  const user = g.user;
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

const ACTIVITY_TYPES = ['call', 'email', 'meeting', 'note'];

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requirePermission(req, 'Sales', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const supabase = createServerClient();
    const body = await req.json();
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    if (!description) return NextResponse.json({ error: 'description is required' }, { status: 400 });
    const type = String(body.activity_type || 'note').toLowerCase();

    /* The lead must be this company's. The insert stamps OUR tenant_id, but the
       foreign key alone would happily hang a note off another company's lead id. */
    const { data: lead, error: leadErr } = await supabase.from('lead_pipeline').select('id')
      .eq('id', params.id).eq('tenant_id', user.tenantId).maybeSingle();
    if (leadErr) throw leadErr;
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

    const { data, error } = await supabase.from('lead_activities').insert({
      tenant_id: user.tenantId, lead_id: params.id,
      activity_type: ACTIVITY_TYPES.includes(type) ? type : 'note',
      description,
      outcome: body.outcome || null, scheduled_at: body.scheduled_at || null,
      completed_at: body.completed_at || null,
      // Who logged it comes from the session, never from the request body.
      created_by: user.id,
    }).select().single();
    if (error) throw error;
    // Bump the lead's updated_at to reflect the new activity. (lead_pipeline has
    // no last_contact_date column, so only updated_at is touched.)
    await must(supabase.from('lead_pipeline').update({ updated_at: new Date().toISOString() }).eq('id', params.id).eq('tenant_id', user.tenantId), 'lead_pipeline update');
    return NextResponse.json({ activity: data }, { status: 201 });
  } catch (e: unknown) {
    return apiError('leads/[id]/activities POST', e, 'Could not log the activity');
  }
}
