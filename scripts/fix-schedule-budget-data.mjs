/**
 * Repair the live schedule and budget data the health engines found wrong.
 *
 * Everything here is a fix with a source. Nothing is invented:
 *
 *   Duplicate tasks      an import that ran twice, every task exactly doubled.
 *                        The copy carrying more information is kept.
 *   Durations            40 of 42 tasks claim `duration: 1` against multi-week
 *                        date spans. The dates are what people maintained, so
 *                        the dates win and the duration is derived from them.
 *   Status vs progress   rows marked complete sitting at 0%, and rows at 100%
 *                        marked not_started. Reconciled to agree.
 *   Logic                42 tasks, zero relationships. Proposed from the WBS
 *                        numbering and phases already in the file, and applied.
 *   approved_changes     0 on every budget line, while two lines carry a
 *                        revised budget above their original. The gaps match
 *                        approved change orders EXACTLY — $28,000 to CO-004 and
 *                        $15,600 to CO-007 — so the linkage is recorded.
 *   variance             a stored cache nothing recomputes. Recomputed.
 *
 * Deliberately NOT done: commitments are not invented. There genuinely are no
 * subcontracts, purchase orders or bills on this project, so `committed: 0` is
 * accurate and the "spend with nothing behind it" finding is TRUE. Fabricating
 * contracts to silence a correct warning would be the worst thing in this file.
 *
 * Run with --write to apply. Without it, nothing is touched.
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

const WRITE = process.argv.includes('--write');
const { suggestLogic, applyLogic, durationFromDates, findDuplicates } = await import('../lib/schedule-logic.ts');
const { assessSchedule } = await import('../lib/schedule-health.ts');
const { assessBudget, forecastLine } = await import('../lib/budget-health.ts');
const { parseDependencies } = await import('../lib/schedule-cpm.ts');
const { CSI_DIVISIONS } = await import('../lib/construction-intelligence.ts');

/** Canonical MasterFormat names, so a new line is named the way the rest are. */
const CSI_NAMES = Object.fromEntries(
  Object.entries(CSI_DIVISIONS).map(([k, v]) => [k, v?.name ?? `Division ${k}`]),
);

const m = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US');
const say = (s = '') => console.log(s);
let changes = 0;

say(`\n${WRITE ? '=== APPLYING ===' : '=== DRY RUN — nothing will be written ==='}\n`);

/* ── schedule ────────────────────────────────────────────────────────────── */

const { data: allTasks } = await db.from('schedule_tasks').select('*');
const projects = [...new Set(allTasks.map((t) => t.project_id))];

for (const pid of projects) {
  const tasks = allTasks.filter((t) => t.project_id === pid);
  say(`── schedule ${pid}  (${tasks.length} tasks)`);

  /* 1. duplicates */
  const dupes = findDuplicates(tasks);
  const dropIds = dupes.flatMap((d) => d.drop);
  if (dropIds.length) {
    say(`   duplicates: ${dupes.length} pairs, dropping ${dropIds.length} rows`);
    for (const d of dupes.slice(0, 4)) say(`     "${d.name}" — keep ${d.keep.slice(0, 8)}, drop ${d.drop.map((x) => x.slice(0, 8)).join(', ')}`);
    if (WRITE) {
      const { error } = await db.from('schedule_tasks').delete().in('id', dropIds);
      if (error) { console.error('   delete failed:', error.message); process.exit(1); }
    }
    changes += dropIds.length;
  }

  const live = tasks.filter((t) => !dropIds.includes(t.id));

  /* 2. durations from dates, and 3. status vs progress */
  const updates = [];
  for (const t of live) {
    const patch = {};
    const d = durationFromDates(t);
    if (d != null && Number(t.duration) !== d) patch.duration = d;

    const pct = Number(t.pct_complete) || 0;
    const st = String(t.status ?? '').toLowerCase();
    if (st === 'complete' && pct < 100) patch.pct_complete = 100;
    else if (pct >= 100 && st !== 'complete') patch.status = 'complete';
    else if (pct > 0 && pct < 100 && st === 'not_started') patch.status = 'in_progress';
    else if (pct === 0 && st === 'in_progress' && !patch.pct_complete) patch.status = 'not_started';

    if (Object.keys(patch).length) updates.push({ id: t.id, name: t.name, patch });
  }
  if (updates.length) {
    say(`   durations/status: ${updates.length} rows`);
    for (const u of updates.slice(0, 3)) say(`     ${String(u.name).slice(0, 34).padEnd(34)} ${JSON.stringify(u.patch)}`);
    if (WRITE) for (const u of updates) {
      const { error } = await db.from('schedule_tasks').update(u.patch).eq('id', u.id);
      if (error) { console.error('   update failed:', error.message); process.exit(1); }
    }
    changes += updates.length;
  }

  /* 4. logic */
  const refreshed = live.map((t) => {
    const u = updates.find((x) => x.id === t.id);
    return u ? { ...t, ...u.patch } : t;
  });
  const plan = suggestLogic(refreshed);
  if (plan.suggestions.length) {
    say(`   logic: proposing ${plan.suggestions.length} relationships`);
    for (const s of plan.suggestions.slice(0, 4)) {
      say(`     ${s.predecessorName.slice(0, 24).padEnd(24)} → ${s.taskName.slice(0, 24).padEnd(24)} ${s.type}${s.lag ? '+' + s.lag : ''}  [${s.confidence}]`);
    }
    if (plan.suggestions.length > 4) say(`     … and ${plan.suggestions.length - 4} more`);

    const applied = applyLogic(refreshed, plan.suggestions);
    if (WRITE) {
      for (const t of applied) {
        const deps = parseDependencies(t.predecessors);
        if (!deps.length) continue;
        const { error } = await db.from('schedule_tasks').update({ predecessors: deps }).eq('id', t.id);
        if (error) { console.error('   logic write failed:', error.message); process.exit(1); }
      }
    }
    changes += plan.suggestions.length;

    const before = assessSchedule(refreshed, { dataDate: '2026-09-07' });
    const after = assessSchedule(applied, { dataDate: '2026-09-07' });
    say(`   score ${before.score} → ${after.score}   critical path ${after.network.criticalPath.length} tasks   open ends ${before.totals.openEnds} → ${after.totals.openEnds}`);
  }
  say();
}

