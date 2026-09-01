import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';

export async function PATCH(req: NextRequest, { params }: { params: { projectId: string; id: string } }) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const supabase = createServerClient();
    const body = await req.json();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const allowed = ['employee_name','hours_regular','hours_overtime','hours_double','cost_code','location','description','status','notes','submitted_at','rejection_reason'];
    for (const k of allowed) if (body[k] !== undefined) updates[k] = body[k];

    // The approver is whoever is holding this session — NEVER a name the client
    // supplied. The page used to post the literal string 'Current User', which
    // is what a payroll audit would have found stamped on every approval.
    if (updates.status === 'approved') {
      updates.approved_by = user.email || user.id;
      updates.approved_at = new Date().toISOString();
    } else if (updates.status !== undefined) {
      // Leaving a stale approver on a row pushed back to draft/rejected would
      // credit someone with approving hours that are no longer approved.
      updates.approved_by = null;
      updates.approved_at = null;
    }

    const { data, error } = await supabase.from('timesheets').update(updates).eq('id', params.id).eq('project_id', params.projectId).eq('tenant_id', user.tenantId).select().maybeSingle();
    if (error) throw error;
    // No row matched — wrong id, wrong project, or another tenant. Failed write.
    if (!data) return NextResponse.json({ error: 'Timesheet entry not found.' }, { status: 404 });
    return NextResponse.json({ timesheet: data });
  } catch (e: unknown) {
    console.error('[timesheets/PATCH]', e);
    // A raw Error's text is the database's words, not ours — log it, show the line we wrote.
    console.error('[projects/projectId/timesheets/id]', e);
    const msg = "Failed to update the timesheet entry.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { projectId: string; id: string } }) {
  const g = await requirePermission(req, 'Projects', 'Full');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const supabase = createServerClient();
    const { error } = await supabase.from('timesheets').delete().eq('id', params.id).eq('project_id', params.projectId).eq('tenant_id', user.tenantId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }); }
}
