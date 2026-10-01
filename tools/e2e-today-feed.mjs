/**
 * THE ACTION LIST THE DASHBOARD ACTUALLY RENDERS.
 *
 * /api/dashboard/today has always answered { actions, source }. useTodayItems
 * read `items`, which is undefined, so the list resolved to [] on every render:
 * the dashboard showed "nothing needs you" while the server was returning pay
 * apps awaiting approval, insurance expiring inside 30 days, overdue RFIs and
 * missing W-9s. A panel that is wrong in this direction is invisible — nobody
 * reports an empty to-do list.
 *
 * This asserts the payload AND the hook's own resolution rule on it, so the
 * two cannot drift apart again. It also checks the new lien-waiver item against
 * the row count in the database, and that the money is withheld from a user
 * without Pay Apps.
 *
 *   SWEEP_BASE=http://localhost:3000 node tools/e2e-today-feed.mjs
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const BASE = process.env.SWEEP_BASE || 'https://saguarocontrol.net';
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])
);

let failed = 0;
const check = (n, ok, d = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`);
  if (!ok) failed++;
};

/* The EXACT rule lib/hooks/useDashboard.ts uses. If this test and the hook ever
   disagree, the test is wrong — so it is copied, not approximated. */
const asHookSees = (data) =>
  Array.isArray(data) ? data : (data?.actions ?? data?.items ?? []);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { data: auth, error } = await sb.auth.signInWithPassword({
  email: env.SAGUARO_QA_EMAIL, password: env.SAGUARO_QA_PASS,
});
if (error || !auth?.session) { console.log('SIGN-IN FAILED:', error?.message); process.exit(1); }
const cookie = `sb-access-token=${auth.session.access_token}; sb-refresh-token=${auth.session.refresh_token}`;
const userId = auth.user.id;

const today = async () => {
  const r = await fetch(BASE + '/api/dashboard/today', { headers: { cookie } });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body, items: asHookSees(body) };
};

const { data: profile } = await admin
  .from('profiles').select('role, tenant_id').eq('id', userId).maybeSingle();
const priorRole = profile?.role ?? null;
const tenantId = profile?.tenant_id;

const { count: pendingWaivers } = await admin.from('lien_waivers')
  .select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'pending');

console.log(`\nTODAY FEED — ${BASE}\n  as ${auth.user.email}, base role "${priorRole}"`);
console.log(`  lien_waivers pending in this tenant: ${pendingWaivers}\n`);

