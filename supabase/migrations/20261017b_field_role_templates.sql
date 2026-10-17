-- Foremen and superintendents can file daily logs, punch items and site photos.
--
-- The built-in Foreman and Superintendent role templates were stored with
-- Projects: View, and writing a daily log or a punch item is Projects: Edit
-- (/api/daily-logs/create, /api/punch-list/create, role_gate_ins_daily_logs,
-- role_gate_ins_punch_list_items). A Foreman also had Documents: View, and a
-- site photo is Documents: Edit (/api/photos/*, role_gate_ins_photos). The two
-- roles named for daily field reporting could not do it. lib/default-roles and
-- the presets in components/team/AccessManager now seed Projects: Edit (and
-- Documents: Edit for Foreman); this brings every tenant's stored copy along.
--
-- Only the BUILT-IN templates (is_builtin) of those two names, and only
-- upward: a company that already raised a level keeps it, and custom roles
-- are untouched.
--
-- Sales inherits Projects when a stored role has no Sales key
-- (INHERITS_WHEN_ABSENT in lib/permission-categories, mirrored in
-- rbac.permission_level_for). The older template rows (3 tenants) have no Sales
-- key, so raising Projects would have raised Sales with it — and Sales is what
-- opens proposal and bid dollars (20261017c). Write the template's own answer,
-- Sales: None (lib/default-roles), before Projects moves. No user holds either
-- role today (user_role_assignments: 0 rows for both).
UPDATE public.role_definitions
   SET permissions = permissions || '{"Sales": "None"}'::jsonb
 WHERE is_builtin
   AND name IN ('Foreman', 'Superintendent')
   AND NOT (permissions ? 'Sales');

UPDATE public.role_definitions
   SET permissions = permissions || '{"Projects": "Edit"}'::jsonb
 WHERE is_builtin
   AND name IN ('Foreman', 'Superintendent')
   AND coalesce(permissions ->> 'Projects', 'None') IN ('None', 'View');

UPDATE public.role_definitions
   SET permissions = permissions || '{"Documents": "Edit"}'::jsonb
 WHERE is_builtin
   AND name = 'Foreman'
   AND coalesce(permissions ->> 'Documents', 'None') IN ('None', 'View');
