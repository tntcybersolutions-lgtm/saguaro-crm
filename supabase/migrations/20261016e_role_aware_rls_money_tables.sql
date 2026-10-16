-- Role-aware RLS on money, HR and admin tables.
--
-- Until now every policy on these tables asked one question: "is this row in
-- your company?" A signed-in Salesperson could open the browser console, call
-- the Supabase REST API with their own token and read every employee's pay
-- rate. The API routes check the role (lib/permissions.ts); the database did
-- not, and the browser talks to the database directly.
--
-- This migration keeps every existing policy exactly as it is (the tenant
-- checks stay) and ADDS a RESTRICTIVE policy per command. Restrictive policies
-- are ANDed with the permissive ones, so a row now needs both: your company AND
-- your role allows it. Service-role policies are untouched, and the service
-- role bypasses RLS anyway, so every server route behaves exactly as before.
--
-- The role check is rbac.has_permission(), a line-for-line port of
-- getEffectivePermissions() + hasPermission() in lib/permissions.ts:
--   * profiles.role 'admin' / 'owner' (any case)  => Full on everything
--   * otherwise the user's role_definitions via user_role_assignments, global
--     grants always, project-scoped grants only when that project is asked
--     about; highest level wins per category; Sales inherits Projects when a
--     stored role never mentions Sales
--   * no applicable assignment => View on every category except Admin (None)
-- tools/rls-permission-parity.ts proves the two agree for every real user and
-- every stored role in the live database.
--
-- The helpers live in schema `rbac`, which PostgREST does not expose, so they
-- are callable from policies but not as /rest/v1/rpc endpoints.
--
-- SAFE FOR THE CODE IN PRODUCTION TODAY. Hiding pay COLUMNS from the browser
-- (employees.regular_rate and friends) would break pages that still select
-- them, so that half is in 20261016f_employees_private_columns.sql and is
-- applied only after the code that reads pay through the server is live.

CREATE SCHEMA IF NOT EXISTS rbac;
REVOKE ALL ON SCHEMA rbac FROM PUBLIC;
GRANT USAGE ON SCHEMA rbac TO authenticated, service_role;

-- Level for one user, one category, optionally one project. Mirrors
-- getEffectivePermissions(db, userId, tenantId, projectId)[category].
CREATE OR REPLACE FUNCTION rbac.permission_level_for(p_user uuid, p_category text, p_project_id uuid DEFAULT NULL)
RETURNS int
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_role     text;
  v_tenant   uuid;
  v_role_ids uuid[];
  v_perms    jsonb;
  v_raw      jsonb;
  v_inherit  text;
  v_level    int := 0;
  v_rank     int;
BEGIN
  IF p_user IS NULL THEN
    RETURN 0;
  END IF;
  IF p_category NOT IN ('Projects','Budget','Schedule','Safety','Documents','RFIs',
                        'Submittals','Change Orders','Pay Apps','Reports','Sales','Admin') THEN
    RAISE EXCEPTION 'rbac: unknown permission category %', p_category;
  END IF;

  -- 1) Base role bypass. TS: (profile?.role || '').toLowerCase() in {admin, owner}.
  SELECT lower(coalesce(p.role, '')), p.tenant_id INTO v_role, v_tenant
    FROM profiles p WHERE p.id = p_user;
  IF v_role IN ('admin', 'owner') THEN
    RETURN 3;
  END IF;
  -- TS getTenant(): profiles.tenant_id, falling back to the user id.
  v_tenant := coalesce(v_tenant, p_user);

  -- 2) Applicable assignments: global always, project-scoped only for that project.
  SELECT array_agg(DISTINCT a.role_id) INTO v_role_ids
    FROM user_role_assignments a
   WHERE a.user_id = p_user
     AND a.tenant_id = v_tenant
     AND a.role_id IS NOT NULL
     AND (a.project_id IS NULL OR (p_project_id IS NOT NULL AND a.project_id = p_project_id));

  -- 3) None applicable => memberDefault(): View everywhere, None on Admin.
  IF v_role_ids IS NULL OR cardinality(v_role_ids) = 0 THEN
    RETURN CASE WHEN p_category = 'Admin' THEN 0 ELSE 1 END;
  END IF;

  -- 4) Highest level wins across every applicable role in this tenant.
  v_inherit := CASE p_category WHEN 'Sales' THEN 'Projects' ELSE NULL END;
  FOR v_perms IN
    SELECT coalesce(rd.permissions, '{}'::jsonb)
      FROM role_definitions rd
     WHERE rd.tenant_id = v_tenant AND rd.id = ANY (v_role_ids)
  LOOP
    IF jsonb_typeof(v_perms) <> 'object' THEN
      v_raw := NULL;
    ELSIF v_inherit IS NOT NULL AND NOT (v_perms ? p_category) THEN
      v_raw := v_perms -> v_inherit;
    ELSE
      v_raw := v_perms -> p_category;
    END IF;
    -- normalizeLevel(): only the exact strings count; anything else is None.
    v_rank := CASE WHEN v_raw IS NOT NULL AND jsonb_typeof(v_raw) = 'string' THEN
                CASE v_raw #>> '{}' WHEN 'Full' THEN 3 WHEN 'Edit' THEN 2 WHEN 'View' THEN 1 ELSE 0 END
              ELSE 0 END;
    IF v_rank > v_level THEN
      v_level := v_rank;
    END IF;
  END LOOP;
  RETURN v_level;
