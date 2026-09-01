import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const { data: project } = await supabase.from('projects').select('id').eq('id', params.projectId).eq('tenant_id', user.tenantId).single();
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const url = new URL(req.url);
    const status = url.searchParams.get('status'); // 'week' is filtered client-side by the page
    // Read the canonical time table the mobile field app writes (time_entries) — the old code read
    // `timesheets`, so every mobile clock-in was stranded and never appeared for approval. Map the
    // columns to what the approval page renders (date / regular_hrs / ot_hrs / employee / status).
    let q = supabase
      .from('time_entries')
      .select('*')
      .eq('project_id', params.projectId)
      .eq('tenant_id', user.tenantId);
    if (status) q = q.eq('status', status);
    const { data, error } = await q.order('work_date', { ascending: false });
    if (error) throw error;
    const rows = (data ?? []) as any[];
    const empIds = [...new Set(rows.map((r) => r.employee_id).filter(Boolean))];
    const names: Record<string, string> = {};
    if (empIds.length) {
      const { data: emps } = await supabase.from('employees').select('*').in('id', empIds);
      for (const e of (emps ?? []) as any[]) {
        names[e.id] = e.name || [e.first_name, e.last_name].filter(Boolean).join(' ') || e.email || '';
      }
    }
    const entries = rows.map((r) => ({
      ...r,
      employee: names[r.employee_id] || r.employee_name || '—',
      date: r.work_date,
      regular_hrs: Number(r.regular_hours ?? r.hours_worked ?? 0),
      ot_hrs: Number(r.overtime_hours ?? 0),
      classification: r.trade ?? r.classification ?? r.csi_division ?? '',
      status: r.status || 'pending',
    }));
    return NextResponse.json({ entries, timesheets: entries });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error('[projects/[projectId]/timesheets] read failed:', detail);
    // A failed read must not render as an empty result — return a real
    // status so the UI can show an error state with a retry.
    return NextResponse.json({ error: 'Failed to load entries', detail }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const supabase = createServerClient();
    const body = await req.json();
    const { data, error } = await supabase.from('timesheets').insert({
      tenant_id: user.tenantId, project_id: params.projectId,
      employee_name: body.employee_name, employee_id: body.employee_id || null,
      week_ending: body.week_ending, work_date: body.work_date,
      hours_regular: body.hours_regular || 0, hours_overtime: body.hours_overtime || 0,
      hours_double: body.hours_double || 0, cost_code: body.cost_code || null,
      location: body.location || null, description: body.description || null,
      status: body.status || 'draft', notes: body.notes || null, created_by: user.id,
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ timesheet: data }, { status: 201 });
  } catch (e: unknown) {
    // A raw Error's text is the database's words, not ours — log it, show the line we wrote.
    console.error('[projects/projectId/timesheets]', e);
    const msg = "Failed";
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
