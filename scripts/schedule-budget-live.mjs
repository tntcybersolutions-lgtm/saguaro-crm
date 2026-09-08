/**
 * Runs the schedule and budget engines over the REAL rows and prints what the
 * screens will say.
 *
 * The unit tests prove the arithmetic against fixtures. This proves the
 * arithmetic is being fed the right columns from the real tables, which is the
 * half fixtures cannot catch — and every bug found in this codebase so far has
 * been a field-name mismatch rather than a formula.
 *
 * Read-only. Run: npx tsx scripts/schedule-budget-live.mjs
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

const { assessSchedule } = await import('../lib/schedule-health.ts');
const { assessBudget } = await import('../lib/budget-health.ts');

const m = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US');

/* ── schedule ────────────────────────────────────────────────────────────── */

console.log('\n=== SCHEDULE (live tasks) ===\n');
const { data: tasks, error: tErr } = await db.from('schedule_tasks').select('*');
if (tErr) { console.error(tErr.message); process.exit(1); }

/* Per project, because that is how the screen assesses it. Judging three
   unrelated schedules as one invents duplicate names across projects and a
   critical path that spans jobs sharing no logic. */
for (const pid of [...new Set((tasks ?? []).map((t) => t.project_id))]) {
  const mine = tasks.filter((t) => t.project_id === pid);
  const sh = assessSchedule(mine);
  console.log(`  ── ${pid}`);
  console.log(`     ${sh.totals.tasks} tasks · ${sh.totals.complete} complete · ${sh.totals.inProgress} in progress`);
  console.log(`     logic: ${sh.totals.withLogic}/${sh.totals.tasks} linked, ${sh.totals.openEnds} dangling · critical ${sh.totals.critical} · near ${sh.totals.nearCritical}`);
  console.log(`     plan ${sh.network.projectFinish} · FORECAST ${sh.forecast.projectFinish.to} (${sh.forecast.frozen.length} started tasks at actuals, ${sh.forecast.moves.length} rescheduled)`);
  console.log(`     SCORE ${sh.score}   ${sh.blockers} blockers, ${sh.warnings} warnings, ${sh.checks.filter((c) => c.passed).length}/${sh.checks.length} checks passed`);
  for (const c of sh.failed) console.log(`       [${c.severity}] ${c.title}${c.threshold ? `   (${c.threshold})` : ''}`);
  console.log();
}

/* ── budget ──────────────────────────────────────────────────────────────── */

console.log('\n=== BUDGET (live lines) ===\n');
const { data: lines, error: bErr } = await db.from('budget_lines').select('*').order('cost_code');
if (bErr) { console.error(bErr.message); process.exit(1); }

const bh = assessBudget(lines ?? []);
const t = bh.totals;
console.log(`  original ${m(t.original)}  + approved ${m(t.approvedChanges)}  = revised ${m(t.revised)}`);
if (Math.abs(t.original + t.approvedChanges - t.revised) > 0.01) {
  console.log(`  ^^ does NOT foot — ${m(t.revised - t.original - t.approvedChanges)} unaccounted`);
}
console.log(`  committed ${m(t.committed)}   spent ${m(t.actual)} (${t.percentSpent}%)   earned ${t.percentComplete}%`);
console.log(`  forecast ${m(t.forecast)}   variance ${t.variance < 0 ? '-' : '+'}${m(Math.abs(t.variance))}`);
console.log(`  SCORE ${bh.score}   ${bh.blockers} blockers, ${bh.warnings} warnings\n`);

for (const f of bh.findings) {
  console.log(`  [${f.severity}] ${f.title}`);
}

console.log('\n  by line:');
for (const l of bh.lines) {
  const f = l.forecast;
  console.log(
    `    ${String(l.cost_code ?? '?').padEnd(9)} budget ${m(f.bac).padStart(11)}  spent ${m(f.ac).padStart(10)}` +
    `  cpi ${String(f.cpi ?? '—').padStart(5)}  forecast ${m(f.recommended).padStart(11)} (${f.method})`,
  );
}

console.log('');
process.exit(0);
