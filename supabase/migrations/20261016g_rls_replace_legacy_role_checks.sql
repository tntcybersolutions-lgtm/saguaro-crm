-- Replace the legacy role check (public.app_user_role) with the real one.
--
-- app_user_role() sorted profiles.role into three buckets: a short list of
-- "viewer" words, a short list of "field" words, and EVERYTHING ELSE = 'admin'.
-- The roles the app actually stores are 'admin', 'Owner', 'member' and
-- 'Salesperson' — so every signed-in user, a Salesperson or a bare member
-- included, passed every "admin only" policy built on it (delete any daily
-- log, RFI or photo; rewrite integrations, tenant settings, custom fields,
-- approval workflows; read and move every crew member's GPS trail).
--
-- This file:
--   1. adds RESTRICTIVE role_gate_* policies, the same shape #229 used on the
--      money tables, to every table that still leaned on app_user_role, and to
--      resource_assignments, proposals, proposal_lines, bids, bid_submissions
--      and bid_packages (tenant-only until now). Each gate asks
--      rbac.has_permission(category, level) — the line-for-line port of
--      lib/permissions.ts getEffectivePermissions + hasPermission. Unknown
--      roles get memberDefault (View everywhere, None on Admin), never admin.
--   2. rewrites the "own row OR admin" policies on crew_locations,
--      geofence_events and presence_sessions to "own row OR the category".
--   3. the legacy rbac_* policies and app_user_role() itself are removed by
--      20261016i_retire_app_user_role.sql, which runs after this file.
--
-- Tenant policies and service_role policies are not touched. The service role
-- bypasses RLS, and every server route uses it, so the API behaves exactly as
-- before. No browser code reads or writes any table in this file (checked:
-- every getSupabaseBrowser / sb.from in app/, components/, lib/ — the browser
-- touches employees, time_entries, timesheets, projects, project_team,
-- employee_project_assignments, employee_incidents, change_events, fleet_*,
-- profiles), so this is SAFE FOR THE CODE IN PRODUCTION TODAY.
--
-- Category and levels per table follow the API routes that guard the same data
-- (requirePermission calls in app/api), View to read, Edit to add or change,
-- Full to delete:
--   daily_logs, deliveries ......... Projects   (daily-logs/create Edit, [id] DELETE Full)
--   field_issues, punch_list_items,
--   voice_memos .................... Projects   (radio/promote categoryFor, items registry punch_list)
--   drawing_sheets ................. Projects   (drawings/review-link)
--   rfis ........................... RFIs       (rfis/create Edit, rfis/[id] DELETE Full)
--   safety_incidents ............... Safety     (safety/incidents Edit / Full)
--   photos, project_files .......... Documents  (photos/create, files/upload Edit; [id] DELETE Full)
--   approval_workflows ............. Documents  (approvals/workflows Edit, [id] DELETE Full)
--   integrations ................... Admin Full on everything, reads included — it holds
--                                    OAuth access/refresh tokens (integrations/* routes)
--   tenant_settings ................ Admin      View to read (EIN, license), Full to change
--   custom_field_definitions ....... Admin Full to change (custom-fields POST); reads stay
--                                    tenant-wide (GET has no role check — every screen
--                                    that shows a record renders its custom fields)
--   entity_comments ................ the category of the item the comment is on
--                                    (lib/items/registry.ts perm): View to read, write
--                                    and edit (items/[tool]/[id]/comments uses View for
--                                    all three), Full to hard-delete
--   resource_assignments ........... Projects   (projects/[projectId]/resource-planning Edit,
--                                    [id] DELETE Full). Rates: see 20261016h.
--   proposals, proposal_lines ...... Documents  (proposals/create + upload Edit,
--                                    projects/[projectId]/proposals View)
--   bid_packages, bid_submissions,
--   bids ........................... Projects   (bid-packages/* Edit, award + DELETE Full)
--   crew_locations, geofence_events  own rows always; anyone else's: Schedule View / Edit /
--                                    Full (resource-planning check-in/out/status = Schedule Edit)
--   presence_sessions .............. own rows always; anyone else's: Projects View to see
--                                    who is on a record; Admin Full to change or remove

DO $gates$
DECLARE
  g record;
  v_cmd text;
  v_lvl text;
  v_expr text;
  v_name text;
BEGIN
  FOR g IN
    SELECT * FROM (VALUES
      -- table,                     category,     sel,    ins,    upd,    del
      ('daily_logs',               'Projects',   'View', 'Edit', 'Edit', 'Full'),
      ('deliveries',               'Projects',   'View', 'Edit', 'Edit', 'Full'),
      ('field_issues',             'Projects',   'View', 'Edit', 'Edit', 'Full'),
      ('punch_list_items',         'Projects',   'View', 'Edit', 'Edit', 'Full'),
      ('voice_memos',              'Projects',   'View', 'Edit', 'Edit', 'Full'),
      ('drawing_sheets',           'Projects',   'View', 'Edit', 'Edit', 'Full'),
      ('rfis',                     'RFIs',       'View', 'Edit', 'Edit', 'Full'),
      ('safety_incidents',         'Safety',     'View', 'Edit', 'Edit', 'Full'),
      ('photos',                   'Documents',  'View', 'Edit', 'Edit', 'Full'),
      ('project_files',            'Documents',  'View', 'Edit', 'Edit', 'Full'),
      ('approval_workflows',       'Documents',  'View', 'Edit', 'Edit', 'Full'),
      ('integrations',             'Admin',      'Full', 'Full', 'Full', 'Full'),
      ('tenant_settings',          'Admin',      'View', 'Full', 'Full', 'Full'),
      ('custom_field_definitions', 'Admin',      NULL,   'Full', 'Full', 'Full'),
      ('entity_comments',          '*item*',     'View', 'View', 'View', 'Full'),
      ('resource_assignments',     'Projects',   'View', 'Edit', 'Edit', 'Full'),
      ('proposals',                'Documents',  'View', 'Edit', 'Edit', 'Full'),
      ('proposal_lines',           'Documents',  'View', 'Edit', 'Edit', 'Full'),
      ('bid_packages',             'Projects',   'View', 'Edit', 'Edit', 'Full'),
      ('bid_submissions',          'Projects',   'View', 'Edit', 'Edit', 'Full'),
      ('bids',                     'Projects',   'View', 'Edit', 'Edit', 'Full')
    ) AS v(tbl, cat, sel, ins, upd, del)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.relname = g.tbl AND c.relnamespace = 'public'::regnamespace AND c.relkind = 'r') THEN
      RAISE NOTICE 'rbac gate: table % not found, skipped', g.tbl;
      CONTINUE;
    END IF;

    FOREACH v_cmd IN ARRAY ARRAY['sel', 'ins', 'upd', 'del'] LOOP
      v_lvl := CASE v_cmd WHEN 'sel' THEN g.sel WHEN 'ins' THEN g.ins WHEN 'upd' THEN g.upd ELSE g.del END;
      CONTINUE WHEN v_lvl IS NULL;

      IF g.cat = '*item*' THEN
        -- One subquery per category so each is evaluated once per statement
        -- (an InitPlan), not once per row. Mirrors lib/items/registry.ts:
        -- rfis→RFIs, submittals→Submittals, punch_list/daily_logs→Projects,
        -- change_orders→Change Orders, inspections→Safety,
        -- contracts/purchase_orders→Budget; anything else → Projects.
        v_expr := format($e$(
          (entity_type = 'rfis' AND (SELECT rbac.has_permission('RFIs', %1$L)))
          OR (entity_type = 'submittals' AND (SELECT rbac.has_permission('Submittals', %1$L)))
          OR (entity_type = 'change_orders' AND (SELECT rbac.has_permission('Change Orders', %1$L)))
          OR (entity_type = 'inspections' AND (SELECT rbac.has_permission('Safety', %1$L)))
          OR (entity_type IN ('contracts', 'purchase_orders') AND (SELECT rbac.has_permission('Budget', %1$L)))
          OR (entity_type IS DISTINCT FROM 'rfis' AND entity_type IS DISTINCT FROM 'submittals'
              AND entity_type IS DISTINCT FROM 'change_orders' AND entity_type IS DISTINCT FROM 'inspections'
              AND entity_type IS DISTINCT FROM 'contracts' AND entity_type IS DISTINCT FROM 'purchase_orders'
              AND (SELECT rbac.has_permission('Projects', %1$L)))
        )$e$, v_lvl);
      ELSE
        v_expr := format('(SELECT rbac.has_permission(%L, %L))', g.cat, v_lvl);
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

-- ── own row OR the category ────────────────────────────────────────────────
-- Same names, same roles, same tenant check; only the "admin" half changes.
DO $own$
DECLARE
  t text;
  v_sel text; v_upd text; v_del text;
  v_suffix text;
BEGIN
  FOREACH t IN ARRAY ARRAY['crew_locations', 'geofence_events', 'presence_sessions'] LOOP
    IF t = 'presence_sessions' THEN
      v_suffix := '3';
      v_sel := $x$(SELECT rbac.has_permission('Projects', 'View'))$x$;
      v_upd := $x$(SELECT rbac.has_permission('Admin', 'Full'))$x$;
      v_del := $x$(SELECT rbac.has_permission('Admin', 'Full'))$x$;
    ELSE
      v_suffix := '';
      v_sel := $x$(SELECT rbac.has_permission('Schedule', 'View'))$x$;
      v_upd := $x$(SELECT rbac.has_permission('Schedule', 'Edit'))$x$;
      v_del := $x$(SELECT rbac.has_permission('Schedule', 'Full'))$x$;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_sel' || v_suffix) THEN
      EXECUTE format('ALTER POLICY %I ON public.%I USING ((tenant_id = get_tenant_id()) AND ((user_id = auth.uid()) OR %s))', t || '_sel' || v_suffix, t, v_sel);
      EXECUTE format('ALTER POLICY %I ON public.%I USING ((tenant_id = get_tenant_id()) AND ((user_id = auth.uid()) OR %s))', t || '_upd' || v_suffix, t, v_upd);
      EXECUTE format('ALTER POLICY %I ON public.%I USING ((tenant_id = get_tenant_id()) AND ((user_id = auth.uid()) OR %s))', t || '_del' || v_suffix, t, v_del);
    END IF;
  END LOOP;
END
$own$;
