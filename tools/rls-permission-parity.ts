/**
 * Proves the database's role check (rbac.permission_level_for, used by every
 * role_gate_* RLS policy) and the app's role check (getEffectivePermissions in
 * lib/permissions.ts, used by every API route) give the SAME answer.
 *
 * Run:
 *   npx -y tsx tools/rls-permission-parity.ts <fixture.json> <sql-output.txt>
 *
 * fixture.json — the live inputs, exported read-only:
 *   select json_build_object(
 *     'profiles',    (select json_agg(json_build_object('id', id, 'role', role, 'tenant_id', tenant_id) order by id) from profiles),
 *     'assignments', (select json_agg(json_build_object('user_id', user_id, 'tenant_id', tenant_id, 'role_id', role_id, 'project_id', project_id, 'permissions', permissions) order by id) from user_role_assignments),
 *     'roles',       (select json_agg(json_build_object('id', id, 'tenant_id', tenant_id, 'permissions', permissions, 'name', name, 'is_builtin', is_builtin) order by id) from role_definitions)
 *   )::text;
 *
 * sql-output.txt — what rbac.permission_level_for returned for the same
 * inputs, from the rolled-back parity script (docs in the PR). Tokens:
 *   u:<user>:<project|->:<12 digits>   every real user, no project / each scoped project / an unrelated one
 *   r<n>:<12 digits>                   every stored role, alone, as a global grant to a non-admin member
 *   multi / foreign / proj-none / proj-P / proj-Q   edge cases (see buildCases)
 *   j<n>:<-|P|Q>:<12 digits>         job roles (20261017h): J1..J9, see the .sql
 *   meta:<foreman>,<sub>,<super>,<foreignRole>,<P>,<Q>
 *   meta2:<readOnly>,<pm>,<foreman>,<super>,<adminRole>
 * Digits are levels (0 None, 1 View, 2 Edit, 3 Full) in CATEGORIES order.
 *
 * The TS side runs the REAL getEffectivePermissions() against an in-memory
 * stand-in for the three tables it reads, so nothing here re-implements it.
 * Exit 0 = every case agrees.
 */
import fs from 'node:fs';

type Profile = { id: string; role: string | null; tenant_id: string | null };
type Assignment = { user_id: string; tenant_id: string; role_id: string | null; project_id: string | null; permissions?: unknown };
type Role = { id: string; tenant_id: string; permissions: unknown; name?: string; is_builtin?: boolean };
type Fixture = { profiles: Profile[]; assignments: Assignment[]; roles: Role[] };

/* lib/permissions → lib/supabase-server refuses to load without these. The stub
   db below is passed in explicitly, so no client is ever created from them. */
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://parity.invalid';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'parity';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'parity';

/** Just enough of the supabase-js query builder for getEffectivePermissions. */
function stubDb(tables: Record<string, Record<string, unknown>[]>) {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      const q = {
        select() { return q; },
        eq(col: string, v: unknown) { rows = rows.filter((r) => r[col] === v); return q; },
        in(col: string, vs: unknown[]) { rows = rows.filter((r) => vs.includes(r[col])); return q; },
        maybeSingle() { return Promise.resolve({ data: rows[0] ?? null, error: null }); },
        then(res: (v: { data: unknown[]; error: null }) => unknown, rej?: (e: unknown) => unknown) {
          return Promise.resolve({ data: rows, error: null }).then(res, rej);
        },
      };
      return q;
    },
  };
}

