-- Retire public.app_user_role(), the legacy role check.
--
-- Runs after 20261016g, which gave every table that used it a role_gate_*
-- policy (rbac.has_permission, the port of lib/permissions.ts) for the same
-- command, and rewrote the "own row OR admin" policies on crew_locations,
-- geofence_events and presence_sessions.
--
-- The rbac_<ins|upd|del>_<table> policies built on app_user_role() are
-- RESTRICTIVE, so with their role_gate twins in place they can only ever take
-- access away — and only from profiles whose role is one of its "field" or
-- "viewer" words, which bypassed the real role_definitions. Removing them
-- changes nothing for any current user (every stored profiles.role —
-- admin, Owner, member, Salesperson — mapped to 'admin' and passed them), and
-- removes the trap for later.
--
-- Each drop is refused unless its role_gate twin exists. DROP FUNCTION runs
-- without CASCADE, so it fails if anything at all still depends on it.

-- Every rbac_<cmd>_<table> policy that calls app_user_role() goes, but only
-- once its role_gate_<cmd>_<table> twin exists (on the 15 money/admin tables
-- #229 already gated, and on the tables 20261016g gated).
DO $retire$
DECLARE
  p record;
  v_twin text;
BEGIN
  FOR p IN
    SELECT c.relname AS tbl, pol.polname
      FROM pg_policy pol
      JOIN pg_class c ON c.oid = pol.polrelid
     WHERE c.relnamespace = 'public'::regnamespace
       AND (coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')) LIKE '%app_user_role()%'
  LOOP
    IF p.polname !~ '^rbac_(ins|upd|del)_' THEN
      RAISE EXCEPTION 'legacy role check still used by %.% — not an rbac_* policy, rewrite it first', p.tbl, p.polname;
    END IF;
    v_twin := regexp_replace(p.polname, '^rbac_(ins|upd|del)_', 'role_gate_\1_');
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = p.tbl AND policyname = v_twin) THEN
      RAISE EXCEPTION 'no % on % — refusing to remove % without its replacement', v_twin, p.tbl, p.polname;
    END IF;
    EXECUTE format('DROP POLICY %I ON public.%I', p.polname, p.tbl);
  END LOOP;
END
$retire$;

DROP FUNCTION IF EXISTS public.app_user_role();
