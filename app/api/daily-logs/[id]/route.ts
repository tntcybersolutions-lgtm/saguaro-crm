import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Role check, not just sign-in: Projects: View, the rule this tool's pages,
  // its writes and (where the table is gated) the database apply.
  const g = await requirePermission(req, 'Projects', 'View');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('daily_logs')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single();
    if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ log: data });
  } catch (e) {
    return apiError('daily-logs/[id] GET', e);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = await req.json();
    const db = createServerClient();
    const allowed = [
      'log_date','weather','high_temp','low_temp','crew_count',
      'work_performed','delays','safety_notes','materials_delivered','visitors','notes',
      // Mobile-app text columns — kept in the allowlist so an edit from either
      // surface can update the union without silently dropping them.
      'superintendent','precipitation','wind_conditions','phase_of_work','equipment',
      // Structured columns (jsonb / arrays) — create persists these, so edit
      // must too or the auto-filled sections vanish on the first PUT.
      'manpower_by_trade','equipment_on_site','equipment_hours',
      'materials_received','subcontractors_on_site',
    ];
    const fields: Record<string, any> = {};
    for (const k of allowed) {
      if (body[k] !== undefined) fields[k] = body[k];
    }
    const { error } = await db
      .from('daily_logs')
      .update(fields)
      .eq('id', id)
      .eq('tenant_id', user.tenantId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('daily-logs/[id] PUT', e);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Projects', 'Full');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const db = createServerClient();
    const { error } = await db
      .from('daily_logs')
      .delete()
      .eq('id', id)
      .eq('tenant_id', user.tenantId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('daily-logs/[id] DELETE', e);
  }
}
