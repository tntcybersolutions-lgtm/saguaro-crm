-- resource_assignments: person-level pay rates out of the browser's reach.
--
-- cost_rate and hourly_rate are what a named person costs per hour. Rows were
-- readable by every signed-in member of the company over the REST API. This
-- is the same column-privilege approach as 20261016f (employees).
--
-- SAFE TO APPLY NOW: no browser code reads or writes resource_assignments
-- (grep getSupabaseBrowser / sb.from in app/, components/, lib/ — zero hits).
-- The resource-planning screens go through /api/projects/[projectId]/resource-planning
-- and /api/projects/all/resource-planning, which use the service role and are
-- unaffected by column privileges.
--
-- Rows themselves are gated by role_gate_*_resource_assignments (Projects
-- View / Edit / Full) in 20261016g. A column added to this table later is NOT
-- readable from the browser until it is added to the GRANT below — deliberately.

REVOKE SELECT, INSERT, UPDATE ON public.resource_assignments FROM authenticated, anon;

GRANT SELECT (
  id, tenant_id, project_id, resource_type, resource_name, role, start_date, end_date,
  hours_per_day, status, notes, created_at, updated_at, person_name, person_id,
  days_per_week, created_by
) ON public.resource_assignments TO authenticated;

GRANT INSERT (
  tenant_id, project_id, resource_type, resource_name, role, start_date, end_date,
  hours_per_day, status, notes, person_name, person_id, days_per_week, created_by
) ON public.resource_assignments TO authenticated;

GRANT UPDATE (
  project_id, resource_type, resource_name, role, start_date, end_date,
  hours_per_day, status, notes, updated_at, person_name, person_id, days_per_week
) ON public.resource_assignments TO authenticated;
