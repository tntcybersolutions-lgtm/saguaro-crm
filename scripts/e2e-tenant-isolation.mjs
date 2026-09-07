/**
 * Tenant isolation on the proposal + selection routes.
 *
 * The main e2e run skipped these checks because every proposal and selection in
 * the database belongs to one tenant, so "another tenant's row is not readable"
 * was vacuously true. This builds a real second tenant, proves the QA account
 * cannot reach any of it through the API, and removes it again.
 *
 * `proposal_lines` and `selection_options` are the ones that matter: neither has
 * a tenant_id of its own, both are scoped only through their parent, and a route
 * that forgets to check the parent hands over another company's priced
 * breakdown to anyone who can guess a uuid.
 *
 * Run with the dev server up:  npx tsx scripts/e2e-tenant-isolation.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

const BASE = process.env.E2E_BASE || 'http://localhost:3000';
const EMAIL = 'claude.qa@saguarocontrol.net';
const PASSWORD = 'Sag-QA-2026!verify';

let fails = 0;
const check = (name, cond, detail = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) fails++;
};

const { data: sess, error: sErr } = await anon.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
if (sErr) { console.error('sign-in failed:', sErr.message); process.exit(1); }
const TOKEN = sess.session.access_token;

const api = async (path, init = {}) => {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}`, ...(init.headers || {}) },
  });
  let body = null;
  try { body = await res.json(); } catch { body = { error: `non-JSON (HTTP ${res.status})` }; }
  return { status: res.status, body };
};

/* ── build a foreign tenant ──────────────────────────────────────────────── */

/* projects.tenant_id references auth.users(id) — in this schema a tenant IS the
   owning user's id, which is why every profile's tenant_id equals its own id.
   So a foreign tenant means a second auth user. */
const FOREIGN_EMAIL = `iso-test-${randomUUID().slice(0, 8)}@saguarocontrol.net`;
const { data: fu, error: fuErr } = await admin.auth.admin.createUser({
  email: FOREIGN_EMAIL, password: randomUUID() + 'Aa1!', email_confirm: true,
});
if (fuErr) { console.error('foreign user create failed:', fuErr.message); process.exit(1); }
const foreignTenant = fu.user.id;
const ids = { authUser: fu.user.id };
console.log(`\nbuilding foreign tenant ${foreignTenant} (${FOREIGN_EMAIL})\n`);

