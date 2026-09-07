/**
 * Live check — runs the proposal builder and the selections engine over the
 * REAL rows in the database and prints what the endpoints will return.
 *
 * The unit tests prove the arithmetic against fixtures. This proves the
 * arithmetic is being fed the right columns from the real tables, which is the
 * half that fixtures cannot catch — every bug in this area so far has been a
 * field-name mismatch, not a formula.
 *
 * Read-only. Run: node scripts/proposal-selections-live.mjs
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

const { buildProposal, exclusionsText } = await import('../lib/proposal-build.ts');
const { normaliseSelection, selectionTotals, selectionFlags, variance } = await import('../lib/selections.ts');

const m = (n) => '$' + (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

/* ── selections ──────────────────────────────────────────────────────────── */

console.log('\n=== SELECTIONS (live rows) ===');
const { data: sel, error: sErr } = await db.from('selections').select('*').order('category');
if (sErr) { console.error('selections read failed:', sErr.message); process.exit(1); }

for (const r of sel) {
  const n = normaliseSelection(r);
  const stored = r.variance == null ? 'null' : String(r.variance);
  const derived = n.variance == null ? 'null' : String(n.variance);
  const drift = stored !== derived ? `  <-- STORED SAYS ${stored}` : '';
  console.log(
    `  ${(n.item || '(no name)').padEnd(16)} allow ${m(r.allowance).padStart(11)}  picked ${(n.cost == null ? '—' : m(n.cost)).padStart(11)}` +
    `  variance ${derived.padStart(8)}  ${n.effective_status}${drift}`
  );
}

const t = selectionTotals(sel);
console.log(`\n  allowance total      ${m(t.allowanceTotal)}`);
console.log(`  selected total       ${m(t.selectedTotal)}`);
console.log(`  net variance         ${m(t.varianceTotal)}   (decided rows only)`);
console.log(`  still undecided      ${m(t.allowanceOutstanding)}   (${t.pending} item(s), counted neither way)`);
console.log(`  over / under         ${m(t.overTotal)} over on ${t.overCount} · ${m(t.underTotal)} under`);
console.log(`\n  OLD page arithmetic  sum(cost) - sum(allowance) = ${m(t.selectedTotal - t.allowanceTotal)}  <-- reported as "under allowance"`);
console.log(`  NEW page arithmetic  ${t.varianceTotal < 0 ? m(-t.varianceTotal) + ' OVER' : m(t.varianceTotal) + ' under'} on decided rows, ${m(t.allowanceOutstanding)} outstanding`);

console.log('\n  flags:');
for (const f of selectionFlags(sel)) console.log(`    [${f.severity}] ${f.item}: ${f.message}`);

/* ── proposal from estimate ──────────────────────────────────────────────── */

console.log('\n=== PROPOSAL FROM ESTIMATE (live takeoff) ===');
const { data: tks } = await db.from('takeoffs').select('id, name, project_id').limit(200);
let chosen = null;
for (const tk of tks ?? []) {
  const { count } = await db.from('takeoff_line_items').select('id', { count: 'exact', head: true }).eq('takeoff_id', tk.id);
  if ((count ?? 0) > 0) { chosen = { ...tk, count }; break; }
}
if (!chosen) { console.log('  no takeoff has line items'); process.exit(0); }
console.log(`  takeoff: ${chosen.name}  (${chosen.count} lines)`);

const { data: li } = await db.from('takeoff_line_items').select('*').eq('takeoff_id', chosen.id).order('sort_order');

for (const mode of ['markup', 'margin']) {
  const b = buildProposal(li, { granularity: 'division', upliftMode: mode, upliftPct: 15 });
  console.log(`\n  --- 15% ${mode} ---`);
  for (const l of b.lines) console.log(`    ${l.description.padEnd(28)} ${m(l.total_price).padStart(12)}   ${l.notes ?? ''}`);
  console.log(`    ${'COST'.padEnd(28)} ${m(b.costTotal).padStart(12)}`);
  console.log(`    ${'PROPOSAL TOTAL'.padEnd(28)} ${m(b.sellTotal).padStart(12)}   realised margin ${b.marginPct}%`);
}

const byLine = buildProposal(li, { granularity: 'line', upliftMode: 'markup', upliftPct: 15 });
console.log('\n  --- every line, 15% markup ---');
for (const l of byLine.lines) {
  console.log(`    ${l.description.padEnd(28)} ${String(l.quantity ?? '').padStart(7)} ${(l.unit ?? '').padEnd(5)} @ ${m(l.unit_price).padStart(10)} = ${m(l.total_price).padStart(12)}`);
}
console.log(`    ${'TOTAL'.padEnd(28)} ${m(byLine.sellTotal).padStart(48)}`);
console.log(`\n  same total both ways: ${byLine.sellTotal === buildProposal(li, { granularity: 'division', upliftMode: 'markup', upliftPct: 15 }).sellTotal ? 'YES' : 'NO'}`);
if (byLine.exclusions.length) console.log(`  exclusions: ${exclusionsText(byLine.exclusions)}`);
if (byLine.omitted.length) console.log(`  omitted: ${byLine.omitted.map((o) => o.description).join(', ')}`);

/* ── existing proposal_lines: header vs breakdown ────────────────────────── */

console.log('\n=== EXISTING PROPOSALS — header vs lines ===');
const { data: props } = await db.from('proposals').select('id, title, proposal_number, amount, total_amount');
for (const p of props) {
  const { data: lines } = await db.from('proposal_lines').select('total_price, is_optional').eq('proposal_id', p.id);
  const base = (lines ?? []).filter((l) => !l.is_optional).reduce((s, l) => s + (Number(l.total_price) || 0), 0);
  const header = Number(p.total_amount ?? p.amount) || 0;
  if (!lines?.length) { console.log(`  ${(p.proposal_number || '?').padEnd(14)} ${m(header).padStart(14)}   no breakdown`); continue; }
  const diff = header - base;
  console.log(`  ${(p.proposal_number || '?').padEnd(14)} ${m(header).padStart(14)}   lines ${m(base).padStart(14)}   ${Math.abs(diff) < 0.01 ? 'reconciles' : `DIFFERS BY ${m(Math.abs(diff))}`}`);
}

console.log('');
process.exit(0);