let roleId = null;
let fixtureIds = [];
try {
  const a = await today();
  check('today answers 200', a.status === 200, `status ${a.status}`);
  check('the hook resolves a NON-EMPTY list', a.items.length > 0,
    `${a.items.length} item(s) — this was always 0 before the key fix`);
  check('every item has what the card renders',
    a.items.every((i) => i.type && i.title && i.urgency && i.actionUrl && i.actionLabel),
    JSON.stringify(a.items[0] ?? null));

  check('no waiver item when none are pending',
    pendingWaivers > 0 || !a.items.some((i) => /lien waiver/i.test(i.title)));
  console.log('\n  feed as admin:');
  for (const i of a.items) console.log(`     ${i.type.padEnd(11)} ${i.title}`);

  /* THE WAIVER ROW, DRIVEN WITH DATA.
     The QA tenant usually has no pending waivers, so asserting "no waiver item"
     proves nothing about the branch that renders one. Two clearly-labelled rows
     are inserted here, asserted, and deleted in the finally below — labelled so
     that if cleanup ever fails, the next person reading the compliance page sees
     at a glance that these came from a test and not from a sub. */
  const { data: proj } = await admin.from('projects')
    .select('id, name').eq('tenant_id', tenantId).limit(1).maybeSingle();
  if (!proj) throw new Error('no project in the QA tenant to attach a waiver to');
  const FIXTURE = 'E2E FIXTURE — DELETE ME (today-feed test)';
  const { data: seeded, error: sErr } = await admin.from('lien_waivers').insert([
    { tenant_id: tenantId, project_id: proj.id, claimant_name: FIXTURE,
      waiver_type: 'conditional_progress', amount: 1000, status: 'pending', state: 'AZ' },
    { tenant_id: tenantId, project_id: proj.id, claimant_name: FIXTURE,
      waiver_type: 'conditional_progress', amount: 2000, status: 'pending', state: 'AZ' },
  ]).select('id');
  if (sErr) throw new Error('could not seed waivers: ' + sErr.message);
  fixtureIds = (seeded ?? []).map((r) => r.id);

  const withWaivers = await today();
  const wItem = withWaivers.items.find((i) => /lien waiver/i.test(i.title));
  check('a pending waiver now appears in the feed', !!wItem, wItem?.title ?? 'MISSING');
  check('the count is the database count, pluralised',
    wItem?.title === `${fixtureIds.length} lien waivers awaiting signature`,
    `got "${wItem?.title}", expected "${fixtureIds.length} lien waivers awaiting signature"`);
  check('the link points at a real lien-waivers page',
    !!wItem && /^\/app\/projects\/[0-9a-f-]+\/lien-waivers$/.test(wItem.actionUrl),
    wItem?.actionUrl ?? '');
  check('it is a compliance row', wItem?.type === 'compliance', String(wItem?.type));

  /* Restricted: no Pay Apps ⇒ no pay-app rows and no waiver row. */
  const perms = {
    Projects: 'Edit', Sales: 'Full', Documents: 'Edit', Reports: 'View',
    Budget: 'None', 'Pay Apps': 'None', RFIs: 'None',
    Schedule: 'None', Safety: 'None', Submittals: 'None', 'Change Orders': 'None', Admin: 'None',
  };
  const { data: role, error: rErr } = await admin.from('role_definitions')
    .insert({ tenant_id: tenantId, name: 'E2E Today (temporary)', permissions: perms })
    .select('id').single();
  if (rErr) throw new Error('role create: ' + rErr.message);
  roleId = role.id;
  const { error: aErr } = await admin.from('user_role_assignments')
    .insert({ tenant_id: tenantId, user_id: userId, role_id: roleId, project_id: null });
  if (aErr) throw new Error('assign: ' + aErr.message);
  const { error: dErr } = await admin.from('profiles').update({ role: 'member' }).eq('id', userId);
  if (dErr) throw new Error('demote: ' + dErr.message);

  const b = await today();
  check('restricted user still gets 200', b.status === 200, `status ${b.status}`);
  check('no pay-app rows for a user without Pay Apps',
    !b.items.some((i) => i.type === 'pay-app'),
    b.items.filter((i) => i.type === 'pay-app').map((i) => i.title).join('; '));
  check('no lien-waiver row for a user without Pay Apps',
    !b.items.some((i) => /lien waiver/i.test(i.title)),
    b.items.filter((i) => /lien waiver/i.test(i.title)).map((i) => i.title).join('; '));
  console.log('\n  feed as restricted user:');
  for (const i of b.items) console.log(`     ${i.type.padEnd(11)} ${i.title}`);
  if (!b.items.length) console.log('     (empty)');
} finally {
  if (priorRole) await admin.from('profiles').update({ role: priorRole }).eq('id', userId);
  if (roleId) {
    await admin.from('user_role_assignments').delete().eq('user_id', userId).eq('role_id', roleId);
    await admin.from('role_definitions').delete().eq('id', roleId);
  }
  if (fixtureIds.length) await admin.from('lien_waivers').delete().in('id', fixtureIds);

  /* Prove the cleanup, do not assume it. A leftover pending waiver would show up
     on the compliance page and in the autopilot alerts as real outstanding work. */
  const { data: restored } = await admin
    .from('profiles').select('role').eq('id', userId).maybeSingle();
  const { count: leftFixtures } = await admin.from('lien_waivers')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId).ilike('claimant_name', 'E2E FIXTURE%');
  const { count: nowPending } = await admin.from('lien_waivers')
    .select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'pending');
  console.log(`\n  restored: base role "${restored?.role}", fixtures left ${leftFixtures ?? 0}, tenant pending back to ${nowPending} (was ${pendingWaivers})`);
  if (restored?.role !== priorRole) { console.log('  *** ACCOUNT NOT RESTORED ***'); failed++; }
  if ((leftFixtures ?? 0) !== 0) { console.log('  *** FIXTURES LEFT BEHIND ***'); failed++; }
  if (nowPending !== pendingWaivers) { console.log('  *** PENDING COUNT NOT RESTORED ***'); failed++; }
}

console.log(failed ? `\n${failed} FAILED` : '\nALL OK — the feed renders, the waiver count is the database, and the money is gated');
process.exit(failed ? 1 : 0);
