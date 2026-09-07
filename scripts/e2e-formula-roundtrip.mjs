/**
 * Formulas and assemblies must survive the database.
 *
 * The engine being right is half of it. The other half is that a formula typed
 * into a cell is still there tomorrow — which means the jsonb column, the
 * WRITABLE allow-list on the bulk endpoint, and the grid's load path all have to
 * agree. Those are three separate places to get it wrong, and none of them is
 * covered by a pure-function test.
 *
 * Creates its own takeoff, proves the round trip, and deletes everything it made.
 * Run with the server up: npx tsx scripts/e2e-formula-roundtrip.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

const { recalcRows } = await import('../lib/estimate-formula.ts');
const { expandAssembly, ASSEMBLY_BY_ID } = await import('../lib/estimate-assemblies.ts');

const { data: s, error: sErr } = await anon.auth.signInWithPassword({ email: 'claude.qa@saguarocontrol.net', password: 'Sag-QA-2026!verify' });
if (sErr) { console.error(sErr.message); process.exit(1); }
const T = s.session.access_token;
const BASE = process.env.E2E_BASE || 'http://localhost:3000';
const TENANT = '692d8793-4d9f-4c43-a935-bf56cc637553';
const PROJECT = 'b8ab7fd9-0cc9-443f-b0c8-d8855dc99c3d';

const api = async (p, i = {}) => {
  const r = await fetch(BASE + p, { ...i, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + T, ...(i.headers || {}) } });
  return { status: r.status, body: await r.json().catch(() => null) };
};

let fails = 0;
const check = (n, c, d = '') => { console.log(`${c ? 'ok  ' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); if (!c) fails++; };

/* ── a takeoff of our own ────────────────────────────────────────────────── */

const { data: tk, error: tkErr } = await admin.from('takeoffs')
  .insert({ tenant_id: TENANT, project_id: PROJECT, name: 'FORMULA ROUND-TRIP TEST' })
  .select().single();
if (tkErr) { console.error('takeoff create failed:', tkErr.message); process.exit(1); }
console.log(`\ntakeoff ${tk.id}\n`);

