#!/usr/bin/env node
/**
 * Builds the SQL for the role-aware RLS proof matrix.
 *
 *   node tools/rls-proof-matrix.mjs [--with-migration <file.sql>]... > proof.sql
 *
 * The output is ONE script that is always rolled back: it ends by raising an
 * exception whose message is the JSON matrix, so nothing it does is ever
 * committed — not the synthetic users it creates, not the probe writes, and
 * not the migrations it optionally applies in the middle. Run it through the
 * Supabase SQL runner (MCP execute_sql) and read the JSON from the error.
 *
 * Phases:
 *   before — the policies live in the database right now
 *   after  — the same probes after each --with-migration file is applied
 *            inside the same (rolled-back) transaction
 *
 * Real users are only READ as; nobody's real role or data is changed:
 *   owner    Chad — profiles.role admin, Saguaro Control Systems
 *   admin    Rob  — profiles.role admin, Copper State
 *   admin2   Avery — profiles.role admin, Saguaro (also has a project-scoped PM grant)
 *   sales    Ben  — Salesperson (Budget / Pay Apps / CO: View, Admin: None), Copper State
 *   member   App Store Review — member, only a project-scoped grant → memberDefault
 * Synthetic users, created inside the transaction in Saguaro (where the money
 * data is) and assigned that tenant's OWN stored role:
 *   s_pm, s_super, s_sales, s_foreman, s_sub
 */
import fs from 'node:fs';

const args = process.argv.slice(2);
const migrations = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--with-migration') migrations.push(args[++i]);
}

const SAGUARO = '692d8793-4d9f-4c43-a935-bf56cc637553';

const REAL = [
  { key: 'owner', uid: '692d8793-4d9f-4c43-a935-bf56cc637553', email: 'chad@tntcyber.com' },
  { key: 'admin', uid: '9869d972-9357-43f3-bde5-b3cb1a8a0a64', email: 'rob@copperstatedevelopments.com' },
  { key: 'admin2', uid: '7195f2b5-28c2-465e-83a5-e83944fa1a48', email: 'avery@tntcyber.com' },
  { key: 'sales', uid: 'f906eef2-4dd2-498c-a9c3-9c03edc700f5', email: 'ben@copperstatedevelopments.com' },
  { key: 'member', uid: '80ec3479-ca4a-4464-9dbe-adf261afc1f1', email: 'applereview@saguarocontrol.net' },
];
const SYNTH = [
  { key: 's_pm', n: 1, role: 'Project Manager' },
  { key: 's_super', n: 2, role: 'Superintendent' },
  { key: 's_sales', n: 3, role: 'Salesperson' },
  { key: 's_foreman', n: 4, role: 'Foreman' },
  { key: 's_sub', n: 5, role: 'Subcontractor' },
].map((s) => ({ ...s, uid: `00000000-0000-4000-8000-0000000000${String(s.n).padStart(2, '0')}`, email: `rls-proof-${s.key}@example.invalid` }));

export const TABLES = [
  'pay_applications', 'pay_application_lines', 'pay_app_line_items', 'owner_pay_applications',
  'owner_pay_app_line_items', 'schedule_of_values', 'sov_line_items', 'prime_contract_sov',
  'portal_sub_pay_apps', 'portal_sub_pay_app_line_items', 'invoices', 'invoice_line_items', 'bills',
  'budgets', 'budget_lines', 'budget_line_items', 'budget_snapshots', 'commitments', 'purchase_orders',
  'contracts', 'prime_contracts', 'cost_entries', 'cost_reports', 'cost_rates', 'cash_flow_projections',
  'cash_flow_line_items', 'lien_waivers', 'portal_payments', 'bonds', 'change_orders',
  'change_order_line_items', 'change_events', 'payroll_periods', 'payroll_records', 'certified_payroll',
  'timesheet_entries', 'leave_balances', 'employee_incidents', 'workers', 'subscriptions',
  'subscription_invoices', 'addon_purchases', 'billing_receipts', 'api_keys', 'webhook_endpoints',
  'qbo_connections', 'audit_logs', 'role_definitions', 'time_entries', 'timesheets', 'employees',
  'employee_project_assignments', 'projects',
];

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const claims = (p) => JSON.stringify({ sub: p.uid, role: 'authenticated', email: p.email, aud: 'authenticated' });
const ALL = [...REAL, ...SYNTH];

