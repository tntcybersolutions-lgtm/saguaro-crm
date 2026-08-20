import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createServerClient();
  const tenantId = user.tenantId;
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId') || undefined;

  let query = db
    .from('lien_deadlines')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('due_date', { ascending: true });

  if (projectId) query = query.eq('project_id', projectId);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deadlines: data || [] });
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createServerClient();
  const tenantId = user.tenantId;
  const body = await req.json();

  const {
    project_id,
    state,
    deadline_type,
    due_date,
    description,
    first_work_date,
    completion_date,
    last_work_date,
  } = body;

  if (!project_id || !state || !deadline_type || !due_date) {
    return NextResponse.json({ error: 'Missing required fields: project_id, state, deadline_type, due_date' }, { status: 400 });
  }

  // Calculate AZ-specific deadlines if applicable
  let calculated_deadlines: Record<string, string> = {};
  if (state === 'AZ') {
    if (first_work_date) {
      const fw = new Date(first_work_date);
      const prelim = new Date(fw);
      prelim.setDate(prelim.getDate() + 20);
      calculated_deadlines.preliminary_notice = prelim.toISOString().split('T')[0];
    }
    if (completion_date) {
      const cd = new Date(completion_date);
      const mechLien = new Date(cd);
      mechLien.setDate(mechLien.getDate() + 120);
      calculated_deadlines.mechanics_lien = mechLien.toISOString().split('T')[0];
    }
    if (last_work_date) {
      const lw = new Date(last_work_date);
      const bondClaim = new Date(lw);
      bondClaim.setDate(bondClaim.getDate() + 90);
      calculated_deadlines.payment_bond_claim = bondClaim.toISOString().split('T')[0];
    }
  }

  const { data, error } = await db
    .from('lien_deadlines')
    .insert({
      tenant_id: tenantId,
      project_id,
      state,
      deadline_type,
      due_date,
      description: description || '',
      first_work_date: first_work_date || null,
      completion_date: completion_date || null,
      last_work_date: last_work_date || null,
      calculated_deadlines: Object.keys(calculated_deadlines).length > 0 ? calculated_deadlines : null,
      status: 'active',
      created_by: user.id,
      reminder_30: false,
      reminder_14: false,
      reminder_7: false,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deadline: data }, { status: 201 });
}
