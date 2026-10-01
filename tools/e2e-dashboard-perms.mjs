/**
 * THE DASHBOARD'S OWN NUMBERS, READ AS A RESTRICTED USER.
 *
 * The rail hides FINANCIAL from a salesperson. /api/dashboard/stats used to
 * answer every signed-in user with the company's total contract value, its
 * monthly revenue, the pay applications in flight and the open RFIs — so the
 * person who could not open /app/billing read the count of what was in it off
 * the dashboard on the way past.
 *
 * This proves the gate the only way that counts: sign in, read the stats as an
 * admin, strip the account down to a real restricted role, read them again,
 * and check the withheld figures are ABSENT — not zero. A withheld number that
 * arrives as 0 is drawn as a fact, and "Total Contract Value $0" on a company
 * running live jobs is a wrong number stated with confidence.
 *
 * It mutates a real account to do that, exactly as the nav check does, and
 * restores it in a finally block whatever happens.
 *
 *   node tools/e2e-dashboard-perms.mjs            # against production
 *   SWEEP_BASE=http://localhost:3000 node tools/e2e-dashboard-perms.mjs
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const BASE = process.env.SWEEP_BASE || 'https://saguarocontrol.net';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])
);

/* Money, pay apps and RFIs. Absent for a user who may not see them. */
const GATED = ['totalContractValue', 'monthlyRevenue', 'pendingPayApps', 'openRFIs'];
/* Always present: the dashboard is unusable without them and no category gates them. */
const ALWAYS = ['activeProjects', 'openBids', 'expiringInsurance'];

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!ok) failed++;
};

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: auth, error: signInErr } = await sb.auth.signInWithPassword({
  email: env.SAGUARO_QA_EMAIL, password: env.SAGUARO_QA_PASS,
});
if (signInErr || !auth?.session) {
  console.log('SIGN-IN FAILED:', signInErr?.message);
  process.exit(1);
}
const cookie = `sb-access-token=${auth.session.access_token}; sb-refresh-token=${auth.session.refresh_token}`;
const userId = auth.user.id;

const stats = async () => {
  const r = await fetch(BASE + '/api/dashboard/stats', { headers: { cookie } });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, stats: body.stats ?? {}, body };
};

const { data: profile } = await admin
  .from('profiles').select('role, tenant_id').eq('id', userId).maybeSingle();
const priorRole = profile?.role ?? null;
const tenantId = profile?.tenant_id;

console.log(`\nDASHBOARD PERMISSIONS — ${BASE}\n  as ${auth.user.email}, base role "${priorRole}"\n`);

let roleId = null;
try {
  /* 1 — as the account stands (admin ⇒ Full on everything). */
  const before = await stats();
  check('stats answers 200', before.status === 200, `status ${before.status}`);
  const presentBefore = GATED.filter((k) => before.stats[k] !== undefined);
  check('admin sees every gated figure', presentBefore.length === GATED.length,
    `${presentBefore.length}/${GATED.length}: ${presentBefore.join(', ')}`);
  for (const k of ALWAYS) check(`  ${k} present`, before.stats[k] !== undefined);

  /* 2 — strip it to a real restricted role.
     profiles.role must leave the admin set first: ADMIN_ROLES short-circuits
     getEffectivePermissions to Full on everything and no assignment can lower
     it. And a non-admin with NO assignment falls to memberDefault(), which is
     View on every operational category — that would pass this test without the
     gate ever being exercised, so an explicit role is assigned. */
  const perms = {
    Projects: 'Edit', Sales: 'Full', Documents: 'Edit', Reports: 'View',
    Budget: 'None', 'Pay Apps': 'None', RFIs: 'None',
    Schedule: 'None', Safety: 'None', Submittals: 'None', 'Change Orders': 'None', Admin: 'None',
  };
  const { data: role, error: roleErr } = await admin.from('role_definitions')
    .insert({ tenant_id: tenantId, name: 'E2E Salesperson (temporary)', permissions: perms })
    .select('id').single();
  if (roleErr) throw new Error('could not create role: ' + roleErr.message);
  roleId = role.id;

  const { error: asgErr } = await admin.from('user_role_assignments')
    .insert({ tenant_id: tenantId, user_id: userId, role_id: roleId, project_id: null });
  if (asgErr) throw new Error('could not assign role: ' + asgErr.message);

  const { error: demErr } = await admin.from('profiles').update({ role: 'member' }).eq('id', userId);
  if (demErr) throw new Error('could not demote: ' + demErr.message);

  /* 3 — read them again. */
  const after = await stats();
  check('stats still answers 200 for a restricted user', after.status === 200, `status ${after.status}`);

  for (const k of GATED) {
    check(`${k} WITHHELD (absent, not 0)`, after.stats[k] === undefined,
      after.stats[k] === undefined ? '' : `got ${JSON.stringify(after.stats[k])}`);
  }
  for (const k of ALWAYS) {
    check(`${k} still returned`, after.stats[k] !== undefined);
  }
  /* The whole point: no zero stands in for a withheld figure. */
  const zeroed = GATED.filter((k) => after.stats[k] === 0);
  check('no withheld figure arrived as 0', zeroed.length === 0, zeroed.join(', '));

  console.log('\n  payload as restricted user:', JSON.stringify(after.stats));
} finally {
  /* PUT THE ACCOUNT BACK, whatever happened above. */
  if (priorRole) await admin.from('profiles').update({ role: priorRole }).eq('id', userId);
  if (roleId) {
    await admin.from('user_role_assignments').delete().eq('user_id', userId).eq('role_id', roleId);
    await admin.from('role_definitions').delete().eq('id', roleId);
  }
  const { data: restored } = await admin
    .from('profiles').select('role').eq('id', userId).maybeSingle();
  const { count: leftover } = await admin.from('user_role_assignments')
    .select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('role_id', roleId ?? '');
  console.log(`\n  restored: base role "${restored?.role}", temporary assignments left ${leftover ?? 0}`);
  if (restored?.role !== priorRole) { console.log('  *** ACCOUNT NOT RESTORED ***'); failed++; }
}

console.log(failed ? `\n${failed} FAILED` : '\nALL OK — withheld figures are absent, never zero');
process.exit(failed ? 1 : 0);
