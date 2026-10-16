/**
 * The browser-readable employees columns, three places that must agree:
 * lib/employee-columns.ts, the GRANT in 20261016f_employees_private_columns.sql,
 * and the real table (column list below, read from information_schema on
 * 16 Oct 2026).
 * Run: npx -y tsx lib/employee-columns.sanity.test.ts   (exit 0 = every assertion held)
 */
import fs from 'node:fs';
import path from 'node:path';
import { EMPLOYEE_PRIVATE_COLUMNS, EMPLOYEE_PUBLIC_COLUMNS, EMPLOYEE_WRITABLE_FIELDS, isOwnEmployeeRecord } from './employee-columns';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

const TABLE = ['id', 'tenant_id', 'employee_number', 'first_name', 'last_name', 'full_name', 'title', 'trade', 'email', 'phone',
  'emergency_contact_name', 'emergency_contact_phone', 'hire_date', 'termination_date', 'employment_type', 'regular_rate',
  'overtime_rate', 'doubletime_rate', 'osha_10_certified', 'osha_30_certified', 'forklift_certified', 'osha_cert_date',
  'is_active', 'default_csi_division', 'created_at', 'updated_at', 'qbo_employee_id', 'certifications', 'specialties',
  'address', 'date_of_birth', 'role', 'permissions', 'photo_url'];

const pub = new Set<string>(EMPLOYEE_PUBLIC_COLUMNS);
const priv = new Set<string>(EMPLOYEE_PRIVATE_COLUMNS);
check('no column is both public and private', [...pub].every((c) => !priv.has(c)));
check('public + private = every column of employees', TABLE.length === pub.size + priv.size && TABLE.every((c) => pub.has(c) || priv.has(c)),
  TABLE.filter((c) => !pub.has(c) && !priv.has(c)).join(','));

const sql = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261016f_employees_private_columns.sql'), 'utf8');
const grantList = (verb: string) => {
  const m = sql.match(new RegExp(`GRANT ${verb} \\(([^)]*)\\) ON public\\.employees`));
  return m ? m[1].split(',').map((s) => s.trim()).filter(Boolean) : [];
};
const sel = grantList('SELECT');
check('migration GRANT SELECT = EMPLOYEE_PUBLIC_COLUMNS', sel.length === pub.size && sel.every((c) => pub.has(c)), sel.filter((c) => !pub.has(c)).join(','));
for (const verb of ['INSERT', 'UPDATE']) {
  const cols = grantList(verb);
  check(`migration GRANT ${verb} names no private column`, cols.length > 0 && cols.every((c) => !priv.has(c)));
}
check('migration revokes the table-level grants first', /REVOKE SELECT, INSERT, UPDATE ON public\.employees FROM authenticated, anon/.test(sql));
check('every writable field is a real column', EMPLOYEE_WRITABLE_FIELDS.every((f) => TABLE.includes(f)));
check('full_name (generated) is not writable', !(EMPLOYEE_WRITABLE_FIELDS as readonly string[]).includes('full_name'));

check('own record by email, any case', isOwnEmployeeRecord({ email: 'Ben@Example.com' }, 'ben@example.com'));
check('own record by full_name holding the email', isOwnEmployeeRecord({ email: null, full_name: 'ben@example.com' }, 'ben@example.com'));
check('someone else is not mine', !isOwnEmployeeRecord({ email: 'amy@example.com', full_name: 'Amy Lee' }, 'ben@example.com'));
check('empty session email never matches an empty row', !isOwnEmployeeRecord({ email: '', full_name: '' }, ''));

process.exit(failed ? 1 : 0);
