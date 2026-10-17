-- Subcontractors see their own jobs only; Foremen raise RFIs.
--
-- Live QA, 17 Oct 2026 (walk/roles/REPORT.md D1, D8): a user given the
-- built-in Subcontractor company role saw every job, every contract value, the
-- owner's pay applications, other subs' prices, the pipeline and the
-- subscription — the role granted Projects: View and Pay Apps: View
-- company-wide and nothing narrowed it. Procore's model: a subcontractor sees
-- only the projects they are on, and none of the GC's owner billing.
--
-- 1. role_definitions.scope — 'company' (every job, as today) or 'assigned'
--    (only the jobs the person is on: a job row in user_role_assignments, or
--    a row in that job's project_team / project_users). lib/permission-resolve
--    rule 2b; the app applies it to every read (lib/viewer-scope).
-- 2. The built-in Subcontractor template: scope 'assigned', Pay Apps: None
--    (the owner's G702/G703 is the GC's billing, not the sub's — a sub bills
--    through the Sub Portal invoice).
-- 3. The built-in Foreman template: RFIs: Edit (field users raise RFIs, as in
--    Procore). Upward only: a company that already set it higher keeps it.
-- 4. rbac.permission_level_for learns rule 2b, so the SQL port keeps matching
--    the app (tools/rls-permission-parity). It only changes the answer for a
--    job-scoped person asked about a job they are not on.
--
-- Additive and idempotent. Built-in templates only; custom roles untouched.

ALTER TABLE public.role_definitions ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'company';

DO $c$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'role_definitions_scope_check'
                  AND conrelid = 'public.role_definitions'::regclass) THEN
    ALTER TABLE public.role_definitions
      ADD CONSTRAINT role_definitions_scope_check CHECK (scope IN ('company', 'assigned'));
  END IF;
END
$c$;

COMMENT ON COLUMN public.role_definitions.scope IS
  'company = every job in the company; assigned = only the jobs the person is on (job row or job team). Built-in Subcontractor is assigned.';

UPDATE public.role_definitions
   SET scope = 'assigned'
 WHERE is_builtin AND name = 'Subcontractor' AND scope <> 'assigned';

UPDATE public.role_definitions
   SET permissions = permissions || '{"Pay Apps": "None"}'::jsonb
 WHERE is_builtin AND name = 'Subcontractor'
   AND coalesce(permissions ->> 'Pay Apps', 'None') <> 'None';

UPDATE public.role_definitions
   SET permissions = permissions || '{"Sales": "None"}'::jsonb
 WHERE is_builtin AND name = 'Subcontractor' AND NOT (permissions ? 'Sales');

UPDATE public.role_definitions
   SET permissions = permissions || '{"RFIs": "Edit"}'::jsonb
 WHERE is_builtin AND name = 'Foreman'
   AND coalesce(permissions ->> 'RFIs', 'None') IN ('None', 'View');

-- Is this person's company role limited to the jobs they are on? Every company
-- role they hold must be 'assigned' (lib/permission-resolve isJobScoped).
CREATE OR REPLACE FUNCTION rbac.is_job_scoped(p_user uuid, p_tenant uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT count(*) > 0 AND bool_and(coalesce(rd.scope, 'company') = 'assigned')
    FROM user_role_assignments a
    JOIN role_definitions rd ON rd.id = a.role_id AND rd.tenant_id = p_tenant
   WHERE a.user_id = p_user AND a.tenant_id = p_tenant
     AND a.project_id IS NULL AND a.role_id IS NOT NULL;
$fn$;

-- On the job's team without a job row.
CREATE OR REPLACE FUNCTION rbac.is_on_job_team(p_user uuid, p_tenant uuid, p_project uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT EXISTS (SELECT 1 FROM project_team t WHERE t.user_id = p_user AND t.tenant_id = p_tenant AND t.project_id = p_project)
      OR EXISTS (SELECT 1 FROM project_users u WHERE u.user_id = p_user AND u.tenant_id = p_tenant AND u.project_id = p_project);
$fn$;

CREATE OR REPLACE FUNCTION rbac.permission_level_for(p_user uuid, p_category text, p_project_id uuid DEFAULT NULL)
RETURNS int
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_role    text;
  v_tenant  uuid;
  v_company int;
  v_job     int := NULL;
  v_rank    int;
  v_perms   jsonb;
  r         record;
BEGIN
  IF p_user IS NULL THEN
    RETURN 0;
  END IF;
  IF p_category NOT IN ('Projects','Budget','Schedule','Safety','Documents','RFIs',
                        'Submittals','Change Orders','Pay Apps','Reports','Sales','Admin') THEN
    RAISE EXCEPTION 'rbac: unknown permission category %', p_category;
  END IF;
  SELECT lower(coalesce(p.role, '')), p.tenant_id INTO v_role, v_tenant
    FROM profiles p WHERE p.id = p_user;
  IF v_role IN ('admin', 'owner') THEN
    RETURN 3;
  END IF;
  v_tenant := coalesce(v_tenant, p_user);
  v_company := rbac.company_level_for(p_user, v_tenant, p_category);
  IF p_project_id IS NULL OR p_category = 'Admin' THEN
    RETURN v_company;
  END IF;
  FOR r IN
    SELECT a.role_id, a.permissions
      FROM user_role_assignments a
     WHERE a.user_id = p_user AND a.tenant_id = v_tenant AND a.project_id = p_project_id
  LOOP
    IF r.role_id IS NULL THEN
      v_rank := v_company;
    ELSE
      SELECT coalesce(rd.permissions, '{}'::jsonb) INTO v_perms
        FROM role_definitions rd WHERE rd.tenant_id = v_tenant AND rd.id = r.role_id;
      v_rank := CASE WHEN FOUND THEN rbac.role_level(v_perms, p_category) ELSE 0 END;
    END IF;
    IF r.permissions IS NOT NULL AND jsonb_typeof(r.permissions) = 'object' AND r.permissions ? p_category THEN
      v_rank := rbac.level_rank(r.permissions -> p_category);
    END IF;
    v_job := greatest(coalesce(v_job, 0), v_rank);
  END LOOP;
  IF v_job IS NULL THEN
    -- 2b) A job-scoped company role (Subcontractor) on a job they are not on.
    IF rbac.is_job_scoped(p_user, v_tenant) AND NOT rbac.is_on_job_team(p_user, v_tenant, p_project_id) THEN
      RETURN 0;
    END IF;
    RETURN v_company;
  END IF;
  IF rbac.company_level_for(p_user, v_tenant, 'Admin') = 3 THEN
    RETURN greatest(v_job, v_company);
  END IF;
  RETURN v_job;
END;
$fn$;

REVOKE ALL ON FUNCTION rbac.is_job_scoped(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION rbac.is_on_job_team(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rbac.is_job_scoped(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION rbac.is_on_job_team(uuid, uuid, uuid) TO service_role;
