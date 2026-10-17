-- The SQL half of tools/rls-permission-parity.ts: what rbac.permission_level_for
-- answers for every real user (no project + each project they hold a scoped
-- grant on), every stored role alone (as a global grant to a synthetic member
-- of its company), and the edge cases. ALWAYS ROLLED BACK — it ends in RAISE,
-- so the synthetic users and grants never commit.
-- Run through the Supabase SQL runner, copy the text after "PARITY" from the
-- error into a file, and pass it to the .ts harness with the fixture
-- (export query at the top of the .ts file).
DO $parity$
DECLARE
  cats text[] := ARRAY['Projects','Budget','Schedule','Safety','Documents','RFIs','Submittals','Change Orders','Pay Apps','Reports','Sales','Admin'];
  SAG uuid := '692d8793-4d9f-4c43-a935-bf56cc637553';
  X uuid := '00000000-0000-4000-8000-0000000000a1';
  Y uuid := '00000000-0000-4000-8000-0000000000a2';
  W uuid := '00000000-0000-4000-8000-0000000000a3';
  Z uuid := '00000000-0000-4000-8000-0000000000a4';
  out text := '';
  r record; pr record; n int := 0; d text; c text;
  rFore uuid; rSub uuid; rSup uuid; rForeign uuid; P uuid; Q uuid; aX uuid;
BEGIN
  FOR r IN SELECT id FROM profiles ORDER BY id LOOP
    FOR pr IN SELECT NULL::uuid AS pid UNION SELECT DISTINCT project_id FROM user_role_assignments WHERE user_id = r.id AND project_id IS NOT NULL LOOP
      d := '';
      FOREACH c IN ARRAY cats LOOP d := d || rbac.permission_level_for(r.id, c, pr.pid)::text; END LOOP;
      out := out || ' u:' || r.id || ':' || coalesce(pr.pid::text, '-') || ':' || d;
    END LOOP;
  END LOOP;
  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) VALUES
    (X, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'parity-x@example.invalid', jsonb_build_object('tenant_id', SAG), now(), now()),
    (Y, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'parity-y@example.invalid', jsonb_build_object('tenant_id', SAG), now(), now()),
    (W, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'parity-w@example.invalid', jsonb_build_object('tenant_id', SAG), now(), now()),
    (Z, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'parity-z@example.invalid', jsonb_build_object('tenant_id', SAG), now(), now());
  UPDATE profiles SET role = 'member', tenant_id = SAG WHERE id IN (X, Y, W, Z);
  INSERT INTO user_role_assignments (user_id, tenant_id, role_id) SELECT X, SAG, id FROM role_definitions ORDER BY id LIMIT 1 RETURNING id INTO aX;
  FOR r IN SELECT id, tenant_id FROM role_definitions ORDER BY id LOOP
    n := n + 1;
    UPDATE profiles SET tenant_id = r.tenant_id WHERE id = X;
    UPDATE user_role_assignments SET tenant_id = r.tenant_id, role_id = r.id WHERE id = aX;
    d := '';
    FOREACH c IN ARRAY cats LOOP d := d || rbac.permission_level_for(X, c, NULL)::text; END LOOP;
    out := out || ' r' || n || ':' || d;
  END LOOP;
  SELECT id INTO rFore FROM role_definitions WHERE tenant_id = SAG AND name = 'Foreman' AND is_builtin LIMIT 1;
  SELECT id INTO rSub FROM role_definitions WHERE tenant_id = SAG AND name = 'Subcontractor' AND is_builtin LIMIT 1;
  SELECT id INTO rSup FROM role_definitions WHERE tenant_id = SAG AND name = 'Superintendent' AND is_builtin LIMIT 1;
  SELECT id INTO rForeign FROM role_definitions WHERE tenant_id <> SAG ORDER BY id LIMIT 1;
  SELECT id INTO P FROM projects WHERE tenant_id = SAG ORDER BY created_at LIMIT 1;
  SELECT id INTO Q FROM projects WHERE tenant_id = SAG ORDER BY created_at OFFSET 1 LIMIT 1;
  INSERT INTO user_role_assignments (user_id, tenant_id, role_id) VALUES (Y, SAG, rFore), (Y, SAG, rSub), (W, SAG, rForeign);
  INSERT INTO user_role_assignments (user_id, tenant_id, role_id, project_id) VALUES (Z, SAG, rSup, P);
  d := ''; FOREACH c IN ARRAY cats LOOP d := d || rbac.permission_level_for(Y, c, NULL)::text; END LOOP; out := out || ' multi:' || d;
  d := ''; FOREACH c IN ARRAY cats LOOP d := d || rbac.permission_level_for(W, c, NULL)::text; END LOOP; out := out || ' foreign:' || d;
  d := ''; FOREACH c IN ARRAY cats LOOP d := d || rbac.permission_level_for(Z, c, NULL)::text; END LOOP; out := out || ' proj-none:' || d;
  d := ''; FOREACH c IN ARRAY cats LOOP d := d || rbac.permission_level_for(Z, c, P)::text; END LOOP; out := out || ' proj-P:' || d;
  d := ''; FOREACH c IN ARRAY cats LOOP d := d || rbac.permission_level_for(Z, c, Q)::text; END LOOP; out := out || ' proj-Q:' || d;
  out := out || ' meta:' || rFore || ',' || rSub || ',' || rSup || ',' || rForeign || ',' || P || ',' || Q;
  RAISE EXCEPTION 'PARITY%', out;
END $parity$;
