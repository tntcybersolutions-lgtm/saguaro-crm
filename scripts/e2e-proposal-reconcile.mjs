/**
 * Reconciles the live proposals whose stated amount and lines disagree, through
 * the API, and proves the remedy behaves before and after.
 *
 * The two live mismatches were not errors in either number. An estimator
 * itemises direct costs and then prices the job; the difference is the general
 * conditions, overhead and profit that were never written down. So the contract
 * price stays put and the missing money becomes a line — which is what the
 * client actually agreed to buy.
 *
 * Run with the server up:  npx tsx scripts/e2e-proposal-reconcile.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

const { data: s, error } = await anon.auth.signInWithPassword({ email: 'claude.qa@saguarocontrol.net', password: 'Sag-QA-2026!verify' });
if (error) { console.error(error.message); process.exit(1); }
const T = s.session.access_token;
const BASE = process.env.E2E_BASE || 'http://localhost:3000';
const api = async (p, i = {}) => {
  const r = await fetch(BASE + p, { ...i, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + T, ...(i.headers || {}) } });
  return { status: r.status, body: await r.json().catch(() => null) };
};

let fails = 0;
const check = (n, c, d = '') => { console.log(`${c ? 'ok  ' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); if (!c) fails++; };
const m = (n) => '$' + (Number(n) || 0).toLocaleString('en-US');

/* ── the safety rails, on a throwaway proposal ───────────────────────────── */

const { data: probe } = await admin.from('proposals').insert({
  tenant_id: '692d8793-4d9f-4c43-a935-bf56cc637553',
  project_id: 'b8ab7fd9-0cc9-443f-b0c8-d8855dc99c3d',
  title: 'RECONCILE PROBE', proposal_number: 'PROBE', amount: 100, total_amount: 100, status: 'Draft',
}).select().single();
await admin.from('proposal_lines').insert([
  { proposal_id: probe.id, sort_order: 0, description: 'Overshoot', total_price: 150 },
]);

const over = await api(`/api/proposals/${probe.id}/lines`);
check('lines exceeding the header are reported as such',
  over.body.remedy === 'sync-header', `difference ${m(over.body.difference)}, remedy ${over.body.remedy}`);
const refused = await api(`/api/proposals/${probe.id}/lines`, { method: 'PATCH', body: JSON.stringify({ mode: 'add-line' }) });
check('adding a line is refused when it would widen the gap',
  refused.status === 409, `${refused.status}: ${refused.body?.error}`);
const synced = await api(`/api/proposals/${probe.id}/lines`, { method: 'PATCH', body: JSON.stringify({ mode: 'sync-header' }) });
check('syncing the header reconciles it', synced.body?.reconciles === true, `header now ${m(synced.body?.headerAmount)}`);
const noop = await api(`/api/proposals/${probe.id}/lines`, { method: 'PATCH', body: JSON.stringify({}) });
check('reconciling an already-reconciled proposal is a no-op',
  noop.body?.alreadyReconciled === true, 'nothing changed');

await admin.from('proposal_lines').delete().eq('proposal_id', probe.id);
await admin.from('proposals').delete().eq('id', probe.id);

/* ── the two live mismatches ─────────────────────────────────────────────── */

console.log('\n--- live proposals ---');
const { data: props } = await admin.from('proposals')
  .select('id, proposal_number, title, amount, total_amount')
  .order('proposal_number');

for (const p of props) {
  const before = await api(`/api/proposals/${p.id}/lines`);
  if (before.status !== 200) { console.log(`  ${p.proposal_number}: ${before.body?.error}`); continue; }
  if (before.body.lines.length === 0) { console.log(`  ${(p.proposal_number || '?').padEnd(14)} no breakdown — nothing to reconcile`); continue; }
  if (before.body.reconciles) { console.log(`  ${(p.proposal_number || '?').padEnd(14)} already reconciles at ${m(before.body.headerAmount)}`); continue; }

  console.log(`  ${(p.proposal_number || '?').padEnd(14)} states ${m(before.body.headerAmount)}, lines ${m(before.body.lineTotal)}, gap ${m(before.body.difference)}`);
  const fixed = await api(`/api/proposals/${p.id}/lines`, {
    method: 'PATCH', body: JSON.stringify({ mode: before.body.remedy }),
  });
  check(`${p.proposal_number} reconciles`, fixed.body?.reconciles === true,
    `${fixed.body?.mode}; header ${m(fixed.body?.headerAmount)} = lines ${m(fixed.body?.baseTotal)}`);

  const after = await api(`/api/proposals/${p.id}/lines`);
  check(`${p.proposal_number} keeps its contract price`,
    after.body.headerAmount === before.body.headerAmount,
    `${m(after.body.headerAmount)} — the number the client agreed to did not move`);
  check(`${p.proposal_number} names the money it was missing`,
    after.body.lines.some((l) => /General Conditions/.test(l.description) && Math.abs(Number(l.total_price) - before.body.difference) < 0.01),
    after.body.lines.at(-1)?.description);
}

/* ── nothing left mismatched ─────────────────────────────────────────────── */

console.log('\n--- final state ---');
let outstanding = 0;
for (const p of props) {
  const r = await api(`/api/proposals/${p.id}/lines`);
  if (r.status !== 200) continue;
  const state = r.body.lines.length === 0 ? 'no breakdown'
    : r.body.reconciles ? `reconciles at ${m(r.body.headerAmount)}`
    : `STILL OFF BY ${m(r.body.difference)}`;
  if (!r.body.reconciles && r.body.lines.length > 0) outstanding++;
  console.log(`  ${(p.proposal_number || '?').padEnd(14)} ${state}`);
}
check('no proposal with a breakdown is left mismatched', outstanding === 0, `${outstanding} outstanding`);

console.log(fails === 0 ? '\nPROPOSAL MISMATCHES RESOLVED\n' : `\n${fails} CHECK(S) FAILED\n`);
process.exit(fails === 0 ? 0 : 1);
