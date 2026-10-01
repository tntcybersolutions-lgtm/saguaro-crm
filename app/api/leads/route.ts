import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { requirePermission } from '@/lib/permissions';
import { normaliseStage } from '@/lib/lead-stages';
import type { Database } from '@/lib/database.types';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const url = new URL(req.url);
    const stage = url.searchParams.get('stage');
    let q = supabase.from('lead_pipeline').select('*').eq('tenant_id', user.tenantId);
    if (stage) q = q.eq('stage', normaliseStage(stage));
    const { data, error } = await q.order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ leads: data ?? [] });
  } catch (e) {
    // A failed read must NOT render as an empty list. The screen would say
    // "no leads" with total confidence when the truth is that the query
    // failed — and the old body carried source:'error', which no screen has
    // ever read. Real status, real server-side log, correlation id.
    return apiError('leads', e, 'Could not load leads');
  }
}

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Sales', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const supabase = createServerClient();
    const body = await req.json();

    // Map the page's field names onto real lead_pipeline columns. The page sends
    // contact_email/contact_phone (-> email/phone) and company_name/contact_name.
    // Fields with no column and no jsonb sink (tags, description, address parts,
    // estimated_start, follow_up_date, custom_fields, created_by) are folded into
    // notes/location/next_action_date where there is a clear home, else dropped.
    const insert: Record<string, unknown> = {
      tenant_id: user.tenantId,
      company_name: body.company_name ?? body.company ?? null,
      contact_name: body.contact_name ?? body.name ?? null,
      email: body.email ?? body.contact_email ?? null,
      phone: body.phone ?? body.contact_phone ?? null,
      source: body.source || 'website',
      stage: normaliseStage(body.stage),
      project_type: body.project_type ?? null,
      estimated_value: body.estimated_value ?? 0,
      probability: body.probability ?? 50,
      assigned_to: body.assigned_to ?? null,
      notes: body.notes ?? body.description ?? null,
    };

    // location is the single geographic text column; combine any address parts.
    const loc = [body.address, body.city, body.state, body.zip].filter(Boolean).join(', ');
    if (body.location) insert.location = body.location;
    else if (loc) insert.location = loc;

    // follow_up_date maps to the next_action_date (date) column.
    if (body.next_action_date) insert.next_action_date = body.next_action_date;
    else if (body.follow_up_date) insert.next_action_date = body.follow_up_date;

    const { data, error } = await supabase.from('lead_pipeline').insert(insert as Database['public']['Tables']['lead_pipeline']['Insert']).select().single();
    if (error) throw error;
    return NextResponse.json({ lead: data }, { status: 201 });
  } catch (e: unknown) {
    // A raw Error's text is the database's words, not ours — log it, show the line we wrote.
    console.error('[leads]', e);
    const msg = "Failed";
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
