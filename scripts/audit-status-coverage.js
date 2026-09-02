#!/usr/bin/env node
/**
 * audit-status-coverage — does the status system cover what the database holds?
 *
 * A status the map does not know renders as a neutral pill with the raw value.
 * That is the right failure — better than a blank cell — but it is still a
 * miss: no tone, no rail position, no instruction. This catches those.
 *
 * The live values below were read straight out of the production database
 * (every distinct status across all fourteen tables). Only `takeoffs` has a
 * CHECK constraint, so the rest are free text and this list is what is
 * genuinely in use rather than what was intended. Re-run the query in the
 * header comment and update the fixture when statuses change.
 *
 *   SELECT 'rfis' t, status, count(*) FROM rfis GROUP BY status UNION ALL …
 *
 * Also checks the map is internally sound: every tone exists, every stage
 * index is inside its module's rail, and no module claims a rail with fewer
 * than two stages.
 */

const fs = require('fs');

/* Read from production 2026-09-02. */
const LIVE = {
  bid_packages: ['open', 'draft'],
  change_orders: ['approved', 'pending', 'architect_review', 'pm_review', 'submitted', 'rejected', 'pricing', 'pending_owner'],
  daily_logs: ['submitted', 'draft'],
  inspections: ['pending', 'passed'],
  invoices: ['approved', 'pending', 'draft'],
  lien_waivers: ['pending', 'draft', 'received', 'sent', 'signed', 'required'],
  pay_applications: ['draft', 'submitted', 'certified'],
  rfis: ['open', 'closed', 'submitted', 'under_review', 'pending', 'draft', 'answered'],
  safety_incidents: ['open', 'closed'],
  submittals: ['approved', 'under_review', 'pending', 'submitted', 'approved_as_noted', 'resubmit', 'revise_and_resubmit'],
  takeoffs: ['complete', 'pending', 'failed'],
  timesheets: ['submitted'],
};

const src = fs.readFileSync('lib/status-system.ts', 'utf8');

const VALID_TONES = ['draft', 'active', 'waiting', 'good', 'warn', 'bad', 'done'];

/* Parse MODULES: each `key: { … }` block at two-space indent inside MODULES. */
const modulesStart = src.indexOf('export const MODULES');
const body = src.slice(modulesStart);

const modules = {};
{
  const modRe = /^  ([a-z_]+): \{$/gm;
  let m;
  const starts = [];
  while ((m = modRe.exec(body)) !== null) starts.push({ name: m[1], at: m.index });
  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1].at : body.length;
    const block = body.slice(starts[i].at, end);

    const stagesM = block.match(/stages: \[([^\]]*)\]/);
    const stages = stagesM
      ? [...stagesM[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((x) => x[1])
      : [];

    const statuses = {};
    const stRe = /^\s{6}([a-z_]+):\s*\{([^}]*)\}/gm;
    let s;
    while ((s = stRe.exec(block)) !== null) {
      const inner = s[2];
      const tone = (inner.match(/tone: '([a-z]+)'/) || [])[1];
      const stage = inner.match(/stage: (\d+)/);
      statuses[s[1]] = { tone, stage: stage ? Number(stage[1]) : null };
    }

    modules[starts[i].name] = { stages, statuses };
  }
}

const problems = [];

if (!Object.keys(modules).length) {
  console.log('PARSE FAILED — read 0 modules out of lib/status-system.ts.');
  process.exit(2);
}

/* 1. Every live value is mapped. */
for (const [table, values] of Object.entries(LIVE)) {
  const mod = modules[table];
  if (!mod) { problems.push(`${table}: in the database but not in the status system at all`); continue; }
  for (const v of values) {
    if (!mod.statuses[v]) {
      problems.push(`${table}.${v}: live in the database, no entry in the status map`);
    }
  }
}

/* 2. Internal soundness. */
for (const [name, mod] of Object.entries(modules)) {
  if (mod.stages.length === 1) {
    problems.push(`${name}: a rail of one stage is not a flow — use a pill only`);
  }
  for (const [status, def] of Object.entries(mod.statuses)) {
    if (!def.tone) {
      problems.push(`${name}.${status}: no tone`);
    } else if (!VALID_TONES.includes(def.tone)) {
      problems.push(`${name}.${status}: tone '${def.tone}' is not one of ${VALID_TONES.join(', ')}`);
    }
    if (def.stage !== null && def.stage >= mod.stages.length) {
      problems.push(`${name}.${status}: stage ${def.stage} but the rail only has ${mod.stages.length} stages`);
    }
  }
  /* Every stage should be reachable by some status, or the rail shows a dot
     nothing can ever fill. */
  for (let i = 0; i < mod.stages.length; i++) {
    const reachable = Object.values(mod.statuses).some((d) => d.stage === i);
    if (!reachable) problems.push(`${name}: stage ${i} ("${mod.stages[i]}") has no status that reaches it`);
  }
}

const totalStatuses = Object.values(modules).reduce((n, m) => n + Object.keys(m.statuses).length, 0);
const totalLive = Object.values(LIVE).reduce((n, v) => n + v.length, 0);

console.log('='.repeat(72));
console.log('STATUS SYSTEM — does it cover what the database holds?');
console.log('='.repeat(72));
console.log(`  modules mapped        ${Object.keys(modules).length}`);
console.log(`  statuses mapped       ${totalStatuses}`);
console.log(`  live values checked   ${totalLive}`);
console.log('');
console.log(`  PROBLEMS              ${problems.length}`);
if (problems.length) {
  console.log('');
  problems.forEach((p) => console.log(`  ${p}`));
}
process.exitCode = problems.length ? 1 : 0;
