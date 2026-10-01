import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { must } from '@/lib/db-write';
import { normaliseStage } from '@/lib/lead-stages';
import { apiError } from '@/lib/api-error';

// GET /api/leads/[id] — one lead, tenant-scoped. The deal page (Path 12,
// app/app/leads/[id]) needs a single lead; the board only ever had the list.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requirePermission(req, 'Sales', 'View');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('lead_pipeline')
      .select('*')
      .eq('id', params.id)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();
    if (error) throw error;
    // 404, not an empty 200: a deal page that renders a blank shell for a
    // missing/cross-tenant id reads as "this deal has no data" (§0/§3).
    if (!data) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    return NextResponse.json({ lead: data });
  } catch (e) {
    return apiError('leads/id', e, 'Could not load the lead');
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requirePermission(req, 'Sales', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const supabase = createServerClient();
    const body = await req.json();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    // Only real lead_pipeline columns are updatable.
    const allowed = ['company_name','contact_name','email','phone','source','stage','project_type','estimated_value','probability','assigned_to','location','notes','next_action','next_action_date','lost_reason','lost_at','won_at','project_id','customer_id'];
    for (const k of allowed) if (body[k] !== undefined) updates[k] = body[k];

    // Canonicalise stage casing on write so the pipeline vocabulary can never
    // split again (MUST-PASS Path 10). Keep won_at/lost_at stamping in step.
    if (updates.stage !== undefined) updates.stage = normaliseStage(updates.stage as string);

    // Map the page's alternate field names onto real columns.
    if (body.name !== undefined && body.contact_name === undefined) updates.contact_name = body.name;
    if (body.company !== undefined && body.company_name === undefined) updates.company_name = body.company;
    if (body.contact_email !== undefined && body.email === undefined) updates.email = body.contact_email;
    if (body.contact_phone !== undefined && body.phone === undefined) updates.phone = body.contact_phone;
    if (body.description !== undefined && updates.notes === undefined) updates.notes = body.description;
    if (body.follow_up_date !== undefined && updates.next_action_date === undefined) updates.next_action_date = body.follow_up_date;
    // tags, custom_fields, address parts, last_contact_date, converted_project_id,
    // estimated_start have no column on lead_pipeline and are intentionally dropped.

    const { data, error } = await supabase.from('lead_pipeline').update(updates).eq('id', params.id).eq('tenant_id', user.tenantId).select().single();
    if (error) throw error;
    return NextResponse.json({ lead: data });
  } catch (e) {
    // Was a dead `const msg` + generic 'Internal server error' that buried a
    // failed stage/field update. Honest surface, correlation id, server log (§0/§3).
    return apiError('leads/id', e, 'Could not update the lead');
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requirePermission(req, 'Sales', 'Full');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const supabase = createServerClient();
    await must(supabase.from('lead_activities').delete().eq('lead_id', params.id).eq('tenant_id', user.tenantId), 'lead_activities delete');
    const { error } = await supabase.from('lead_pipeline').delete().eq('id', params.id).eq('tenant_id', user.tenantId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    // A failed delete (FK still referencing the lead, RLS) must not read as 'Failed'
    // with no log. apiError logs the cause and ties it to a correlation id (§0/§3).
    return apiError('leads/id', e, 'Could not delete the lead');
  }
}
