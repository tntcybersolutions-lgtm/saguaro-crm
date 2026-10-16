import { NextRequest, NextResponse } from 'next/server';
import { apiError, apiFail } from '@/lib/api-error';
import { requirePermission } from '@/lib/permissions';
import { toEmployeeWrite } from '@/lib/employee-columns';
import type { Database } from '@/lib/database.types';

export const dynamic = 'force-dynamic';

type EmployeeInsert = Database['public']['Tables']['employees']['Insert'];

/**
 * POST /api/team/employees
 * Add a person to the crew roster, rate included. Needs Admin: Edit — the
 * same rule the database's role_gate_ins_employees policy enforces. The rate
 * is written here, server-side, because the browser can no longer write pay
 * columns (20261016f_employees_private_columns.sql).
 *
 * Body: first_name / last_name (one required) and any other field in
 * lib/employee-columns EMPLOYEE_WRITABLE_FIELDS. Response: { id }.
 */
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Admin', 'Edit');
  if (!g.ok) return g.res;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch (e) {
    console.debug('[team/employees/post] unreadable body', e);
    return apiFail('Send the new person as JSON.', 400);
  }

  const w = toEmployeeWrite(body);
  if (w.error) return apiFail(w.error, 400);
  const first = String(w.values.first_name ?? '');
  const last = String(w.values.last_name ?? '');
  if (!first && !last) return apiFail('Enter a first or last name.', 400);

  try {
    const row: EmployeeInsert = {
      ...(w.values as Partial<EmployeeInsert>),
      first_name: first,
      last_name: last,
      employment_type: (w.values.employment_type as string | null) || 'hourly',
      is_active: w.values.is_active === false ? false : true,
      tenant_id: g.user.tenantId,
    };
    const { data, error } = await g.db.from('employees').insert(row).select('id').single();
    if (error) {
      if ((error as { code?: string }).code === '23505') return apiFail('Someone with these details is already on your roster.', 409);
      throw error;
    }
    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (e) {
    return apiError('team/employees/post', e, "Couldn't add this person — nothing was saved. Try again.");
  }
}
