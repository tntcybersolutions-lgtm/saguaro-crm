-- Permissions per job (Procore behavior).
--
-- Someone can be a Project Manager on one job, Read-Only on another and have
-- no access on a third. The job role is stored where job-scoped grants already
-- lived: user_role_assignments rows with project_id set (project_team and
-- project_users carry a `permissions` jsonb too, but hold 0 rows and are not
-- read by any permission check — extending them would have been a second
-- source of truth).
--
-- RESOLUTION ORDER (lib/permissions resolvePermissions is the TS original;
-- rbac.permission_level_for below is its line-for-line port; the parity
-- harness tools/rls-permission-parity proves they agree):
--   1. profiles.role 'admin' | 'owner'           => Full on everything, every job
--   2. company role = global grants (project_id IS NULL), highest wins;
--      none => member default (View everywhere, None on Admin)
--   3. no job asked about, or no row for that job => company role
--   4. the job's rows REPLACE the company role on that job, up or down: each
--      row is its role (no role => the company role) with its per-category
--      `permissions` levels laid on top; several rows => highest wins.
--      "No access" = a row with no role and every category None.
--   5. Admin (roles, payroll, billing, settings) stays company-wide
--   6. company admins (company role Admin: Full): the job role can add to the
--      company role on a job, never take from it
--
-- ADDITIVE AND IDEMPOTENT:
--   * one nullable column + a check that it is only used on job rows
--   * one unique index (one job row per person per job), created only when
--     the data already satisfies it
--   * rbac.permission_level_for keeps its signature and its answer for every
--     no-project call — the only kind any policy made before this file
--   * the role_gate_* policies on tables with a uuid project_id are rewritten
--     to ask about the row's job, but ONLY for users who hold a job row on
--     that job (rbac.my_override_project_ids). Everyone else, and every row of
--     every other job, takes the exact expression the policy had before.
--     Admin-category gates (payroll, time, audit log) are left as they are.
--   Live data on 16 Oct 2026: 9 grants, 6 on a job; the only non-admin with a
--   job row has no company role, so steps 4-6 change nothing anyone sees.

-- ── the column ───────────────────────────────────────────────────────────────
ALTER TABLE public.user_role_assignments ADD COLUMN IF NOT EXISTS permissions jsonb;

COMMENT ON COLUMN public.user_role_assignments.permissions IS
  'Per-category levels for this job only ({"Budget":"None",...}); laid on top of role_id (or the company role when role_id is null). Job rows only.';

DO $c$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ura_job_levels_on_job_rows' AND conrelid = 'public.user_role_assignments'::regclass) THEN
    ALTER TABLE public.user_role_assignments
      ADD CONSTRAINT ura_job_levels_on_job_rows
      CHECK (permissions IS NULL OR (project_id IS NOT NULL AND jsonb_typeof(permissions) = 'object'));
  END IF;
  -- One job role per person per job: the team screen sets it with one select.
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'ura_one_job_row') THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.user_role_assignments WHERE project_id IS NOT NULL
       GROUP BY tenant_id, user_id, project_id HAVING count(*) > 1
    ) THEN
      CREATE UNIQUE INDEX ura_one_job_row ON public.user_role_assignments (tenant_id, user_id, project_id) WHERE project_id IS NOT NULL;
    ELSE
      RAISE NOTICE 'ura_one_job_row skipped: someone already holds two rows on one job';
    END IF;
  END IF;
END
$c$;

CREATE INDEX IF NOT EXISTS idx_ura_project ON public.user_role_assignments (project_id) WHERE project_id IS NOT NULL;

-- ── the resolver ─────────────────────────────────────────────────────────────

-- A stored level (jsonb) as a rank. normalizeLevel(): only the exact strings count.
CREATE OR REPLACE FUNCTION rbac.level_rank(p_raw jsonb)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $fn$
  SELECT CASE WHEN p_raw IS NOT NULL AND jsonb_typeof(p_raw) = 'string' THEN
           CASE p_raw #>> '{}' WHEN 'Full' THEN 3 WHEN 'Edit' THEN 2 WHEN 'View' THEN 1 ELSE 0 END
         ELSE 0 END;
$fn$;

-- One stored role's level for one category. roleLevels(): Sales inherits
-- Projects when the role never mentions Sales; a non-object role is None.
CREATE OR REPLACE FUNCTION rbac.role_level(p_perms jsonb, p_category text)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $fn$
  SELECT CASE
    WHEN p_perms IS NULL OR jsonb_typeof(p_perms) <> 'object' THEN 0
    WHEN p_category = 'Sales' AND NOT (p_perms ? 'Sales') THEN rbac.level_rank(p_perms -> 'Projects')
    ELSE rbac.level_rank(p_perms -> p_category)
  END;
$fn$;

-- Company role (steps 2): global grants, highest wins; none => member default.
CREATE OR REPLACE FUNCTION rbac.company_level_for(p_user uuid, p_tenant uuid, p_category text)
RETURNS int
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_role_ids uuid[];
  v_level    int := 0;
BEGIN
  SELECT array_agg(DISTINCT a.role_id) INTO v_role_ids
    FROM user_role_assignments a
   WHERE a.user_id = p_user
     AND a.tenant_id = p_tenant
     AND a.role_id IS NOT NULL
     AND a.project_id IS NULL;

  IF v_role_ids IS NULL OR cardinality(v_role_ids) = 0 THEN
    RETURN CASE WHEN p_category = 'Admin' THEN 0 ELSE 1 END;
  END IF;

  SELECT coalesce(max(rbac.role_level(coalesce(rd.permissions, '{}'::jsonb), p_category)), 0) INTO v_level
    FROM role_definitions rd
   WHERE rd.tenant_id = p_tenant AND rd.id = ANY (v_role_ids);
  RETURN v_level;
