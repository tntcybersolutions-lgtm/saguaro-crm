-- The SQL half of tools/rls-permission-parity.ts: what rbac.permission_level_for
-- answers for every real user (no project + each project they hold a scoped
-- grant on), every stored role alone (as a global grant to a synthetic member
-- of its company), and the edge cases. ALWAYS ROLLED BACK — it ends in RAISE,
-- so the synthetic users and grants never commit.
-- Run through the Supabase SQL runner, copy the text after "PARITY" from the
-- error into a file, and pass it to the .ts harness with the fixture
-- (export query at the top of the .ts file). To prove a migration before it is
-- applied, send the migration and this file in ONE call: the RAISE rolls both
-- back.
--
-- Job roles (20261017h): synthetic members J1..J9 in Saguaro, each with a
-- company role and a row on job P, asked about with no job, P and Q. Tokens:
--   j<n>:<->|P|Q:<12 digits>   meta2:<readOnly>,<pm>,<foreman>,<super>,<adminRole>

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
  rRO uuid; rPM uuid; rAdm uuid; ju uuid[]; jn int;
  noAccess jsonb := '{"Projects":"None","Budget":"None","Schedule":"None","Safety":"None","Documents":"None","RFIs":"None","Submittals":"None","Change Orders":"None","Pay Apps":"None","Reports":"None","Sales":"None","Admin":"None"}';
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
  -- Job roles.
  SELECT id INTO rRO FROM role_definitions WHERE tenant_id = SAG AND name = 'Read-Only' AND is_builtin LIMIT 1;
  SELECT id INTO rPM FROM role_definitions WHERE tenant_id = SAG AND name = 'Project Manager' AND is_builtin LIMIT 1;
  SELECT id INTO rAdm FROM role_definitions WHERE tenant_id = SAG AND permissions ->> 'Admin' = 'Full' ORDER BY id LIMIT 1;
  ju := ARRAY(SELECT ('00000000-0000-4000-8000-0000000000b' || g.i)::uuid FROM generate_series(1, 9) AS g(i) ORDER BY g.i);
  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    SELECT u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'parity-' || right(u::text, 2) || '@example.invalid', jsonb_build_object('tenant_id', SAG), now(), now()
      FROM unnest(ju) u;
  UPDATE profiles SET role = 'member', tenant_id = SAG WHERE id = ANY (ju);
  UPDATE profiles SET role = 'admin' WHERE id = ju[9];
  INSERT INTO user_role_assignments (user_id, tenant_id, role_id, project_id, permissions) VALUES
    (ju[1], SAG, rRO,   NULL, NULL), (ju[1], SAG, rPM,  P, NULL),                                   -- raised on a job
    (ju[2], SAG, rPM,   NULL, NULL), (ju[2], SAG, NULL, P, noAccess),                               -- no access on a job
    (ju[3], SAG, rFore, NULL, NULL), (ju[3], SAG, rSup, P, '{"Budget":"Full","Sales":"None"}'),     -- job role + levels
    (ju[4], SAG, rFore, NULL, NULL), (ju[4], SAG, NULL, P, '{"Budget":"Edit","RFIs":"bogus"}'),     -- company role + levels
    (ju[5], SAG, rAdm,  NULL, NULL), (ju[5], SAG, rRO,  P, NULL),                                   -- company admin, Read-Only job
    (ju[6], SAG, NULL,  P, '{"Admin":"Full","Projects":"Edit"}'),                                   -- no company role, levels only
    (ju[7], SAG, rForeign, P, NULL),                                                                -- another company's role
    (ju[8], SAG, NULL,  P, noAccess),                                                               -- member, no access
    (ju[9], SAG, NULL,  P, noAccess);                                                               -- admin profile, no access
  FOR jn IN 1..9 LOOP
    FOR pr IN SELECT * FROM (VALUES ('-', NULL::uuid), ('P', P), ('Q', Q)) v(tag, pid) LOOP
      d := '';
      FOREACH c IN ARRAY cats LOOP d := d || rbac.permission_level_for(ju[jn], c, pr.pid)::text; END LOOP;
      out := out || ' j' || jn || ':' || pr.tag || ':' || d;
    END LOOP;
  END LOOP;
  out := out || ' meta2:' || rRO || ',' || rPM || ',' || rFore || ',' || rSup || ',' || rAdm;
  out := out || ' meta:' || rFore || ',' || rSub || ',' || rSup || ',' || rForeign || ',' || P || ',' || Q;
  RAISE EXCEPTION 'PARITY%', out;
END $parity$;