try {
  const ins = async (table, row) => {
    const { data, error } = await admin.from(table).insert(row).select().single();
    if (error) throw new Error(`${table}: ${error.message}`);
    return data;
  };

  const proj = await ins('projects', { tenant_id: foreignTenant, name: 'ISOLATION TEST project' });
  ids.project = proj.id;

  const sel = await ins('selections', {
    tenant_id: foreignTenant, project_id: proj.id,
    category: 'Flooring', item_name: 'FOREIGN Lobby Tile', allowance: 50000, selected_amount: 61000, status: 'selected',
  });
  ids.selection = sel.id;

  const opt = await ins('selection_options', {
    selection_id: sel.id, name: 'FOREIGN option', unit_cost: 61000, quantity: 1, total_cost: 61000,
  });
  ids.option = opt.id;

  const prop = await ins('proposals', {
    tenant_id: foreignTenant, project_id: proj.id, title: 'FOREIGN proposal',
    proposal_number: 'ISO-001', amount: 990000, total_amount: 990000, status: 'sent',
  });
  ids.proposal = prop.id;

  await ins('proposal_lines', { proposal_id: prop.id, description: 'FOREIGN secret scope', total_price: 990000, sort_order: 0 });

  const tk = await ins('takeoffs', { tenant_id: foreignTenant, project_id: proj.id, name: 'FOREIGN takeoff' });
  ids.takeoff = tk.id;
  await ins('takeoff_line_items', {
    tenant_id: foreignTenant, takeoff_id: tk.id, description: 'FOREIGN concrete',
    quantity: 100, unit: 'CY', unit_material_cost: 500,
  });

  console.log('  seeded: project, selection, option, proposal + line, takeoff + line\n');

  /* ── the QA account must not reach any of it ──────────────────────────── */

  const a = await api(`/api/proposals/${ids.proposal}/lines`);
  check('another tenant’s proposal breakdown is not readable', a.status === 404,
    `${a.status} — proposal_lines has no tenant_id, so a missed parent check leaks it`);
  check('and no line content came back', !a.body.lines || a.body.lines.length === 0,
    JSON.stringify(a.body).slice(0, 90));

  const b = await api(`/api/proposals/${ids.proposal}/lines`, {
    method: 'PUT', body: JSON.stringify({ lines: [{ description: 'INJECTED', total_price: 1 }] }),
  });
  check('another tenant’s breakdown cannot be overwritten', b.status === 404, `${b.status}`);
  const { count: stillThere } = await admin.from('proposal_lines').select('id', { count: 'exact', head: true }).eq('proposal_id', ids.proposal);
  check('the foreign proposal still has its own line', stillThere === 1, `${stillThere} line(s)`);

  const c = await api(`/api/selections/${ids.selection}/options`);
  check('another tenant’s selection options are not readable', c.status === 404,
    `${c.status} — selection_options has no tenant_id either`);

  const d = await api(`/api/selections/${ids.selection}/options`, {
    method: 'POST', body: JSON.stringify({ name: 'INJECTED', unit_cost: 1 }),
  });
  check('an option cannot be added to another tenant’s selection', d.status === 404, `${d.status}`);

  const e = await api(`/api/selections/${ids.selection}/options?optionId=${ids.option}`, { method: 'DELETE' });
  check('another tenant’s option cannot be deleted', e.status === 404, `${e.status}`);
  const { count: optLeft } = await admin.from('selection_options').select('id', { count: 'exact', head: true }).eq('id', ids.option);
  check('the foreign option survived the delete attempt', optLeft === 1, `${optLeft}`);

  const f = await api('/api/proposals/from-estimate', {
    method: 'POST', body: JSON.stringify({ projectId: ids.project, preview: true }),
  });
  check('a proposal cannot be built from another tenant’s project', f.status === 403 || f.status === 404,
    `${f.status}: ${f.body?.error ?? ''}`);

  /* The nastiest shape: my own project, their takeoff. Without the ownership
     check on takeoffId this prices another company's estimate into a proposal
     on my project. */
  const g = await api('/api/proposals/from-estimate', {
    method: 'POST', body: JSON.stringify({
      projectId: 'b8ab7fd9-0cc9-443f-b0c8-d8855dc99c3d', takeoffId: ids.takeoff, preview: true,
    }),
  });
  check('my project + their takeoff is refused', g.status === 404,
    `${g.status}: ${g.body?.error ?? ''}`);
  check('and no foreign cost leaked into the response',
    !JSON.stringify(g.body).includes('50000') && !JSON.stringify(g.body).includes('FOREIGN'),
    JSON.stringify(g.body).slice(0, 80));

  const h = await api('/api/selections/recompute', { method: 'POST', body: JSON.stringify({ projectId: ids.project }) });
  check('recompute cannot be aimed at another tenant’s project', h.status === 404, `${h.status}`);
  const { data: untouched } = await admin.from('selections').select('variance').eq('id', ids.selection).single();
  /* Seeded without a variance. Before the defaults were dropped this came back
     0 — the column's DEFAULT 0 was the original bug's root cause, inventing a
     "decided, exactly on budget" answer for every row ever inserted. */
  check('a row seeded without a variance stores NULL, not 0',
    untouched.variance === null, `${untouched.variance}`);

  const i = await api(`/api/selections/list?projectId=${ids.project}`);
  check('listing another tenant’s project returns nothing',
    i.status !== 200 || (i.body.selections ?? []).length === 0,
    `${i.status}, ${(i.body.selections ?? []).length} rows`);

} finally {
  /* ── tear the foreign tenant down ─────────────────────────────────────── */
  if (ids.takeoff) await admin.from('takeoff_line_items').delete().eq('takeoff_id', ids.takeoff);
  if (ids.takeoff) await admin.from('takeoffs').delete().eq('id', ids.takeoff);
  if (ids.proposal) await admin.from('proposal_lines').delete().eq('proposal_id', ids.proposal);
  if (ids.proposal) await admin.from('proposals').delete().eq('id', ids.proposal);
  if (ids.selection) await admin.from('selection_options').delete().eq('selection_id', ids.selection);
  if (ids.selection) await admin.from('selections').delete().eq('id', ids.selection);
  if (ids.project) await admin.from('projects').delete().eq('id', ids.project);
  await admin.from('profiles').delete().eq('id', foreignTenant);
  if (ids.authUser) await admin.auth.admin.deleteUser(ids.authUser);

  const { count: p } = await admin.from('projects').select('id', { count: 'exact', head: true }).eq('tenant_id', foreignTenant);
  const { data: gone } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const stillUser = gone?.users?.some((u) => u.id === foreignTenant);
  check('the foreign tenant was removed', p === 0 && !stillUser, `${p} project(s) left, auth user ${stillUser ? 'STILL PRESENT' : 'deleted'}`);
}

console.log(`\n${fails === 0 ? 'TENANT ISOLATION HELD ON EVERY NEW ROUTE' : fails + ' CHECK(S) FAILED'}\n`);
process.exit(fails === 0 ? 0 : 1);
