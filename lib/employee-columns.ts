/**
 * Which employees columns any signed-in crew member may read, and which only
 * HR may.
 *
 * The roster (name, title, trade, phone, certifications) is what every crew
 * picker and the People directory list show, so it stays readable straight
 * from the browser. Pay and home details do not: a Salesperson with their own
 * login could read every coworker's hourly rate over the Supabase REST API.
 *
 * 20261016f_employees_private_columns.sql takes PRIVATE out of the browser's
 * reach at the column level (GRANT SELECT on PUBLIC only). From then on the
 * private fields come only from /api/team/employees/[id], which returns them
 * to Admin: View, or to the person themselves. Both lists must cover every
 * column of public.employees — lib/employee-columns.sanity.test.ts checks the
 * migration grants exactly PUBLIC.
 *
 * Leaf module, no imports: safe in a client component.
 */

export const EMPLOYEE_PRIVATE_COLUMNS = [
  'regular_rate',
  'overtime_rate',
  'doubletime_rate',
  'date_of_birth',
  'address',
  'emergency_contact_name',
  'emergency_contact_phone',
] as const;

export const EMPLOYEE_PUBLIC_COLUMNS = [
  'id',
  'tenant_id',
  'employee_number',
  'first_name',
  'last_name',
  'full_name',
  'title',
  'trade',
  'email',
  'phone',
  'hire_date',
  'termination_date',
  'employment_type',
  'osha_10_certified',
  'osha_30_certified',
  'forklift_certified',
  'osha_cert_date',
  'is_active',
  'default_csi_division',
  'created_at',
  'updated_at',
  'qbo_employee_id',
  'certifications',
  'specialties',
  'role',
  'permissions',
  'photo_url',
] as const;

export type EmployeePrivateColumn = (typeof EMPLOYEE_PRIVATE_COLUMNS)[number];

/** Comma list for a supabase-js .select() of the browser-readable columns. */
export const EMPLOYEE_PUBLIC_SELECT = EMPLOYEE_PUBLIC_COLUMNS.join(', ');

/**
 * Fields the People directory may write through PATCH /api/team/employees/[id].
 * full_name is GENERATED ALWAYS and tenant_id comes from the session, so
 * neither is here.
 */
export const EMPLOYEE_WRITABLE_FIELDS = [
  'first_name',
  'last_name',
  'title',
  'trade',
  'email',
  'phone',
  'address',
  'employment_type',
  'regular_rate',
  'overtime_rate',
  'emergency_contact_name',
  'emergency_contact_phone',
  'specialties',
  'is_active',
] as const;

/** Lower-cased email match, the way lib/timeclock/server.ts finds a person's own record. */
export function isOwnEmployeeRecord(row: { email?: string | null; full_name?: string | null }, userEmail: string): boolean {
  const mine = (userEmail || '').trim().toLowerCase();
  if (!mine) return false;
  return (row.email || '').trim().toLowerCase() === mine || (row.full_name || '') === userEmail;
}

/**
 * Whitelist + coerce a People-directory write (PATCH / POST /api/team/employees). Names stay NOT NULL (an empty half is ''), rates are
 * numbers ≥ 0, specialties a string list. Anything else in the body is ignored.
 */
export function toEmployeeWrite(body: Record<string, unknown>): { values: Record<string, unknown>; error?: string } {
  const values: Record<string, unknown> = {};
  for (const f of EMPLOYEE_WRITABLE_FIELDS) {
    if (!(f in body)) continue;
    const v = body[f];
    if (f === 'first_name' || f === 'last_name') {
      values[f] = typeof v === 'string' ? v.trim() : '';
    } else if (f === 'regular_rate' || f === 'overtime_rate') {
      const n = v === '' || v == null ? 0 : Number(v);
      if (!Number.isFinite(n) || n < 0) return { values: {}, error: `Enter the ${f === 'regular_rate' ? 'rate' : 'overtime rate'} as a dollar amount.` };
      values[f] = Math.round(n * 100) / 100;
    } else if (f === 'is_active') {
      values[f] = v === true || v === 'true';
    } else if (f === 'specialties') {
      if (!Array.isArray(v)) return { values: {}, error: 'Specialties must be a list.' };
      values[f] = v.map((s) => String(s).trim()).filter(Boolean);
    } else {
      values[f] = typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
    }
  }
  return { values };
}