END;
$fn$;

-- Level for one user, one category, optionally one job. Same signature as
-- before (20261016e); a NULL job gives exactly the old answer.
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

  -- 1) Base role bypass.
  SELECT lower(coalesce(p.role, '')), p.tenant_id INTO v_role, v_tenant
    FROM profiles p WHERE p.id = p_user;
  IF v_role IN ('admin', 'owner') THEN
    RETURN 3;
  END IF;
  v_tenant := coalesce(v_tenant, p_user);

  -- 2) Company role.
  v_company := rbac.company_level_for(p_user, v_tenant, p_category);

  -- 3) No job, and 5) Admin is company-wide.
  IF p_project_id IS NULL OR p_category = 'Admin' THEN
    RETURN v_company;
  END IF;

  -- 4) The job's rows replace the company role.
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
    RETURN v_company;
  END IF;

  -- 6) A company admin is never reduced on a job.
  IF rbac.company_level_for(p_user, v_tenant, 'Admin') = 3 THEN
    RETURN greatest(v_job, v_company);
  END IF;
  RETURN v_job;
END;
$fn$;

-- The jobs on which the signed-in user holds a job row (admins/owners: none,
-- they are Full everywhere). One evaluation per statement in a policy.
CREATE OR REPLACE FUNCTION rbac.my_override_project_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT coalesce(array_agg(DISTINCT a.project_id), '{}'::uuid[])
    FROM user_role_assignments a
    LEFT JOIN profiles p ON p.id = a.user_id
   WHERE auth.uid() IS NOT NULL
     AND a.user_id = auth.uid()
     AND a.project_id IS NOT NULL
     AND a.tenant_id = coalesce(p.tenant_id, a.user_id)
     AND lower(coalesce(p.role, '')) NOT IN ('admin', 'owner');
$fn$;

REVOKE ALL ON FUNCTION rbac.level_rank(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION rbac.role_level(jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION rbac.company_level_for(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION rbac.permission_level_for(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION rbac.my_override_project_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rbac.level_rank(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION rbac.role_level(jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION rbac.company_level_for(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION rbac.permission_level_for(uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION rbac.my_override_project_ids() TO authenticated, service_role;

-- ── the gates ────────────────────────────────────────────────────────────────
-- Every role_gate_* policy on a table with a uuid project_id becomes
--   CASE WHEN project_id IS NOT NULL
--             AND project_id = ANY ((SELECT rbac.my_override_project_ids())::uuid[])
--        THEN <the same expression, each check asking about this row's job>
--        ELSE <the expression exactly as it was>
--   END
-- has_permission(c, l, project_id) equals has_permission(c, l) for any job the
-- user holds no row on (step 3), so the ELSE is not a different rule, only the
-- fast path: its checks stay one-per-statement InitPlans, and the per-row
-- check runs only on a job the user has a job role on. Admin checks are left
-- unchanged (step 5). A policy already rewritten is skipped.
DO $gates$
DECLARE
  pol record;
  v_new_qual  text;
  v_new_check text;
  v_re  text := $r$rbac\.has_permission\('(Projects|Budget|Schedule|Safety|Documents|RFIs|Submittals|Change Orders|Pay Apps|Reports|Sales)'::text, '(None|View|Edit|Full)'::text\)$r$;
  v_sub text := $s$rbac.has_permission('\1'::text, '\2'::text, project_id)$s$;
  v_job text;
BEGIN
  FOR pol IN
    SELECT p.tablename, p.policyname, p.cmd, p.qual, p.with_check
      FROM pg_policies p
     WHERE p.schemaname = 'public'
       AND p.policyname LIKE 'role\_gate\_%'
       AND EXISTS (SELECT 1 FROM information_schema.columns c
                    WHERE c.table_schema = 'public' AND c.table_name = p.tablename
                      AND c.column_name = 'project_id' AND c.data_type = 'uuid')
     ORDER BY p.tablename, p.policyname
  LOOP
    v_new_qual := NULL;
    v_new_check := NULL;

    IF pol.qual IS NOT NULL AND pol.qual NOT LIKE '%my_override_project_ids%' THEN
      v_job := regexp_replace(pol.qual, v_re, v_sub, 'g');
      IF v_job <> pol.qual THEN
        v_new_qual := format('CASE WHEN project_id IS NOT NULL AND project_id = ANY ((SELECT rbac.my_override_project_ids())::uuid[]) THEN (%s) ELSE (%s) END', v_job, pol.qual);
      END IF;
    END IF;
    IF pol.with_check IS NOT NULL AND pol.with_check NOT LIKE '%my_override_project_ids%' THEN
      v_job := regexp_replace(pol.with_check, v_re, v_sub, 'g');
      IF v_job <> pol.with_check THEN
        v_new_check := format('CASE WHEN project_id IS NOT NULL AND project_id = ANY ((SELECT rbac.my_override_project_ids())::uuid[]) THEN (%s) ELSE (%s) END', v_job, pol.with_check);
      END IF;
    END IF;

    IF v_new_qual IS NOT NULL AND v_new_check IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON public.%I USING (%s) WITH CHECK (%s)', pol.policyname, pol.tablename, v_new_qual, v_new_check);
    ELSIF v_new_qual IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON public.%I USING (%s)', pol.policyname, pol.tablename, v_new_qual);
    ELSIF v_new_check IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON public.%I WITH CHECK (%s)', pol.policyname, pol.tablename, v_new_check);
    END IF;
  END LOOP;
END
$gates$;
