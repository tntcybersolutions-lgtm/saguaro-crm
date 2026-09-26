#!/usr/bin/env node
/**
 * audit-masked-failures — error paths that answer with a success status.
 *
 * WHY THIS EXISTS
 *
 * heatmap/scan returned HTTP 200 with { ok:false, devices:[], walls:[] } when
 * the AI call failed. The shape was deliberate; the status was not. 200 with
 * empty arrays is indistinguishable from "we looked and found nothing", so the
 * client's auto-scan path — which had no else branch — drew nothing and said
 * nothing. A user uploaded a floor plan, pressed scan, and watched the feature
 * do absolutely nothing, for as long as the API key behind it had no credit.
 *
 * CLAUDE.md already forbids the shape:
 *   "return NextResponse.json([]) inside a catch block -- masks errors as success"
 * This finds the ones that are there anyway, plus the near misses: a catch that
 * returns a default value, a catch that swallows entirely, a 2xx paired with a
 * falsy ok/success flag.
 *
 * WHAT IT REPORTS
 *
 *   silent      — a catch that returns nothing and logs nothing. The failure
 *                 leaves no trace at all, which is how the daily-log duplicate
 *                 and the timesheet open-shift collision both stayed hidden.
 *   empty-ok    — a catch returning an empty collection or a zero with a
 *                 success status. Reads as "no data" forever.
 *   ok-false    — an explicit { ok:false } / { success:false } carried on a
 *                 2xx. Honest in the body, lying in the status line, and every
 *                 caller that checks res.ok is fooled.
 *
 * Not every hit is a bug: a list endpoint that degrades to [] on a NON-fatal
 * sub-query is a real pattern, and those say so in a comment. The tool reports
 * whether a nearby comment acknowledges the choice so the two are separable.
 *
 * Usage: node tools/audit-masked-failures.mjs [dir]
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.argv.find((a, i) => i > 1 && !a.startsWith('-')) || 'app/api';

const files = [];
(function walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (/node_modules|\.next/.test(p)) continue;
    if (e.isDirectory()) walk(p);
    else if (/\.ts$/.test(e.name)) files.push(p);
  }
})(ROOT);

/** Everything after `catch` up to the matching close brace, brace-counted. */
function catchBodies(src) {
  const out = [];
  const re = /\bcatch\s*(?:\(([^)]*)\))?\s*\{/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    let depth = 1;
    let i = re.lastIndex;
    while (i < src.length && depth > 0) {
      const c = src[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      i++;
    }
    out.push({ index: m.index, param: (m[1] || '').trim(), body: src.slice(re.lastIndex, i - 1) });
  }
  return out;
}

const findings = [];

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const lineAt = (i) => src.slice(0, i).split(/\r?\n/).length;
  const rel = file.split(path.sep).join('/');

  for (const c of catchBodies(src)) {
    const body = c.body;
    const flat = body.replace(/\s+/g, ' ').trim();
    const stripped = flat.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').trim();
    const line = lineAt(c.index);

    /* A status the route names explicitly. No status on a NextResponse.json
       means 200, which is the whole problem. */
    const statusMatch = body.match(/status:\s*(\d{3})/);
    const status = statusMatch ? Number(statusMatch[1]) : (/return\s+(?:NextResponse|Response)\.json/.test(body) ? 200 : null);
    const returns = /return\s+(?:NextResponse|Response)\.json/.test(body);
    const logs = /console\.(error|warn)|apiError\s*\(|captureException/.test(body);

    const near = src.slice(Math.max(0, c.index - 500), c.index).replace(/\s+/g, ' ');
    const acknowledged = /non-?fatal|best-?effort|degrade|optional|ignore|leave the list|stay manual|private mode|storage unavailable/i.test(
      near + ' ' + flat,
    );

    let kind = null;
    if (!stripped) {
      kind = 'silent';
    } else if (returns && status !== null && status < 400) {
      if (/\bok:\s*false|success:\s*false/.test(body)) kind = 'ok-false';
      else if (/:\s*\[\s*\]|\[\s*\]\s*[,}]|:\s*0\b|:\s*null\b/.test(body)) kind = 'empty-ok';
    }

    if (kind) {
      findings.push({
        file: rel, line, kind, status, logs, acknowledged,
        snippet: stripped.slice(0, 110) || '(empty catch)',
      });
    }
  }
}

const real = findings.filter((f) => !f.acknowledged);
const noted = findings.filter((f) => f.acknowledged);
const byKind = (k) => real.filter((f) => f.kind === k);

console.log(`${findings.length} masked failure path(s) under ${ROOT}.`);
console.log(`${real.length} without a comment claiming the degradation is deliberate.\n`);

for (const k of ['ok-false', 'empty-ok', 'silent']) {
  const rows = byKind(k);
  if (!rows.length) continue;
  const label = {
    'ok-false': 'A 2xx carrying ok:false / success:false — every caller checking res.ok is fooled',
    'empty-ok': 'A catch returning an empty collection on a success status — reads as "no data" forever',
    silent: 'A catch that returns nothing AND logs nothing — the failure leaves no trace',
  }[k];
  console.log(`${label}   (${rows.length})`);
  for (const f of rows) {
    console.log(`  ${f.file}:${f.line}${f.status ? '  HTTP ' + f.status : ''}${f.logs ? '' : '  [unlogged]'}`);
    console.log(`     ${f.snippet}`);
  }
  console.log('');
}
if (noted.length) console.log(`${noted.length} acknowledged as deliberate degradation in a nearby comment.`);
process.exit(real.length ? 1 : 0);