const setup = `
CREATE TEMP TABLE rls_proof (phase text, persona text, probe text, n bigint, err text);
CREATE TEMP TABLE rls_personas (ord int, persona text, claims text, email text);
GRANT ALL ON pg_temp.rls_proof, pg_temp.rls_personas TO authenticated;
INSERT INTO pg_temp.rls_personas VALUES
  ${ALL.map((p, i) => `(${i}, ${lit(p.key)}, ${lit(claims(p))}, ${lit(p.email)})`).join(',\n  ')};
${SYNTH.map((s) => `
INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
VALUES (${lit(s.uid)}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${lit(s.email)},
        jsonb_build_object('tenant_id', ${lit(SAGUARO)}, 'full_name', ${lit('RLS Proof ' + s.role)}), now(), now());
UPDATE public.profiles SET role = ${lit(s.role)} WHERE id = ${lit(s.uid)};
INSERT INTO public.user_role_assignments (user_id, tenant_id, role_id)
SELECT ${lit(s.uid)}, ${lit(SAGUARO)}, id FROM public.role_definitions WHERE tenant_id = ${lit(SAGUARO)} AND name = ${lit(s.role)};`).join('')}

-- One probe = one subtransaction, always undone; records the row count or SQLSTATE.
CREATE FUNCTION pg_temp.rls_probe(p_phase text, p_persona text, p_name text, p_sql text) RETURNS void
LANGUAGE plpgsql AS $f$
DECLARE n bigint;
BEGIN
  BEGIN
    EXECUTE p_sql INTO n;
    RAISE EXCEPTION 'probe_undo';
  EXCEPTION WHEN others THEN
    IF SQLERRM = 'probe_undo' THEN
      INSERT INTO pg_temp.rls_proof VALUES (p_phase, p_persona, p_name, n, NULL);
    ELSE
      INSERT INTO pg_temp.rls_proof VALUES (p_phase, p_persona, p_name, NULL, SQLSTATE);
    END IF;
  END;
END $f$;

CREATE FUNCTION pg_temp.rls_phase(p_phase text) RETURNS void
LANGUAGE plpgsql AS $f$
DECLARE p record; t text; v_tid text; v_proj text; v_other text;
BEGIN
  FOR p IN SELECT * FROM pg_temp.rls_personas ORDER BY ord LOOP
    PERFORM set_config('request.jwt.claims', p.claims, true);
    SET LOCAL ROLE authenticated;
    FOREACH t IN ARRAY ARRAY[${TABLES.map(lit).join(', ')}] LOOP
      PERFORM pg_temp.rls_probe(p_phase, p.persona, 'rows:' || t, format('SELECT count(*) FROM public.%I', t));
    END LOOP;
    v_tid := quote_literal(public.get_tenant_id()::text);
    SELECT quote_literal(id::text) INTO v_proj FROM public.projects ORDER BY created_at LIMIT 1;
    SELECT quote_literal(id::text) INTO v_other FROM public.employees ORDER BY created_at LIMIT 1;
    v_proj := coalesce(v_proj, 'NULL'); v_other := coalesce(v_other, 'NULL');

    -- app/app/people + PeopleDirectory roster list (no pay columns)
    PERFORM pg_temp.rls_probe(p_phase, p.persona, 'browser:people.roster',
      'SELECT count(*) FROM (SELECT id, first_name, last_name, full_name, title, trade, email, phone, is_active, osha_10_certified, osha_30_certified, forklift_certified FROM public.employees) x');
    -- PeopleDirectory detail (CURRENT prod): select('*')
    PERFORM pg_temp.rls_probe(p_phase, p.persona, 'browser:people.detail_select_star',
      'SELECT count(*) FROM (SELECT * FROM public.employees) x');
    -- PeopleDirectory detail (this PR): explicit non-pay columns
    PERFORM pg_temp.rls_probe(p_phase, p.persona, 'browser:people.detail_no_pay',
      'SELECT count(*) FROM (SELECT id, first_name, last_name, full_name, title, trade, email, phone, employment_type, is_active, specialties, certifications FROM public.employees) x');
    -- PeopleDirectory saveEdit (CURRENT prod): update someone else incl. pay rate
    PERFORM pg_temp.rls_probe(p_phase, p.persona, 'browser:people.update_other',
      'WITH u AS (UPDATE public.employees SET regular_rate = regular_rate WHERE id = ' || v_other || ' RETURNING 1) SELECT count(*) FROM u');
    -- PeopleDirectory addEmp (CURRENT prod): insert someone else with a rate
    PERFORM pg_temp.rls_probe(p_phase, p.persona, 'browser:people.insert_other',
      'WITH i AS (INSERT INTO public.employees (tenant_id, first_name, last_name, email, regular_rate, is_active) VALUES (' || v_tid || ', ''Proof'', ''Person'', ''rls-proof-other@example.invalid'', 1, true) RETURNING 1) SELECT count(*) FROM i');
    -- PeopleDirectory incident list
    PERFORM pg_temp.rls_probe(p_phase, p.persona, 'browser:people.incidents', 'SELECT count(*) FROM public.employee_incidents');
    -- Time clock, first use (app/app/time), one statement per browser request:
    -- create MY employee row, read my own rates (CURRENT prod reads them in the
    -- browser), log my hours, read them back, edit them, submit my week.
    -- 1 = every step succeeded.
    PERFORM pg_temp.rls_probe(p_phase, p.persona, 'browser:time.self_flow', format($q$
      SELECT pg_temp.rls_own_cycle(%1$s, %2$L, %3$s)$q$, v_tid, p.email, v_proj));
    -- Everyone's hours (labor cost / rates) via REST
    PERFORM pg_temp.rls_probe(p_phase, p.persona, 'rest:time_entries_all', 'SELECT count(*) FROM public.time_entries');
    -- T&M ticket → change event (app/app/projects/[id]/tm-tickets)
    PERFORM pg_temp.rls_probe(p_phase, p.persona, 'browser:tm.change_event_insert',
      'WITH i AS (INSERT INTO public.change_events (tenant_id, project_id, title, status) VALUES (' || v_tid || ', ' || v_proj || ', ''RLS proof'', ''open'') RETURNING 1) SELECT count(*) FROM i');
    -- What a token holder could do over REST that the browser code never does
    PERFORM pg_temp.rls_probe(p_phase, p.persona, 'rest:employees_with_pay_rate',
      'SELECT count(*) FROM public.employees WHERE coalesce(regular_rate,0) > 0 OR coalesce(overtime_rate,0) > 0');
    PERFORM pg_temp.rls_probe(p_phase, p.persona, 'rest:update_one_invoice',
      'WITH u AS (UPDATE public.invoices SET updated_at = updated_at WHERE id IN (SELECT id FROM public.invoices ORDER BY created_at LIMIT 1) RETURNING 1) SELECT count(*) FROM u');
    -- Delete is not replayed (the SQL runner holds deletes for approval);
    -- the delete gate is the same function at Full, read here directly.
    PERFORM pg_temp.rls_probe(p_phase, p.persona, 'gate:pay_apps_full', 'SELECT CASE WHEN rbac.has_permission(''Pay Apps'', ''Full'') THEN 1 ELSE 0 END');
    PERFORM pg_temp.rls_probe(p_phase, p.persona, 'gate:admin_view', 'SELECT CASE WHEN rbac.has_permission(''Admin'', ''View'') THEN 1 ELSE 0 END');
    PERFORM pg_temp.rls_probe(p_phase, p.persona, 'rest:edit_one_role_definition',
      'WITH u AS (UPDATE public.role_definitions SET permissions = permissions WHERE id IN (SELECT id FROM public.role_definitions ORDER BY created_at LIMIT 1) RETURNING 1) SELECT count(*) FROM u');
    RESET ROLE;
  END LOOP;
END $f$;

-- My own time-clock flow, statement by statement (run as the persona, inside a probe).
CREATE FUNCTION pg_temp.rls_own_cycle(p_tid uuid, p_email text, p_proj uuid) RETURNS bigint
LANGUAGE plpgsql AS $f$
DECLARE v_emp uuid; n bigint;
BEGIN
  INSERT INTO public.employees (tenant_id, email, first_name, last_name, is_active) VALUES (p_tid, p_email, 'Proof', 'Self', true) RETURNING id INTO v_emp;
  INSERT INTO public.time_entries (tenant_id, employee_id, project_id, work_date, clock_in, clock_out, hours_worked, regular_hours, overtime_hours, status, entry_type)
    VALUES (p_tid, v_emp, p_proj, current_date, now() - interval '8 hours', now(), 8, 8, 0, 'pending', 'regular');
  SELECT count(*) INTO n FROM public.time_entries WHERE employee_id = v_emp;
  IF n <> 1 THEN RAISE EXCEPTION 'own entry not readable (%)', n; END IF;
  PERFORM regular_rate, overtime_rate FROM public.employees WHERE id = v_emp;
  IF NOT FOUND THEN RAISE EXCEPTION 'own rates not readable'; END IF;
  UPDATE public.time_entries SET meal_break_mins = 30 WHERE employee_id = v_emp;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'own entry not editable'; END IF;
  INSERT INTO public.timesheets (tenant_id, employee_id, employee_name, week_ending, hours_regular, hours_overtime, status, submitted_at)
    VALUES (p_tid, v_emp, 'Proof Self', current_date, 8, 0, 'submitted', now());
  RETURN 1;
END $f$;
GRANT EXECUTE ON FUNCTION pg_temp.rls_probe(text, text, text, text), pg_temp.rls_own_cycle(uuid, text, uuid) TO authenticated;
`;

