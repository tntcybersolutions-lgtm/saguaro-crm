-- employees: pay and home details out of the browser's reach.
--
-- ⚠️ APPLY ONLY AFTER THE fix/role-rls PR IS MERGED AND DEPLOYED.
-- Before that PR, three screens read or write these columns straight from the
-- browser (PeopleDirectory select('*') and its rate edit, and the time clock
-- reading the clocked-in person's own rate). Applied early, those calls fail
-- with "permission denied for table employees" — for owners too, because
-- column privileges apply to the whole `authenticated` role.
-- After the PR, those reads and writes go through /api/team/employees, which
-- uses the service role (unaffected by this file) and returns pay only to
-- Admin: View or to the person themselves.
--
-- Row access is unchanged: everyone in the company still sees the roster
-- (names, titles, trades, phones, certifications). What changes is that the
-- REST API now refuses these columns to any signed-in user:
--   regular_rate, overtime_rate, doubletime_rate, date_of_birth, address,
--   emergency_contact_name, emergency_contact_phone
-- The column lists mirror lib/employee-columns.ts; the sanity test there fails
-- if the two drift. A column added to employees later is NOT readable from
-- the browser until it is added to the GRANT below — deliberately.

REVOKE SELECT, INSERT, UPDATE ON public.employees FROM authenticated, anon;

GRANT SELECT (
  id, tenant_id, employee_number, first_name, last_name, full_name, title, trade,
  email, phone, hire_date, termination_date, employment_type, osha_10_certified,
  osha_30_certified, forklift_certified, osha_cert_date, is_active,
  default_csi_division, created_at, updated_at, qbo_employee_id, certifications,
  specialties, role, permissions, photo_url
) ON public.employees TO authenticated;

-- The time clock creates a person's own first record from the browser
-- (app/app/time): tenant_id, email, first_name, last_name, is_active. RLS
-- (role_gate_ins_employees) still limits that to their own email unless the
-- user holds Admin: Edit.
GRANT INSERT (
  tenant_id, employee_number, first_name, last_name, title, trade, email, phone,
  hire_date, termination_date, employment_type, osha_10_certified,
  osha_30_certified, forklift_certified, osha_cert_date, is_active,
  default_csi_division, certifications, specialties, photo_url
) ON public.employees TO authenticated;

GRANT UPDATE (
  employee_number, first_name, last_name, title, trade, email, phone, hire_date,
  termination_date, employment_type, osha_10_certified, osha_30_certified,
  forklift_certified, osha_cert_date, is_active, default_csi_division,
  updated_at, certifications, specialties, photo_url
) ON public.employees TO authenticated;
