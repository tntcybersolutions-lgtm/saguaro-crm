import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError, apiFail } from '@/lib/api-error';
import { getEffectivePermissions, hasPermission, requirePermission } from '@/lib/permissions';
import {
  EMPLOYEE_PRIVATE_COLUMNS,
  EMPLOYEE_PUBLIC_SELECT,
  isOwnEmployeeRecord,
  toEmployeeWrite,
} from '@/lib/employee-columns';
import type { Database } from '@/lib/database.types';

export const dynamic = 'force-dynamic';

type EmployeeUpdate = Database['public']['Tables']['employees']['Update'];

const PRIVATE_SELECT = EMPLOYEE_PRIVATE_COLUMNS.join(', ');

/**
 * GET /api/team/employees/[id]
 *
 * One employee record. The roster fields go to anyone in the company; pay and
 * home details (lib/employee-columns EMPLOYEE_PRIVATE_COLUMNS) go only to a
 * user with Admin: View, or to the person themselves — the time clock reads
 * the clocked-in person's own rate to cost their hours.
 *
 * The database no longer hands those columns to the browser
 * (20261016f_employees_private_columns.sql); this route is how the People
 * directory and the time clock get them.
 *
 * Response: { employee, canSeePay, canEdit }
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission(req, 'Projects', 'View', { projectId: null, companyWide: true });
  if (!gate.ok) return gate.res;
  const user = gate.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  if (!id) return apiFail('Missing employee id', 400);

  try {
    const db = createServerClient();
    const { data: row, error } = await db
      .from('employees')
      .select(EMPLOYEE_PUBLIC_SELECT)
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();
    if (error) throw error;
    if (!row) return apiFail('Employee not found', 404);

    const perms = await getEffectivePermissions(db, user.id, user.tenantId);
    const self = isOwnEmployeeRecord(row as { email?: string | null; full_name?: string | null }, user.email);
    const canSeePay = self || hasPermission(perms, 'Admin', 'View');
    const canEdit = hasPermission(perms, 'Admin', 'Edit');

    let employee: Record<string, unknown> = { ...(row as unknown as Record<string, unknown>) };
    if (canSeePay) {
      const { data: priv, error: privErr } = await db
        .from('employees')
        .select(PRIVATE_SELECT)
        .eq('id', id)
        .eq('tenant_id', user.tenantId)
        .maybeSingle();
      if (privErr) throw privErr;
      employee = { ...employee, ...((priv ?? {}) as unknown as Record<string, unknown>) };
    }

    return NextResponse.json({ employee, canSeePay, canEdit });
  } catch (e) {
    return apiError('team/employees/get', e, "Couldn't load this person's record. Try again.");
  }
}

/**
 * PATCH /api/team/employees/[id]
 * Body: any of lib/employee-columns EMPLOYEE_WRITABLE_FIELDS.
 * Changing someone's record (their rate included) needs Admin: Edit — the
 * same rule the database's role_gate_upd_employees policy enforces.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Admin', 'Edit');
  if (!g.ok) return g.res;
  const { id } = await params;
  if (!id) return apiFail('Missing employee id', 400);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch (e) {
    console.debug('[team/employees/patch] unreadable body', e);
    return apiFail('Send the changes as JSON.', 400);
  }

  const patch = toEmployeeWrite(body);
  if (patch.error) return apiFail(patch.error, 400);
  if (Object.keys(patch.values).length === 0) return apiFail('Nothing to change — send at least one field.', 400);

  try {
    const { data, error } = await g.db
      .from('employees')
      .update({ ...(patch.values as EmployeeUpdate), updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', g.user.tenantId)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) return apiFail('Employee not found', 404);
    return NextResponse.json({ id: data.id });
  } catch (e) {
    return apiError('team/employees/patch', e, "Couldn't save that change — nothing was written. Try again.");
  }
}
