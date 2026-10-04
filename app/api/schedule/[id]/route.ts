import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Schedule', 'Edit');
  if (!g.ok) return g.res;
  const { id } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const db = createServerClient();
    // Map every alias the app may send (camelCase or snake_case) onto the real
    // schedule_tasks columns. Only assign a column when a value was actually
    // provided so a partial PUT doesn't null out untouched fields.
    const fields: Record<string, any> = {};
    const name = body.name ?? body.title;
    if (name !== undefined) fields.name = name;
    if (body.phase !== undefined) fields.phase = body.phase;
    if (body.trade !== undefined) fields.trade = body.trade;
    const startDate = body.start_date ?? body.startDate;
    if (startDate !== undefined) fields.start_date = startDate;
    const endDate = body.end_date ?? body.endDate;
    if (endDate !== undefined) fields.end_date = endDate;
    const pctComplete = body.pct_complete ?? body.pctComplete ?? body.percent_complete ?? body.percentComplete;
    if (pctComplete !== undefined) fields.pct_complete = pctComplete;
    if (body.status !== undefined) fields.status = body.status;
    // pct_complete and status are two writers of one fact. Keep them agreeing:
    // 100 % is complete, a started bar is in progress, complete means 100 %,
    // not started means 0 %. (Pima's 15 tasks sat at 100 % / not_started.)
    const pctNum = pctComplete !== undefined ? Number(pctComplete) : NaN;
    if (body.status === undefined && Number.isFinite(pctNum)) {
      if (pctNum >= 100) fields.status = 'complete';
      else if (pctNum > 0) fields.status = 'in_progress';
      else fields.status = 'not_started';
    } else if (body.status !== undefined && pctComplete === undefined) {
      if (body.status === 'complete') fields.pct_complete = 100;
      else if (body.status === 'not_started') fields.pct_complete = 0;
    } else if (body.status !== undefined && Number.isFinite(pctNum)) {
      // Both sent and disagreeing (the composer sends both): the bar wins.
      if (pctNum >= 100 && body.status !== 'complete') fields.status = 'complete';
      else if (pctNum > 0 && pctNum < 100 && body.status === 'not_started') fields.status = 'in_progress';
      else if (pctNum <= 0 && body.status === 'complete') fields.pct_complete = 100;
    }
    // Dependency: single predecessor task (uuid) — empty string clears it.
    const predecessorId = body.predecessor_id ?? body.predecessorId;
    if (predecessorId !== undefined) fields.predecessor_id = predecessorId || null;
    const duration = body.duration ?? body.durationDays;
    if (duration !== undefined) fields.duration = duration;
    const { error } = await db
      .from('schedule_tasks')
      .update(fields)
      .eq('id', id)
      .eq('tenant_id', user.tenantId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Schedule', 'Full');
  if (!g.ok) return g.res;
  const { id } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const db = createServerClient();
    const { error } = await db
      .from('schedule_tasks')
      .delete()
      .eq('id', id)
      .eq('tenant_id', user.tenantId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
