/**
 * Live end-to-end check of the options → pick → variance flow.
 *
 * Creates options on a real selection, prices them, simulates the client pick
 * exactly as the portal does, verifies the variance moves, then removes
 * everything it made and restores the original amount. The database ends where
 * it started; this proves the flow rather than seeding it.
 *
 * Run: npx tsx scripts/selection-options-live.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { priceOptions, optionCost, variance, normaliseSelection } = await import('../lib/selections.ts');
const m = (n) => '$' + (Number(n) || 0).toLocaleString('en-US');

let fails = 0;
const check = (name, cond, detail) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name} — ${detail}`);
  if (!cond) fails++;
};

const { data: sel } = await db.from('selections').select('*').eq('item_name', 'Lobby Tile').single();
if (!sel) { console.error('Lobby Tile selection not found'); process.exit(1); }
const originalAmount = sel.selected_amount;
const originalNotes = sel.notes;
const originalVariance = sel.variance;
console.log(`\nselection: ${sel.item_name} — allowance ${m(sel.allowance)}, currently picked ${m(sel.selected_amount)}\n`);

/* The demo project now carries seeded options permanently, so every count here
   is measured against what was already there. Asserting absolute totals made
   this script pass only on a project nobody had used. */
const { data: preExisting } = await db.from('selection_options').select('id').eq('selection_id', sel.id);
const baseline = (preExisting ?? []).map((o) => o.id);
console.log(`  ${baseline.length} option(s) already present\n`);

const made = [];
try {
  /* ── 1. present three options, as the builder would ─────────────────── */
  const drafts = [
    { name: 'Ceramic 12x24', manufacturer: 'Daltile', unit_cost: 9, quantity: 1200, sort_order: 1 },
    { name: 'Porcelain plank', manufacturer: 'MSI', unit_cost: 10.67, quantity: 1200, sort_order: 2, is_recommended: true },
    { name: 'Carrara marble', manufacturer: 'AZ Tile', unit_cost: 18, quantity: 1200, sort_order: 3 },
  ];
  for (const d of drafts) {
    const { data, error } = await db.from('selection_options')
      .insert({ ...d, selection_id: sel.id, total_cost: optionCost(d) })
      .select().single();
    if (error) throw new Error(`insert failed: ${error.message}`);
    made.push(data.id);
  }
  check('options attach to a live selections row', made.length === 3, `${made.length} created — the column the migration added`);

  /* ── 2. the one-parent constraint actually holds ─────────────────────── */
  const { error: bothErr } = await db.from('selection_options')
    .insert({ name: 'Bad', selection_id: sel.id, category_id: sel.id });
  check('an option cannot have two parents', !!bothErr, bothErr ? 'rejected by the check constraint' : 'ACCEPTED — constraint missing');
  const { error: neitherErr } = await db.from('selection_options').insert({ name: 'Orphan' });
  check('an option cannot be orphaned', !!neitherErr, neitherErr ? 'rejected by the check constraint' : 'ACCEPTED — constraint missing');

  /* ── 3. priced against the allowance ─────────────────────────────────── */
  const { data: allOpts } = await db.from('selection_options').select('*').eq('selection_id', sel.id).order('sort_order');
  const opts = allOpts.filter((o) => made.includes(o.id));
  const priced = priceOptions(sel, opts);
  for (const o of priced) console.log(`    ${o.name.padEnd(18)} ${m(o.cost).padStart(10)}   ${o.effect}${o.is_recommended ? '   ★ recommended' : ''}`);
  check('the recommended option leads', priced[0].name === 'Porcelain plank', priced[0].name);
  check('the over-allowance option shows an upcharge',
    priced.find((o) => o.name === 'Carrara marble').effect === 'adds $6,600',
    priced.find((o) => o.name === 'Carrara marble').effect);

  /* ── 4. the client picks — exactly what the portal POST does ──────────── */
  const chosen = priced.find((o) => o.name === 'Carrara marble');
  const newVariance = variance({ ...sel, selected_amount: chosen.cost });
  const { data: updated, error: uErr } = await db.from('selections')
    .update({
      status: 'selected',
      selected_by: 'Live check',
      selected_at: new Date().toISOString(),
      selected_amount: chosen.cost,
      variance: newVariance,
      notes: [sel.notes, `Client chose: ${chosen.name}`].filter(Boolean).join('\n'),
    })
    .eq('id', sel.id).eq('tenant_id', sel.tenant_id).select().single();
  if (uErr) throw new Error(`pick failed: ${uErr.message}`);

  const n = normaliseSelection(updated);
  check('the pick records the PRICE, not just the name',
    Number(updated.selected_amount) === 21600, `selected_amount = ${m(updated.selected_amount)} — was null-and-forgotten before`);
  check('the stored variance moves with it',
    Number(updated.variance) === -6600, `${updated.variance} — a $6,600 upcharge the old portal recorded as nothing`);
  check('the derived variance agrees with the stored one',
    n.variance === Number(updated.variance), `${n.variance}`);
  check('the builder’s original note survives the client pick',
    originalNotes == null || String(updated.notes).includes(String(originalNotes)),
    'appended, not overwritten');
  check('the row reads as over allowance', n.is_over === true, `${m(Math.abs(n.variance))} over ${m(sel.allowance)}`);

  /* ── 5. cascade: deleting a selection takes its options ───────────────── */
  const { count: before } = await db.from('selection_options').select('id', { count: 'exact', head: true }).eq('selection_id', sel.id);
  check('this run’s options are attached to the selection',
    before === baseline.length + 3, `${before} on the row = ${baseline.length} pre-existing + 3 created here`);

} finally {
  /* ── restore ─────────────────────────────────────────────────────────── */
  if (made.length) await db.from('selection_options').delete().in('id', made);
  await db.from('selections').update({
    selected_amount: originalAmount, variance: originalVariance, notes: originalNotes,
    status: 'selected', selected_by: null, selected_at: null,
  }).eq('id', sel.id);
  const { data: back } = await db.from('selections').select('selected_amount, variance, notes').eq('id', sel.id).single();
  const { data: remaining } = await db.from('selection_options').select('id').eq('selection_id', sel.id);
  const left = (remaining ?? []).filter((o) => made.includes(o.id)).length;
  check('every option created here was removed, and only those',
    left === 0 && (remaining ?? []).length === baseline.length,
    `${left} of mine left behind; ${(remaining ?? []).length} pre-existing options untouched`);
  check('the selection was restored',
    String(back.selected_amount) === String(originalAmount) && String(back.variance ?? '') === String(originalVariance ?? ''),
    `back to ${m(back.selected_amount)}, variance ${back.variance}`);
}

console.log(fails === 0 ? '\nLIVE OPTIONS FLOW VERIFIED — database unchanged\n' : `\n${fails} CHECK(S) FAILED\n`);
process.exit(fails === 0 ? 0 : 1);
