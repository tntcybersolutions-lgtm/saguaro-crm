import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/** camel+snake tolerant: returns the first key present (even if null), else undefined. */
function pick(body: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) if (k in body) return body[k];
  return undefined;
}

// POST /api/schedule/milestones  -> { success, milestone }
// Create a schedule_milestones row. Real columns include: title, name,
// milestone_number (auto), current_date (the schedule date), status, sort_order.
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Schedule', 'Edit');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const projectId = pick(body, 'project_id', 'projectId');
    if (!projectId) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 });
    }

    const title = pick(body, 'title', 'name');
    if (!title) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }

    // schedule_milestones.baseline_date is NOT NULL; current_date/actual_date
    // are nullable. Accept several client aliases and require a date.
    const milestoneDate = pick(body, 'milestone_date', 'milestoneDate', 'date', 'target_date', 'targetDate', 'current_date', 'baseline_date');
    if (milestoneDate === undefined || milestoneDate === null) {
      return NextResponse.json({ error: 'milestone date is required' }, { status: 400 });
    }

    const db = createServerClient();

    // Auto-number: compute next milestone_number per project.
    const { data: last } = await db
      .from('schedule_milestones')
      .select('milestone_number')
      .eq('tenant_id', user.tenantId)
      .eq('project_id', projectId as string)
      .order('milestone_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    const milestoneNumber = ((last as any)?.milestone_number || 0) + 1;

    const insert: Record<string, unknown> = {
      tenant_id: user.tenantId,
      project_id: projectId,
      milestone_number: milestoneNumber,
      // write both name + title so any reader gets the label
      title,
      name: title,
      status: pick(body, 'status') ?? 'pending',
      created_by: user.id,
      // baseline_date is the NOT NULL schedule anchor; mirror to current_date.
      baseline_date: milestoneDate,
      current_date: milestoneDate,
    };
    const sortOrder = pick(body, 'sort_order', 'sortOrder');
    if (sortOrder !== undefined && sortOrder !== null) insert.sort_order = Number(sortOrder);
    const description = pick(body, 'description');
    if (description !== undefined) insert.description = description;

    const { data, error } = await db
      .from('schedule_milestones')
      .insert(insert as any)
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ success: true, milestone: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return apiError('schedule/milestones', e);
  }
}