async function main() {
  const [fixturePath, sqlPath] = process.argv.slice(2);
  if (!fixturePath || !sqlPath) {
    console.error('usage: tsx tools/rls-permission-parity.ts <fixture.json> <sql-output.txt>');
    process.exit(2);
  }
  const { getEffectivePermissions, hasAnyPermission, PROPOSAL_MONEY, CATEGORIES } = await import('../lib/permissions');
  const fx: Fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const tokens = fs.readFileSync(sqlPath, 'utf8').trim().split(/\s+/);
  const RANK: Record<string, number> = { None: 0, View: 1, Edit: 2, Full: 3 };

  const meta = tokens.find((t) => t.startsWith('meta:'))!.slice(5).split(',');
  const [rFore, rSub, rSup, rForeign, P, Q] = meta;
  const SAG = '692d8793-4d9f-4c43-a935-bf56cc637553';

  async function tsDigits(profiles: Profile[], assignments: Assignment[], userId: string, projectId: string | null) {
    const db = stubDb({
      profiles: profiles as unknown as Record<string, unknown>[],
      user_role_assignments: assignments as unknown as Record<string, unknown>[],
      role_definitions: fx.roles as unknown as Record<string, unknown>[],
    });
    const prof = profiles.find((p) => p.id === userId);
    const tenantId = prof?.tenant_id || userId; // getTenant(): profiles.tenant_id || user.id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const perms = await getEffectivePermissions(db as any, userId, tenantId, projectId);
    return CATEGORIES.map((c) => String(RANK[perms[c]])).join('');
  }

  let checked = 0;
  let failed = 0;
  const report = (name: string, sql: string, ts: string) => {
    checked++;
    if (sql !== ts) {
      failed++;
      console.error(`FAIL ${name}: sql=${sql} ts=${ts}`);
    }
  };

  // 1) Every real user, every project context the SQL side evaluated.
  for (const t of tokens.filter((x) => x.startsWith('u:'))) {
    const [, user, proj, digits] = t.split(':');
    report(`user ${user.slice(0, 8)} @ ${proj === '-' ? 'no project' : proj.slice(0, 8)}`, digits,
      await tsDigits(fx.profiles, fx.assignments, user, proj === '-' ? null : proj));
  }

  // 2) Every stored role, alone, global, to a non-admin member of its tenant.
  const X = 'parity-x';
  for (let i = 0; i < fx.roles.length; i++) {
    const tok = tokens.find((x) => x.startsWith(`r${i + 1}:`));
    if (!tok) { failed++; console.error(`FAIL role #${i + 1}: no SQL result`); continue; }
    const rd = fx.roles[i];
    report(`role ${rd.id.slice(0, 8)}`, tok.split(':')[1], await tsDigits(
      [{ id: X, role: 'member', tenant_id: rd.tenant_id }],
      [{ user_id: X, tenant_id: rd.tenant_id, role_id: rd.id, project_id: null }], X, null));
  }

  // 3) Edge cases.
  const member = (id: string): Profile => ({ id, role: 'member', tenant_id: SAG });
  const edge = (name: string) => tokens.find((x) => x.startsWith(`${name}:`))!.split(':')[1];
  report('two global roles, highest wins', edge('multi'), await tsDigits([member('y')],
    [{ user_id: 'y', tenant_id: SAG, role_id: rFore, project_id: null }, { user_id: 'y', tenant_id: SAG, role_id: rSub, project_id: null }], 'y', null));
  report("grant to another company's role", edge('foreign'), await tsDigits([member('w')],
    [{ user_id: 'w', tenant_id: SAG, role_id: rForeign, project_id: null }], 'w', null));
  const zA: Assignment[] = [{ user_id: 'z', tenant_id: SAG, role_id: rSup, project_id: P }];
  report('project-only grant, no project asked', edge('proj-none'), await tsDigits([member('z')], zA, 'z', null));
  report('project-only grant, that project', edge('proj-P'), await tsDigits([member('z')], zA, 'z', P));
  report('project-only grant, another project', edge('proj-Q'), await tsDigits([member('z')], zA, 'z', Q));

  // 3b) Job roles — the same nine people the .sql builds, the same rows.
  const meta2 = tokens.find((t) => t.startsWith('meta2:'))?.slice(6).split(',');
  if (!meta2) { failed++; console.error('FAIL job roles: no meta2 token (run the 20261017h harness)'); }
  else {
    const [rRO, rPM, rFo, rSu, rAdm] = meta2;
    const none = Object.fromEntries(CATEGORIES.map((c) => [c, 'None']));
    const J = (n: number) => `00000000-0000-4000-8000-0000000000b${n}`;
    const people: Profile[] = Array.from({ length: 9 }, (_, i) => ({ id: J(i + 1), role: i === 8 ? 'admin' : 'member', tenant_id: SAG }));
    const row = (n: number, role_id: string | null, project_id: string | null, permissions: unknown = null): Assignment =>
      ({ user_id: J(n), tenant_id: SAG, role_id, project_id, permissions });
    const rows: Assignment[] = [
      row(1, rRO, null), row(1, rPM, P),
      row(2, rPM, null), row(2, null, P, none),
      row(3, rFo, null), row(3, rSu, P, { Budget: 'Full', Sales: 'None' }),
      row(4, rFo, null), row(4, null, P, { Budget: 'Edit', RFIs: 'bogus' }),
      row(5, rAdm, null), row(5, rRO, P),
      row(6, null, P, { Admin: 'Full', Projects: 'Edit' }),
      row(7, rForeign, P),
      row(8, null, P, none),
      row(9, null, P, none),
    ];
    for (const t of tokens.filter((x) => /^j\d:/.test(x))) {
      const [head, tag, digits] = t.split(':');
      const n = Number(head.slice(1));
      const pid = tag === 'P' ? P : tag === 'Q' ? Q : null;
      report(`job role J${n} @ ${tag}`, digits, await tsDigits(people, rows, J(n), pid));
    }
    if (tokens.filter((x) => /^j\d:/.test(x)).length !== 27) { failed++; console.error('FAIL job roles: expected 27 j tokens'); }
  }

  // 4) The field templates can file a daily log / punch item (Projects ≥ Edit)
  //    and a Foreman can upload a site photo (Documents ≥ Edit) — on BOTH sides,
  //    for every built-in Foreman / Superintendent row in every company
  //    (20261017b). Digits from step 2: index of the category in CATEGORIES.
  const at = (digits: string, c: string) => Number(digits[CATEGORIES.indexOf(c as never)]);
  let fieldRoles = 0;
  for (let i = 0; i < fx.roles.length; i++) {
    const rd = fx.roles[i];
    if (!rd.is_builtin || (rd.name !== 'Foreman' && rd.name !== 'Superintendent')) continue;
    const tok = tokens.find((x) => x.startsWith(`r${i + 1}:`));
    if (!tok) continue;
    const sqlD = tok.split(':')[1];
    const tsD = await tsDigits([{ id: X, role: 'member', tenant_id: rd.tenant_id }],
      [{ user_id: X, tenant_id: rd.tenant_id, role_id: rd.id, project_id: null }], X, null);
    fieldRoles++;
    checked++;
    const need = rd.name === 'Foreman' ? ['Projects', 'Documents'] : ['Projects'];
    for (const c of need) {
      if (at(sqlD, c) < 2 || at(tsD, c) < 2) { failed++; console.error(`FAIL ${rd.name} ${rd.id.slice(0, 8)}: ${c} sql=${at(sqlD, c)} ts=${at(tsD, c)} (needs Edit)`); }
    }
  }

  // 5) Proposal / bid money (PROPOSAL_MONEY = Sales or Budget): the TS helper
  //    the routes call agrees with the SQL levels the policies read.
  for (const t of tokens.filter((x) => x.startsWith('u:'))) {
    const [, user, proj, digits] = t.split(':');
    const db = stubDb({ profiles: fx.profiles as never, user_role_assignments: fx.assignments as never, role_definitions: fx.roles as never });
    const prof = fx.profiles.find((p) => p.id === user);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const perms = await getEffectivePermissions(db as any, user, prof?.tenant_id || user, proj === '-' ? null : proj);
    const sqlMoney = at(digits, 'Sales') >= 1 || at(digits, 'Budget') >= 1;
    checked++;
    if (hasAnyPermission(perms, PROPOSAL_MONEY, 'View') !== sqlMoney) { failed++; console.error(`FAIL proposal money ${user.slice(0, 8)} @ ${proj}`); }
  }

  console.log(`${checked} cases x ${CATEGORIES.length} categories compared (${fieldRoles} field templates checked for daily logs); ${failed} disagree.`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
