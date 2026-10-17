import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { toPage, toDb, canSeeRates, canSetRates, type AssignmentRow } from '@/lib/resource-assignments';
import { apiError, apiFail } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/**
 * One staffing assignment. Projects: View to read, Edit to change, Full to
 * delete (the same levels as role_gate_*_resource_assignments). What the person
 * costs per hour is returned only to Budget or Admin view, and only a role that
 * may edit Budget or Admin can change it (lib/resource-assignments).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Projects', 'View');
  if (!g.ok) return g.res;
  try {
    const { id } = await params;
    const { data, error } = await g.db
      .from('resource_assignments')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', g.user.tenantId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return apiFail('Assignment not found', 404);
    return NextResponse.json({ data: toPage(data as AssignmentRow, canSeeRates(g.perms)), ratesVisible: canSeeRates(g.perms) });
  } catch (e) {
    return apiError('projects/all/resource-planning/id GET', e, "Couldn't load this assignment.");
  }
}

async function update(req: NextRequest, id: string) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  try {
    const body = await req.json().catch(() => ({}));
    const row = toDb(body, g.user.tenantId, canSetRates(g.perms));
    // Never overwrite tenant scoping via body; updated_at maintained by trigger/default.
    delete (row as Record<string, unknown>).tenant_id;

    const { data, error } = await g.db
      .from('resource_assignments')
      .update(row)
      .eq('id', id)
      .eq('tenant_id', g.user.tenantId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return apiFail('Assignment not found', 404);
    return NextResponse.json({ data: toPage(data as AssignmentRow, canSeeRates(g.perms)) });
  } catch (e) {
    return apiError('projects/all/resource-planning/id', e, "Couldn't save the assignment. Please try again.");
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return update(req, id);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return update(req, id);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Projects', 'Full');
  if (!g.ok) return g.res;
  try {
    const { id } = await params;
    const { error } = await g.db
      .from('resource_assignments')
      .delete()
      .eq('id', id)
      .eq('tenant_id', g.user.tenantId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('projects/all/resource-planning/id DELETE', e, "Couldn't delete the assignment. Please try again.");
  }
}