END;
$fn$;

-- hasPermission(perms, category, minLevel) for the signed-in user.
CREATE OR REPLACE FUNCTION rbac.has_permission(p_category text, p_min_level text DEFAULT 'View', p_project_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_need int := CASE p_min_level WHEN 'None' THEN 0 WHEN 'View' THEN 1 WHEN 'Edit' THEN 2 WHEN 'Full' THEN 3 END;
BEGIN
  IF v_need IS NULL THEN
    RAISE EXCEPTION 'rbac: unknown permission level %', p_min_level;
  END IF;
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  RETURN rbac.permission_level_for(auth.uid(), p_category, p_project_id) >= v_need;
END;
$fn$;

-- The employees rows that ARE the signed-in user, matched the way
-- lib/timeclock/server.ts resolves a person to their employee record (by
-- email, then by a full_name that holds the email). Used so a crew member can
-- keep reading and writing their own hours without being able to read anyone
-- else's pay.
CREATE OR REPLACE FUNCTION rbac.my_employee_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT e.id
    FROM employees e
   WHERE auth.uid() IS NOT NULL
     AND e.tenant_id = get_tenant_id()
     AND coalesce(auth.jwt() ->> 'email', '') <> ''
     AND (lower(e.email) = lower(auth.jwt() ->> 'email') OR e.full_name = auth.jwt() ->> 'email');
$fn$;

REVOKE ALL ON FUNCTION rbac.permission_level_for(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rbac.permission_level_for(uuid, text, uuid) TO service_role;
REVOKE ALL ON FUNCTION rbac.has_permission(text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rbac.has_permission(text, text, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION rbac.my_employee_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rbac.my_employee_ids() TO authenticated, service_role;

-- ── The gates ────────────────────────────────────────────────────────────────
-- Levels follow the API routes that guard the same data (PR #226):
--   pay apps / SOV ................ Pay Apps       View / Edit / Full(delete)
--   invoices, budgets, bills, commitments, POs, contracts, cost, cash flow,
--   lien waivers, bonds .......... Budget         View / Edit / Full(delete)
--   change orders / events ........ Change Orders  View / Edit / Full(delete)
--   payroll, timesheet pay, leave, incidents, worker rates
--                                   Admin          View / Edit / Full(delete)
--     (HR: there is no HR category. Admin is the stricter choice — a Project
--      Manager has Admin: View; Superintendent, Salesperson, Foreman and
--      Subcontractor have None.)
--   billing / subscriptions ....... Admin          View / Full
--   API keys, webhooks, QBO tokens  Admin          Full on everything
--   audit log ..................... Admin          View read; Full change; inserts
--                                                  untouched (history is written by
--                                                  SECURITY DEFINER triggers)
--   role definitions .............. Admin          Full to change; names stay readable
--   time entries / timesheets ..... your OWN rows, or Admin (see below)
--   employees ..................... rows stay readable (the crew roster); changing
--                                   anyone needs Admin: Edit, except the time clock
--                                   creating your own first record
--
-- Created only when absent, so re-running this file is a no-op.
DO $gates$
DECLARE
  g record;
  v_cmd text;
  v_expr text;
  v_name text;
BEGIN
  FOR g IN
    SELECT * FROM (VALUES
      -- table,                         category,        sel,    ins,    upd,    del
      ('pay_applications',              'Pay Apps',      'View', 'Edit', 'Edit', 'Full'),
      ('pay_application_lines',         'Pay Apps',      'View', 'Edit', 'Edit', 'Full'),
      ('pay_app_line_items',            'Pay Apps',      'View', 'Edit', 'Edit', 'Full'),
      ('owner_pay_applications',        'Pay Apps',      'View', 'Edit', 'Edit', 'Full'),
      ('owner_pay_app_line_items',      'Pay Apps',      'View', 'Edit', 'Edit', 'Full'),
      ('schedule_of_values',            'Pay Apps',      'View', 'Edit', 'Edit', 'Full'),
      ('sov_line_items',                'Pay Apps',      'View', 'Edit', 'Edit', 'Full'),
      ('prime_contract_sov',            'Pay Apps',      'View', 'Edit', 'Edit', 'Full'),
      ('portal_sub_pay_apps',           'Pay Apps',      'View', 'Edit', 'Edit', 'Full'),
      ('portal_sub_pay_app_line_items', 'Pay Apps',      'View', 'Edit', 'Edit', 'Full'),
      ('invoices',                      'Budget',        'View', 'Edit', 'Edit', 'Full'),
      ('invoice_line_items',            'Budget',        'View', 'Edit', 'Edit', 'Full'),
      ('bills',                         'Budget',        'View', 'Edit', 'Edit', 'Full'),
      ('budgets',                       'Budget',        'View', 'Edit', 'Edit', 'Full'),
      ('budget_lines',                  'Budget',        'View', 'Edit', 'Edit', 'Full'),
      ('budget_line_items',             'Budget',        'View', 'Edit', 'Edit', 'Full'),
      ('budget_snapshots',              'Budget',        'View', 'Edit', 'Edit', 'Full'),
      ('commitments',                   'Budget',        'View', 'Edit', 'Edit', 'Full'),
      ('purchase_orders',               'Budget',        'View', 'Edit', 'Edit', 'Full'),
      ('contracts',                     'Budget',        'View', 'Edit', 'Edit', 'Full'),
      ('prime_contracts',               'Budget',        'View', 'Edit', 'Edit', 'Full'),
      ('cost_entries',                  'Budget',        'View', 'Edit', 'Edit', 'Full'),
      ('cost_reports',                  'Budget',        'View', 'Edit', 'Edit', 'Full'),
      ('cost_rates',                    'Budget',        'View', 'Edit', 'Edit', 'Full'),
      ('cash_flow_projections',         'Budget',        'View', 'Edit', 'Edit', 'Full'),
      ('cash_flow_line_items',          'Budget',        'View', 'Edit', 'Edit', 'Full'),
      ('lien_waivers',                  'Budget',        'View', 'Edit', 'Edit', 'Full'),
      ('portal_payments',               'Budget',        'View', 'Edit', 'Edit', 'Full'),
      ('bonds',                         'Budget',        'View', 'Edit', 'Edit', 'Full'),
      ('change_orders',                 'Change Orders', 'View', 'Edit', 'Edit', 'Full'),
      ('change_order_line_items',       'Change Orders', 'View', 'Edit', 'Edit', 'Full'),
      ('change_events',                 'Change Orders', 'View', 'Edit', 'Edit', 'Full'),
      ('payroll_periods',               'Admin',         'View', 'Edit', 'Edit', 'Full'),
      ('payroll_records',               'Admin',         'View', 'Edit', 'Edit', 'Full'),
      ('certified_payroll',             'Admin',         'View', 'Edit', 'Edit', 'Full'),
      ('timesheet_entries',             'Admin',         'View', 'Edit', 'Edit', 'Full'),
      ('leave_balances',                'Admin',         'View', 'Edit', 'Edit', 'Full'),
      ('employee_incidents',            'Admin',         'View', 'Edit', 'Edit', 'Full'),
      ('workers',                       'Admin',         'View', 'Edit', 'Edit', 'Full'),
      ('subscriptions',                 'Admin',         'View', 'Full', 'Full', 'Full'),
      ('subscription_invoices',         'Admin',         'View', 'Full', 'Full', 'Full'),
      ('addon_purchases',               'Admin',         'View', 'Full', 'Full', 'Full'),
      ('billing_receipts',              'Admin',         'View', 'Full', 'Full', 'Full'),
      ('api_keys',                      'Admin',         'Full', 'Full', 'Full', 'Full'),
      ('webhook_endpoints',             'Admin',         'Full', 'Full', 'Full', 'Full'),
      ('qbo_connections',               'Admin',         'Full', 'Full', 'Full', 'Full'),
      ('audit_logs',                    'Admin',         'View', NULL,   'Full', 'Full'),
      ('role_definitions',              'Admin',         NULL,   'Full', 'Full', 'Full'),
      ('employees',                     'Admin',         NULL,   'Edit', 'Edit', 'Full'),
      ('time_entries',                  'Admin',         'View', 'Edit', 'Edit', 'Full'),
      ('timesheets',                    'Admin',         'View', 'Edit', 'Edit', 'Full')
    ) AS v(tbl, cat, sel, ins, upd, del)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.relname = g.tbl AND c.relnamespace = 'public'::regnamespace AND c.relkind = 'r') THEN
      RAISE NOTICE 'rbac gate: table % not found, skipped', g.tbl;
      CONTINUE;
    END IF;

    FOREACH v_cmd IN ARRAY ARRAY['sel', 'ins', 'upd', 'del'] LOOP
      v_expr := format('(SELECT rbac.has_permission(%L, %L))', g.cat,
                       CASE v_cmd WHEN 'sel' THEN g.sel WHEN 'ins' THEN g.ins WHEN 'upd' THEN g.upd ELSE g.del END);
      CONTINUE WHEN (CASE v_cmd WHEN 'sel' THEN g.sel WHEN 'ins' THEN g.ins WHEN 'upd' THEN g.upd ELSE g.del END) IS NULL;

      -- Own-row exceptions. A crew member clocks in, edits and deletes their
      -- OWN hours and submits their OWN week from the browser (app/app/time).
      -- Everyone else's hours carry rates and labor cost.
      IF g.tbl = 'time_entries' THEN
        v_expr := v_expr || ' OR employee_id IN (SELECT rbac.my_employee_ids())';
      ELSIF g.tbl = 'timesheets' AND v_cmd IN ('sel', 'ins') THEN
        v_expr := v_expr || ' OR employee_id IN (SELECT rbac.my_employee_ids())'
                         || CASE WHEN v_cmd = 'sel' THEN ' OR created_by = auth.uid()' ELSE '' END;
      ELSIF g.tbl = 'employees' AND v_cmd = 'ins' THEN
        -- The time clock creates a person's own first employee record.
        v_expr := v_expr || $e$ OR (coalesce(auth.jwt() ->> 'email', '') <> '' AND lower(email) = lower(auth.jwt() ->> 'email'))$e$;
      END IF;

      v_name := 'role_gate_' || v_cmd || '_' || g.tbl;
      CONTINUE WHEN EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = g.tbl AND policyname = v_name);

      EXECUTE CASE v_cmd
        WHEN 'sel' THEN format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (%s)', v_name, g.tbl, v_expr)
        WHEN 'ins' THEN format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (%s)', v_name, g.tbl, v_expr)
        WHEN 'upd' THEN format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', v_name, g.tbl, v_expr, v_expr)
        ELSE            format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (%s)', v_name, g.tbl, v_expr)
      END;
    END LOOP;
  END LOOP;
END
$gates$;