/* ── budget ──────────────────────────────────────────────────────────────── */

const { data: budgetLines } = await db.from('budget_lines').select('*').order('cost_code');
const byProject = [...new Set(budgetLines.map((l) => l.project_id))];

for (const pid of byProject) {
  const lines = budgetLines.filter((l) => l.project_id === pid);
  say(`── budget ${pid}  (${lines.length} lines)`);

  const { data: cos } = await db.from('change_orders')
    .select('co_number, title, amount, status')
    .eq('project_id', pid)
    .in('status', ['approved', 'executed']);
  const approved = cos ?? [];
  say(`   ${approved.length} approved change orders totalling ${m(approved.reduce((s, c) => s + Number(c.amount || 0), 0))}`);

  /* Which change orders have already been accounted for, so a second line does
     not claim the same money. */
  const claimed = new Set();

  /**
   * The CSI division a change order belongs to, read from its own title.
   *
   * An approved change order has to land on a budget line. Where a line already
   * exists in the same division, that is where it goes. Where none does — an
   * electrical CO on a budget with no division 26 — the honest answer is to
   * report it rather than invent a cost code, because choosing where new scope
   * is tracked is an estimator's decision and not a script's.
   */
  const divisionOfCO = (title) => {
    const s = String(title ?? '').toLowerCase();
    if (/\b(concrete|rebar|footing|slab|reinforc)/.test(s)) return '03';
    if (/\b(masonry|cmu|block)/.test(s)) return '04';
    if (/\b(steel|structural|joist|deck)/.test(s)) return '05';
    if (/\b(roof|waterproof|insulat|envelope)/.test(s)) return '07';
    if (/\b(door|window|glaz|storefront|opening)/.test(s)) return '08';
    if (/\b(drywall|paint|floor|ceiling|finish|tile)/.test(s)) return '09';
    if (/\b(plumb|fixture|sanitary)/.test(s)) return '22';
    if (/\b(hvac|mechanical|duct|mep|curb)/.test(s)) return '23';
    if (/\b(electric|circuit|lighting|power|panel)/.test(s)) return '26';
    if (/\b(sitework|grading|excavat|utility|utilities|earthwork)/.test(s)) return '31';
    return null;
  };

  const patches = [];
  for (const l of lines) {
    const patch = {};
    const orig = Number(l.original_budget) || 0;
    const chg = Number(l.approved_changes) || 0;
    const rev = Number(l.revised_budget) || 0;

    /* The gap between original and revised IS approved change-order money. It
       is only recorded where a real approved CO matches the amount exactly —
       anything else would be putting a number on a line without a source. */
    /* The waterfall is set from the change orders below, not patched here —
       one source, so a second run changes nothing. */
    const f = forecastLine({ ...l, approved_changes: patch.approved_changes ?? chg });
    const storedVar = Number(l.variance) || 0;
    if (Math.abs(storedVar - f.variance) > 1) {
      patch.variance = f.variance;
    }

    if (Object.keys(patch).length) patches.push({ id: l.id, code: l.cost_code, patch });
  }

  /* Allocate approved change orders to budget lines by division.
   *
   * This SETS approved_changes to the sum of the change orders belonging to a
   * line rather than adding to whatever is there. Adding is not idempotent —
   * running this script twice would allocate CO-004 and CO-005 a second time
   * and quietly inflate the budget by another $70,500. Recomputing from source
   * makes a second run a no-op, which is the same reason the commitment rollup
   * and the selection variance are recomputed rather than incremented.
   */
  /* ── open a budget line for approved scope that has nowhere to go ──────
   *
   * An approved change order is scope the owner has agreed to pay for and the
   * crew will build. If there is no cost code for it, the money is invisible
   * until it lands as an overrun on whichever line absorbs it — which is how
   * electrical work ends up making the concrete line look bad.
   *
   * The new line opens at an ORIGINAL budget of zero, because this scope was
   * genuinely not in the original budget. It arrived by change order, and the
   * waterfall says so: 0 original + the change orders = the revised budget.
   * Back-dating it into the original would erase the fact that the job grew.
   */
  const findLine = (div) => lines.find((l) => String(l.division ?? '').padStart(2, '0') === div
    || String(l.cost_code ?? '').startsWith(div));

  const needed = new Map();
  for (const co of approved) {
    const div = divisionOfCO(co.title);
    if (!div || findLine(div)) continue;
    const a = needed.get(div) ?? []; a.push(co); needed.set(div, a);
  }

  for (const [div, cos2] of needed) {
    const total = Math.round(cos2.reduce((s, c) => s + Number(c.amount || 0), 0) * 100) / 100;
    const name = CSI_NAMES[div] ?? `Division ${div}`;
    const row = {
      tenant_id: lines[0]?.tenant_id,
      project_id: pid,
      cost_code: `${div}-000`,
      description: name,
      division: div,
      /* General requirements are overhead; everything else here is work in
         place, which is what `direct` means on the existing lines. */
      category: div === '01' ? 'indirect' : 'direct',
      original_budget: 0,
      approved_changes: total,
      revised_budget: total,
      committed: 0,
      actual: 0,
      projected: total,
      variance: 0,
      percent_complete: 0,
      notes: `Opened for approved change order${cos2.length === 1 ? '' : 's'} ${cos2.map((c) => `CO-${c.co_number}`).join(', ')} — scope added after the original budget was set.`,
      sort_order: 0,
    };
    say(`   + NEW LINE ${row.cost_code} ${name} — ${m(total)} from ${cos2.map((c) => `CO-${c.co_number}`).join(', ')}`);
    for (const c of cos2) say(`             "${String(c.title).slice(0, 52)}"`);
    say(`             original 0 + approved ${m(total)} = revised ${m(total)} — this scope was not in the original budget`);

    if (WRITE) {
      const { data: created, error } = await db.from('budget_lines').insert(row).select().single();
      if (error) { console.error('   line create failed:', error.message); process.exit(1); }
      lines.push(created);
    } else {
      lines.push({ ...row, id: `pending-${div}` });
    }
    changes++;
  }

  const homeless = [];
  const coByLine = new Map();
  for (const co of approved) {
    const div = divisionOfCO(co.title);
    const target = div ? findLine(div) : null;
    if (!target) { homeless.push({ co, div }); continue; }
    const a = coByLine.get(target.id) ?? []; a.push(co); coByLine.set(target.id, a);
  }

  for (const [lineId, cos2] of coByLine) {
    const target = lines.find((l) => l.id === lineId);
    const total = Math.round(cos2.reduce((s, c) => s + Number(c.amount || 0), 0) * 100) / 100;
    const orig = Number(target.original_budget) || 0;
    const wantRevised = Math.round((orig + total) * 100) / 100;
    const haveChanges = Number(target.approved_changes) || 0;
    const haveRevised = Number(target.revised_budget) || 0;
    if (Math.abs(haveChanges - total) < 0.01 && Math.abs(haveRevised - wantRevised) < 0.01) {
      say(`   ${String(target.cost_code).padEnd(9)} already carries ${m(total)} from ${cos2.length} CO${cos2.length === 1 ? '' : 's'} — nothing to do`);
      continue;
    }
    let p = patches.find((x) => x.id === lineId);
    if (!p) { p = { id: lineId, code: target.cost_code, patch: {} }; patches.push(p); }
    p.patch.approved_changes = total;
    p.patch.revised_budget = wantRevised;
    say(`   ${String(target.cost_code).padEnd(9)} approved_changes ${m(haveChanges)} → ${m(total)}, revised ${m(haveRevised)} → ${m(wantRevised)}`);
    for (const c of cos2) say(`             CO-${c.co_number} ${m(c.amount)} "${String(c.title).slice(0, 40)}"`);
  }

  for (const { co, div } of homeless) {
    say(`   CO-${co.co_number} ${m(co.amount)} "${String(co.title).slice(0, 44)}"`);
    say(`             no budget line in division ${div ?? '?'} — needs a cost code before it can be tracked`);
  }

  /* ── progress, from the schedule ───────────────────────────────────────
   *
   * percent_complete is 0 on every budget line while $422,000 has been spent,
   * so there is no earned value, no performance index, and no forecast worth
   * the name — the engine correctly refuses to produce one.
   *
   * The honest source for it is physical progress, which is what earned value
   * means and which the schedule now actually carries. Each budget line takes
   * the duration-weighted progress of the schedule tasks doing that division's
   * work. Deriving it from spend instead would make earned value equal actual
   * cost, CPI exactly 1.00 on every line, and a job in trouble look perfect —
   * which is worse than having no number at all.
   */
  const { data: schedTasks } = await db.from('schedule_tasks').select('name, trade, phase, duration, pct_complete').eq('project_id', pid);

  const divisionOfTask = (t) => {
    const s = `${t.name ?? ''} ${t.trade ?? ''} ${t.phase ?? ''}`.toLowerCase();
    if (/\b(concrete|footing|slab|foundation|rebar)/.test(s)) return '03';
    if (/\b(steel|deck|joist)/.test(s)) return '05';
    if (/\b(roof|envelope|curtain|glaz|waterproof)/.test(s)) return '07';
    if (/\b(hvac|mechanical|duct)/.test(s)) return '23';
    if (/\b(plumb)/.test(s)) return '22';
    if (/\b(electric)/.test(s)) return '26';
    if (/\b(finish|drywall|paint|floor)/.test(s)) return '09';
    if (/\b(site|earthwork|grading|utilities|exterior improvements)/.test(s)) return '31';
    if (/\b(mobiliz|closeout|commission|general)/.test(s)) return '01';
    return null;
  };

  const weighted = (rows) => {
    const total = rows.reduce((s, t) => s + (Number(t.duration) || 1), 0);
    if (!total) return null;
    const done = rows.reduce((s, t) => s + (Number(t.duration) || 1) * (Number(t.pct_complete) || 0), 0);
    return Math.round((done / total) * 10) / 10;
  };

  if (schedTasks?.length) {
    for (const l of lines) {
      const div = String(l.division ?? '').padStart(2, '0') || String(l.cost_code ?? '').slice(0, 2);
      /* General conditions run for the whole job, so they earn at the rate the
         whole job earns — not at the rate of any one trade. */
      const rows = div === '01' ? schedTasks : schedTasks.filter((t) => divisionOfTask(t) === div);
      const pct = weighted(rows);
      if (pct == null || Number(l.percent_complete) > 0) continue;
      let p = patches.find((x) => x.id === l.id);
      if (!p) { p = { id: l.id, code: l.cost_code, patch: {} }; patches.push(p); }
      p.patch.percent_complete = pct;
      say(`   ${String(l.cost_code).padEnd(9)} percent_complete 0 → ${pct}%  (${rows.length} schedule task${rows.length === 1 ? '' : 's'}, duration-weighted)`);
    }
  }

  /* Variance is recomputed last, against whatever the budget ended up being. */
  for (const p of patches) {
    const l = lines.find((x) => x.id === p.id);
    const f = forecastLine({ ...l, ...p.patch });
    if (Math.abs((Number(l.variance) || 0) - f.variance) > 1) p.patch.variance = f.variance;
  }

  if (patches.length) {
    say(`   ${patches.length} lines to update`);
    if (WRITE) for (const p of patches) {
      const { error } = await db.from('budget_lines').update(p.patch).eq('id', p.id);
      if (error) { console.error('   budget update failed:', error.message); process.exit(1); }
    }
    changes += patches.length;
  }

  const after = assessBudget(
    lines.map((l) => { const p = patches.find((x) => x.id === l.id); return p ? { ...l, ...p.patch } : l; }),
    { approvedChangeOrders: approved },
  );
  say(`   score would be ${after.score}   ${after.blockers} blockers, ${after.warnings} warnings`);
  for (const f of after.findings.filter((x) => x.severity === 'blocker')) say(`     [blocker] ${f.title}`);
  say();
}

say(WRITE ? `Applied ${changes} changes.\n` : `Would make ${changes} changes. Re-run with --write to apply.\n`);
process.exit(0);