const finish = `
-- Compact report: per persona, the tables whose visible row count CHANGED
-- (before>after) and how many stayed identical; then every browser/REST probe.
DO $finish$
DECLARE j text;
BEGIN
  WITH b AS (SELECT persona, probe, coalesce(n::text, 'E' || err) v FROM pg_temp.rls_proof WHERE phase = 'before'),
       a AS (SELECT persona, probe, coalesce(n::text, 'E' || err) v FROM pg_temp.rls_proof WHERE phase = 'after'),
       m AS (SELECT b.persona, b.probe, b.v bv, a.v av FROM b LEFT JOIN a USING (persona, probe)),
       per AS (
         SELECT x.persona, p.ord,
                count(*) FILTER (WHERE x.probe LIKE 'rows:%' AND x.bv IS NOT DISTINCT FROM coalesce(x.av, x.bv)) same,
                string_agg(CASE WHEN x.probe LIKE 'rows:%' AND x.av IS NOT NULL AND x.bv <> x.av THEN substr(x.probe, 6) || ' ' || x.bv || '>' || x.av END, ', ' ORDER BY x.probe) changed,
                string_agg(CASE WHEN x.probe NOT LIKE 'rows:%' THEN x.probe || ' ' || x.bv || coalesce('>' || x.av, '') END, ', ' ORDER BY x.probe) probes
           FROM m x JOIN pg_temp.rls_personas p ON p.persona = x.persona GROUP BY x.persona, p.ord)
  SELECT string_agg(persona || ' | same=' || same || ' | changed: ' || coalesce(changed, '-') || ' | ' || coalesce(probes, ''), ' ## ' ORDER BY ord) INTO j FROM per;
  RAISE EXCEPTION 'RLS_PROOF %', j;
END
$finish$;`;

let sql = `-- generated by tools/rls-proof-matrix.mjs — always rolled back (ends in RAISE)\n${setup}\nSELECT pg_temp.rls_phase('before');\n`;
for (const m of migrations) {
  // Whole-line comments are dropped to keep the script small; SQL is unchanged.
  const body = fs.readFileSync(m, 'utf8').split('\n').filter((l) => !/^\s*--/.test(l) && l.trim() !== '').join('\n');
  sql += `\n-- ── migration under test: ${m}\n${body}\n`;
}
if (migrations.length) sql += `\nSELECT pg_temp.rls_phase('after');\n`;
sql += finish;
process.stdout.write(sql);