try {
  /* ── save rows carrying formulas ─────────────────────────────────────── */

  const rows = [
    { description: 'Slab on grade', csi_division: '03', quantity: 1200, unit: 'SF',
      unit_material_cost: 6.5, unit_labor_cost: 0, waste_factor_pct: 0, sort_order: 0,
      formulas: { unit_labor_cost: '=MAT*0.65' } },
    { description: 'Rebar', csi_division: '03', quantity: 0, unit: 'LB',
      unit_material_cost: 0.94, waste_factor_pct: 10, sort_order: 1,
      formulas: { quantity: '=C1*0.55' } },
    { description: 'General conditions', csi_division: '01', quantity: 1, unit: 'LS',
      unit_material_cost: 0, sort_order: 2,
      formulas: { unit_material_cost: '=J1*0.08' } },
  ];

  const put = await api(`/api/takeoff/${tk.id}/line-items`, { method: 'PUT', body: JSON.stringify({ rows }) });
  check('rows carrying formulas save', put.status === 200, `${put.status}`);

  /* ── read them back ──────────────────────────────────────────────────── */

  const got = await api(`/api/takeoff/${tk.id}/line-items`);
  check('they read back', got.status === 200 && got.body.lineItems.length === 3, `${got.body.lineItems?.length} rows`);

  const back = got.body.lineItems.sort((a, b) => a.sort_order - b.sort_order);
  check('the formula text survived the round trip',
    back[0].formulas?.unit_labor_cost === '=MAT*0.65',
    `row 1 → ${JSON.stringify(back[0].formulas)}`);
  check('a formula on a different field survived',
    back[1].formulas?.quantity === '=C1*0.55', `row 2 → ${JSON.stringify(back[1].formulas)}`);
  check('a cross-row line-total reference survived',
    back[2].formulas?.unit_material_cost === '=J1*0.08', `row 3 → ${JSON.stringify(back[2].formulas)}`);

  /* ── and still evaluate to the right numbers ─────────────────────────── */

  const calc = recalcRows(back);
  check('no errors on the reloaded sheet', Object.keys(calc.errors).length === 0, JSON.stringify(calc.errors));
  check('same-row arithmetic recomputes',
    Number(calc.rows[0].unit_labor_cost) === 4.225, `${calc.rows[0].unit_labor_cost} = 6.50 × 0.65`);
  check('a cross-row quantity recomputes',
    Number(calc.rows[1].quantity) === 660, `${calc.rows[1].quantity} = 1,200 × 0.55`);

  /* Row 1 total = 1200 × (6.50 + 4.225) = 12,870. 8% of that is 1,029.60. */
  check('a line-total reference recomputes through another row’s formula',
    Math.abs(Number(calc.rows[2].unit_material_cost) - 1029.6) < 0.01,
    `${calc.rows[2].unit_material_cost} = 8% of row 1's $12,870 total`);

  /* ── an assembly expansion persists with its provenance ──────────────── */

  const exp = expandAssembly(ASSEMBLY_BY_ID['partition-stud-gwb'], 240, { startSortOrder: 10 });
  const put2 = await api(`/api/takeoff/${tk.id}/line-items`, {
    method: 'PUT',
    body: JSON.stringify({ rows: [...back.map((r) => ({ ...r })), ...exp.lines] }),
  });
  check('an assembly expansion saves', put2.status === 200, `${put2.status}, ${exp.lines.length} lines`);

  const got2 = await api(`/api/takeoff/${tk.id}/line-items`);
  const expanded = got2.body.lineItems.filter((r) => r.assembly_id === 'partition-stud-gwb');
  check('every expanded line kept its assembly id',
    expanded.length === exp.lines.length, `${expanded.length} of ${exp.lines.length}`);
  check('the quantities persisted exactly',
    Number(expanded.find((r) => /Metal stud/.test(r.description))?.quantity) === 181,
    `${expanded.find((r) => /Metal stud/.test(r.description))?.quantity} studs`);
  /* The basis no longer names "16 inches" because spacing is a parameter now —
     it explains the rule instead of one setting of it, which is the point. */
  check('the basis note persisted',
    /per spacing interval/.test(expanded.find((r) => /Metal stud/.test(r.description))?.notes ?? ''),
    `"${expanded.find((r) => /Metal stud/.test(r.description))?.notes}"`);

  /* ── clearing a formula clears it in the database too ────────────────── */

  const cleared = got2.body.lineItems.map((r) => (r.sort_order === 0 ? { ...r, formulas: null, unit_labor_cost: 9.99 } : r));
  await api(`/api/takeoff/${tk.id}/line-items`, { method: 'PUT', body: JSON.stringify({ rows: cleared }) });
  const got3 = await api(`/api/takeoff/${tk.id}/line-items`);
  const row1 = got3.body.lineItems.find((r) => r.sort_order === 0);
  check('typing over a formula clears it rather than being overwritten next recalc',
    (row1.formulas === null || row1.formulas === undefined) && Number(row1.unit_labor_cost) === 9.99,
    `formulas=${JSON.stringify(row1.formulas)}, labor=${row1.unit_labor_cost}`);

  /* ── the numeric columns stay usable by everything else ──────────────── */

  const { data: raw } = await admin.from('takeoff_line_items')
    .select('description, quantity, unit_material_cost, formulas')
    .eq('takeoff_id', tk.id).order('sort_order').limit(3);
  check('numeric columns hold plain numbers, never formula text',
    raw.every((r) => r.unit_material_cost === null || typeof r.unit_material_cost === 'number'),
    'the proposal builder and every report keep working unchanged');

} finally {
  await admin.from('takeoff_line_items').delete().eq('takeoff_id', tk.id);
  await admin.from('takeoffs').delete().eq('id', tk.id);
  const { count } = await admin.from('takeoff_line_items').select('id', { count: 'exact', head: true }).eq('takeoff_id', tk.id);
  check('the test takeoff was removed', count === 0, `${count} lines left`);
}

console.log(fails === 0 ? '\nFORMULAS AND ASSEMBLIES SURVIVE THE DATABASE\n' : `\n${fails} CHECK(S) FAILED\n`);
process.exit(fails === 0 ? 0 : 1);
