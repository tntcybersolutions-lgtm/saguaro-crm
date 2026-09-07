/**
 * End-to-end test of proposals + client selections against the running app.
 *
 * Unlike the *-live.mjs scripts, which call the engine functions directly, this
 * goes over real HTTP with a real session token, so it exercises the whole path:
 * auth -> getUser -> requirePermission -> tenant scoping -> query -> response.
 * That is the half a pure-function test cannot reach, and every bug in this area
 * so far has lived exactly there.
 *
 * Creates a persistent test account (kept, not deleted) and seeds demo options.
 *
 * Run with the dev server up:  npx tsx scripts/e2e-proposals-selections.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const BASE = process.env.E2E_BASE || 'http://localhost:3000';
const TENANT = '692d8793-4d9f-4c43-a935-bf56cc637553';
const PROJECT = 'b8ab7fd9-0cc9-443f-b0c8-d8855dc99c3d';
const EMAIL = 'claude.qa@saguarocontrol.net';
const PASSWORD = 'Sag-QA-2026!verify';

let fails = 0;
const check = (name, cond, detail = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) fails++;
};
const m = (n) => '$' + (Number(n) || 0).toLocaleString('en-US');

/* ── 1. the test account (persistent) ────────────────────────────────────── */

let userId;
{
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = list?.users?.find((u) => u.email === EMAIL);
  if (existing) {
    userId = existing.id;
    await admin.auth.admin.updateUserById(userId, { password: PASSWORD, email_confirm: true });
    console.log(`\nreusing test account ${EMAIL}`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: EMAIL, password: PASSWORD, email_confirm: true,
      user_metadata: { full_name: 'Claude QA' },
    });
    if (error) { console.error('createUser failed:', error.message); process.exit(1); }
    userId = data.user.id;
    console.log(`\ncreated test account ${EMAIL}`);
  }
  // profiles.role 'admin' is what grants Full on every permission category.
  const { error: pErr } = await admin.from('profiles')
    .upsert({ id: userId, email: EMAIL, tenant_id: TENANT, role: 'admin', full_name: 'Claude QA' }, { onConflict: 'id' });
  if (pErr) { console.error('profile upsert failed:', pErr.message); process.exit(1); }
  console.log(`  id ${userId}\n  tenant ${TENANT}\n  password ${PASSWORD}\n`);
}

/* ── 2. a real session, the same one the browser would hold ──────────────── */

const anon = createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: sess, error: sErr } = await anon.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
if (sErr) { console.error('sign-in failed:', sErr.message); process.exit(1); }
const TOKEN = sess.session.access_token;
check('the test account signs in and gets a session', !!TOKEN, `token ${TOKEN.slice(0, 12)}…`);

