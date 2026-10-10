import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';

import { apiError } from '@/lib/api-error';
import { addDays } from '@/lib/time-zone';
import { toDay } from '@/lib/calendar-day';
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
    return apiError('compliance/lien-deadlines', error, undefined, 500);
  }

  return NextResponse.json({ deadlines: data || [] });
}

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Safety', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;

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
      // Calendar arithmetic on the day entered (no instant, no server zone).
      const fw = toDay(first_work_date);
      if (fw) calculated_deadlines.preliminary_notice = addDays(fw, 20);
    }
    if (completion_date) {
      const cd = toDay(completion_date);
      if (cd) calculated_deadlines.mechanics_lien = addDays(cd, 120);
    }
    if (last_work_date) {
      const lw = toDay(last_work_date);
      if (lw) calculated_deadlines.payment_bond_claim = addDays(lw, 90);
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
      reminder_sent_30: false,
      reminder_sent_14: false,
      reminder_sent_7: false,
    })
    .select()
    .single();

  if (error) {
    return apiError('compliance/lien-deadlines', error, undefined, 500);
  }

  return NextResponse.json({ deadline: data }, { status: 201 });
}