const api = async (path, init = {}) => {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}`, ...(init.headers || {}) },
  });
  let body = null;
  try { body = await res.json(); } catch { /* not JSON — a 500 HTML page, usually */ }
  /* Never hand back a null body: a crash inside the harness reads as a harness
     bug, when what it actually means is the route returned an error page. */
  if (body === null) body = { error: `non-JSON response (HTTP ${res.status})` };
  return { status: res.status, body };
};

/* ── 3. auth actually gates these routes ─────────────────────────────────── */

{
  const bare = await fetch(BASE + '/api/selections/list?projectId=' + PROJECT);
  check('an unauthenticated read is refused', bare.status === 401, `${bare.status}`);
  const badTok = await fetch(BASE + '/api/selections/list?projectId=' + PROJECT, { headers: { Authorization: 'Bearer not.a.jwt' } });
  check('a junk token is refused', badTok.status === 401, `${badTok.status}`);
}

/* ── 4. selections read, through the real stack ──────────────────────────── */

const sel = await api(`/api/selections/list?projectId=${PROJECT}`);
check('GET /api/selections/list returns 200 with a session', sel.status === 200, `${sel.status}`);
check('rows come back normalised for the UI',
  sel.body.selections.every((s) => 'item' in s && 'cost' in s && 'variance' in s),
  `${sel.body.selections.length} rows carry item/cost/variance`);

const bath = sel.body.selections.find((s) => s.item === 'Bath Fixtures');
check('the live over-allowance row reports its real variance',
  bath && bath.variance === -2500, `Bath Fixtures variance ${bath?.variance} (column still says ${bath?.selected_amount ? '0' : '?'})`);
check('an undecided row has no cost, not zero',
  sel.body.selections.find((s) => s.item === 'Paint Colors')?.cost === null, 'null');
check('totals separate decided money from outstanding',
  sel.body.totals.varianceTotal === -300 && sel.body.totals.allowanceOutstanding === 8000,
  `net ${m(sel.body.totals.varianceTotal)}, outstanding ${m(sel.body.totals.allowanceOutstanding)}`);
check('flags come back ranked',
  sel.body.flags.length > 0 && sel.body.flags[0].severity === 'critical',
  `${sel.body.flags.length} flags, first: ${sel.body.flags[0]?.message}`);

/* ── 5. seed demo options through the API ────────────────────────────────── */

const SEED = {
  'Lobby Tile': [
    { name: 'Ceramic 12x24', manufacturer: 'Daltile', unit_cost: 9, quantity: 1200, sort_order: 1,
      image_url: 'https://images.unsplash.com/photo-1600566752355-35792bedcfea?w=400&q=70' },
    { name: 'Porcelain Plank', manufacturer: 'MSI Surfaces', unit_cost: 10.67, quantity: 1200, sort_order: 2, is_recommended: true,
      image_url: 'https://images.unsplash.com/photo-1615873968403-89e068629265?w=400&q=70' },
    { name: 'Carrara Marble', manufacturer: 'AZ Tile', unit_cost: 18, quantity: 1200, sort_order: 3,
      image_url: 'https://images.unsplash.com/photo-1600607686527-6fb886090705?w=400&q=70' },
  ],
  'Paint Colors': [
    { name: 'Builder Standard — Eggshell', manufacturer: 'Sherwin-Williams', unit_cost: 2.1, quantity: 3200, sort_order: 1 },
    { name: 'Emerald Low-VOC', manufacturer: 'Sherwin-Williams', unit_cost: 2.5, quantity: 3200, sort_order: 2, is_recommended: true },
    { name: 'Designer Palette — 4 accent walls', manufacturer: 'Benjamin Moore', unit_cost: 3.15, quantity: 3200, sort_order: 3 },
  ],
  'Bath Fixtures': [
    { name: 'Moen Chrome Package', manufacturer: 'Moen', unit_cost: 1450, quantity: 14, sort_order: 1, is_recommended: true },
    { name: 'Kohler Brushed Nickel', manufacturer: 'Kohler', unit_cost: 1750, quantity: 14, sort_order: 2 },
    { name: 'Brizo Matte Black', manufacturer: 'Brizo', unit_cost: 2400, quantity: 14, sort_order: 3 },
  ],
};

console.log('\n--- seeding demo options ---');
for (const row of sel.body.selections) {
  const drafts = SEED[row.item];
  if (!drafts) continue;
  // Idempotent: clear what a previous run seeded before re-seeding.
  const cur = await api(`/api/selections/${row.id}/options`);
  for (const o of cur.body.options ?? []) {
    await api(`/api/selections/${row.id}/options?optionId=${o.id}`, { method: 'DELETE' });
  }
  for (const d of drafts) {
    const r = await api(`/api/selections/${row.id}/options`, { method: 'POST', body: JSON.stringify(d) });
    if (r.status !== 200) { check(`seed ${d.name}`, false, `${r.status} ${JSON.stringify(r.body)}`); }
  }
  const after = await api(`/api/selections/${row.id}/options`);
  check(`${row.item}: ${drafts.length} options presented`, after.body.options.length === drafts.length,
    after.body.options.map((o) => `${o.name} ${m(o.cost)} (${o.effect})`).join(' | '));
}

/* ── 6. option pricing is right against the real allowances ──────────────── */

{
  const tile = sel.body.selections.find((s) => s.item === 'Lobby Tile');
  const opts = (await api(`/api/selections/${tile.id}/options`)).body.options;
  check('the recommended option is returned first', opts[0].name === 'Porcelain Plank', opts[0].name);
  check('an over-allowance option shows the upcharge',
    opts.find((o) => o.name === 'Carrara Marble').effect === 'adds $6,600',
    opts.find((o) => o.name === 'Carrara Marble').effect);
  check('the currently-picked amount is not falsely matched',
    opts.every((o) => o.isChosen === false), 'no seeded option is priced at the existing $12,800 pick');
}

/* ── 7. recompute writes the derived variance back ───────────────────────── */

{
  /* Poison the column back to the state the live data was found in — 0 on every
     row, including the one $2,500 over — so recompute has something real to fix.
     Asserting against already-correct data proves nothing. */
  await admin.from('selections').update({ variance: 0 }).eq('project_id', PROJECT);
  const before = await admin.from('selections').select('id,variance').eq('project_id', PROJECT);
  check('the stored column is wrong before recompute',
    before.data.every((r) => Number(r.variance) === 0 && r.variance !== null),
    `${before.data.map((r) => r.variance).join(', ')} — the original live state`);

  const rc = await api('/api/selections/recompute', { method: 'POST', body: JSON.stringify({ projectId: PROJECT }) });
  check('POST /api/selections/recompute succeeds', rc.status === 200, `${rc.status}, updated ${rc.body?.updated}`);
  check('it corrected every row it needed to', rc.body?.updated === 3, `${rc.body?.updated} of 3`);

  const after = await admin.from('selections').select('id,item_name,variance').eq('project_id', PROJECT);
  const b = after.data.find((r) => r.item_name === 'Bath Fixtures');
  const p = after.data.find((r) => r.item_name === 'Paint Colors');
  check('the over-allowance row now stores -2500', Number(b.variance) === -2500, `${b.variance}`);
  check('the undecided row stores NULL, not 0', p.variance === null, `${p.variance} — 0 would mean "decided, exactly on budget"`);

  const again = await api('/api/selections/recompute', { method: 'POST', body: JSON.stringify({ projectId: PROJECT }) });
  check('recompute is idempotent', again.body?.updated === 0, `second run updated ${again.body?.updated} rows`);
}

/* ── 7b. an undecided selection stays undecided ──────────────────────────── */

{
  /* selections.variance and selected_amount both defaulted to 0, and the create
     route coerced a blank price with `Number(...) || 0`. Between them every new
     selection was born claiming a decision had been made, at no cost, exactly on
     budget — the root cause of the variance-0-everywhere bug. */
  const made = await api('/api/selections/create', {
    method: 'POST',
    body: JSON.stringify({ projectId: PROJECT, category: 'Tile', item: 'E2E — undecided', allowance: 9000 }),
  });
  check('a selection created with no price succeeds', made.status === 200, `${made.status}`);
  const newId = made.body.selection?.id;

  const row = await admin.from('selections').select('selected_amount, variance, status').eq('id', newId).single();
  check('a brand-new selection has NO amount, not 0',
    row.data.selected_amount === null, `${row.data.selected_amount} — 0 would mean "chosen, and it costs nothing"`);
  check('and NO variance, not 0',
    row.data.variance === null, `${row.data.variance} — 0 would mean "exactly on allowance"`);

  const listed = (await api(`/api/selections/list?projectId=${PROJECT}`)).body.selections.find((s) => s.id === newId);
  check('it reads as pending, with the allowance still outstanding',
    listed.effective_status === 'pending' && listed.cost === null && listed.variance === null,
    `${listed.effective_status}, cost ${listed.cost}, variance ${listed.variance}`);

  const priced = await api(`/api/selections/${newId}`, { method: 'PUT', body: JSON.stringify({ cost: 10500 }) });
  check('setting a price updates the cached variance in the same write',
    priced.status === 200 && Number(priced.body.selection.variance) === -1500,
    `variance ${priced.body.selection?.variance} (9,000 - 10,500)`);

  const zeroed = await api(`/api/selections/${newId}`, { method: 'PUT', body: JSON.stringify({ cost: 0 }) });
  check('choosing a $0 option IS a decision',
    Number(zeroed.body.selection.selected_amount) === 0 && Number(zeroed.body.selection.variance) === 9000,
    `amount 0, variance ${zeroed.body.selection?.variance} — the full allowance comes back`);

  const cleared = await api(`/api/selections/${newId}`, { method: 'PUT', body: JSON.stringify({ cost: '' }) });
  check('clearing the price returns it to undecided, not to $0',
    cleared.body.selection.selected_amount === null && cleared.body.selection.variance === null,
    `amount ${cleared.body.selection?.selected_amount}, variance ${cleared.body.selection?.variance}`);

  const del = await api(`/api/selections/${newId}`, { method: 'DELETE' });
  check('the test selection was removed', del.status === 200, `${del.status}`);
}

/* ── 8. proposal from estimate ───────────────────────────────────────────── */

let proposalId;
{
  const pv = await api('/api/proposals/from-estimate', {
    method: 'POST', body: JSON.stringify({ projectId: PROJECT, preview: true, granularity: 'division', upliftMode: 'markup', upliftPct: 15 }),
  });
  check('preview builds without writing', pv.status === 200 && pv.body.preview === true,
    `${pv.body.lines?.length} lines, ${m(pv.body.sellTotal)}, margin ${pv.body.marginPct}%`);

  const { count: beforeCount } = await admin.from('proposals').select('id', { count: 'exact', head: true }).eq('project_id', PROJECT);

  const marg = await api('/api/proposals/from-estimate', {
    method: 'POST', body: JSON.stringify({ projectId: PROJECT, preview: true, upliftMode: 'margin', upliftPct: 15 }),
  });
  check('margin mode sells higher than markup at the same percentage',
    marg.body.sellTotal > pv.body.sellTotal, `${m(marg.body.sellTotal)} vs ${m(pv.body.sellTotal)}`);
  check('margin mode delivers the margin asked for', marg.body.marginPct === 15, `${marg.body.marginPct}%`);

  const bad = await api('/api/proposals/from-estimate', {
    method: 'POST', body: JSON.stringify({ projectId: PROJECT, preview: true, upliftMode: 'margin', upliftPct: 100 }),
  });
  check('a 100% margin is rejected, not returned as Infinity', bad.status === 400, `${bad.status}: ${bad.body?.error}`);

  const { count: afterPreview } = await admin.from('proposals').select('id', { count: 'exact', head: true }).eq('project_id', PROJECT);
  check('no preview wrote a proposal', afterPreview === beforeCount, `${beforeCount} before, ${afterPreview} after 3 previews`);

  const made = await api('/api/proposals/from-estimate', {
    method: 'POST', body: JSON.stringify({ projectId: PROJECT, granularity: 'division', upliftMode: 'markup', upliftPct: 15, title: 'DEMO — Mesa Commerce Center' }),
  });
  check('POST creates the proposal', made.status === 200 && !!made.body.proposal?.id, `${made.status}`);
  proposalId = made.body.proposal?.id;
  check('the header amount matches the built total',
    Number(made.body.proposal.total_amount) === pv.body.sellTotal, `${m(made.body.proposal.total_amount)}`);
  check('lines were written alongside it', made.body.lines?.length === pv.body.lines.length, `${made.body.lines?.length} lines`);
  check('it joins the existing version sequence', /^v\d+\.0$/.test(made.body.proposal.proposal_number), made.body.proposal.proposal_number);
}

/* ── 9. the breakdown reads back and reconciles ──────────────────────────── */

{
  const lines = await api(`/api/proposals/${proposalId}/lines`);
  check('GET /api/proposals/[id]/lines returns the breakdown', lines.status === 200, `${lines.body.lines?.length} lines`);
  check('a generated proposal reconciles with its own lines',
    lines.body.reconciles === true, `header ${m(lines.body.headerAmount)} vs lines ${m(lines.body.lineTotal)}`);

  // A hand-entered proposal from before this feature existed.
  const legacy = await api('/api/proposals/22222222-2222-2222-2222-222222222201/lines');
  check('a legacy proposal reports its mismatch instead of hiding it',
    legacy.body.reconciles === false && Math.abs(legacy.body.difference) > 1,
    `differs by ${m(Math.abs(legacy.body.difference))}`);

  const put = await api(`/api/proposals/${proposalId}/lines`, {
    method: 'PUT',
    body: JSON.stringify({ syncHeader: true, lines: [
      { description: 'Concrete package', total_price: 20000 },
      { description: 'Waterproofing', total_price: 5000 },
      { description: 'Site lighting upgrade', total_price: 4000, is_optional: true },
    ] }),
  });
  check('PUT replaces the breakdown', put.status === 200 && put.body.lines.length === 3, `${put.body.lines?.length} lines`);
  check('optional scope stays out of the base total', put.body.lineTotal === 25000, `${m(put.body.lineTotal)}`);

  const after = await api(`/api/proposals/${proposalId}/lines`);
  check('syncHeader pulled the header to the base lines',
    after.body.headerAmount === 25000 && after.body.reconciles === true, `${m(after.body.headerAmount)}`);
  check('the optional line is reported separately', after.body.optionalTotal === 4000, `${m(after.body.optionalTotal)}`);
}

/* ── 10. tenant isolation on the new routes ──────────────────────────────── */

{
  const other = await admin.from('proposals').select('id, tenant_id').neq('tenant_id', TENANT).limit(1);
  if (other.data?.length) {
    const r = await api(`/api/proposals/${other.data[0].id}/lines`);
    check('another tenant’s proposal is not readable', r.status === 404, `${r.status}`);
  } else {
    console.log('  (no other-tenant proposal to test against)');
  }
  const otherSel = await admin.from('selections').select('id').neq('tenant_id', TENANT).limit(1);
  if (otherSel.data?.length) {
    const r = await api(`/api/selections/${otherSel.data[0].id}/options`);
    check('another tenant’s selection options are not readable', r.status === 404, `${r.status}`);
  }
  const fake = await api('/api/proposals/from-estimate', {
    method: 'POST', body: JSON.stringify({ projectId: PROJECT, takeoffId: '00000000-0000-0000-0000-000000000000' }),
  });
  check('a takeoff id that is not on this project is refused', fake.status === 404, `${fake.status}`);
}

/* ── 11. clean up only what this run created ─────────────────────────────── */

if (proposalId) {
  await admin.from('proposals').delete().eq('id', proposalId).eq('tenant_id', TENANT);
  const { count } = await admin.from('proposal_lines').select('id', { count: 'exact', head: true }).eq('proposal_id', proposalId);
  check('deleting the proposal cascades to its lines', count === 0, `${count} left`);
}

console.log(`\n${fails === 0 ? 'END-TO-END PASSED' : fails + ' CHECK(S) FAILED'} — demo options left in place, test account kept\n`);
process.exit(fails === 0 ? 0 : 1);
