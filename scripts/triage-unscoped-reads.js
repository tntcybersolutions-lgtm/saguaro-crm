#!/usr/bin/env node
/* Triage: of the reads with no tenant filter, which are filtered by a value
   that came straight from the request?
 *
 * Most unscoped reads in this codebase are name lookups — ids collected from
 * rows that WERE tenant-filtered, then fed back in as `.in('id', ids)`. Those
 * cannot return another tenant's row, because the ids could only have come
 * from this tenant's data.
 *
 * The ones that can leak are filtered by something the caller supplied:
 * params.someId, body.x, searchParams.get(...). Those decide which row to
 * return from attacker-controlled input on a service-role client, so a bare id
 * from another tenant comes straight back. That is the set worth reading. */

const fs = require('fs');

const r = JSON.parse(fs.readFileSync('audit-tenant-isolation.json', 'utf8'));
const CALLER = /params\.|\bbody\.|searchParams\.get|req\.nextUrl\.searchParams/;

const risky = [];
const derived = [];

for (const f of r.unscopedRead) {
  const src = fs.readFileSync(f.file, 'utf8');
  for (const g of f.findings) {
    /* Re-locate the chain for this finding. */
    const lines = src.split(/\r?\n/);
    const at = lines.slice(0, g.line).join('\n').length;
    const chain = src.slice(at - 200, at + 700).split(/;\s*\n/)[0];
    (CALLER.test(chain) ? risky : derived).push(`${f.file}:${g.line}  ${g.table}`);
  }
}

console.log('='.repeat(72));
console.log('UNSCOPED READS — triaged by where the filter value comes from');
console.log('='.repeat(72));
console.log(`  filtered by caller-supplied input (READ THESE)  ${risky.length}`);
risky.forEach((x) => console.log(`      ${x}`));
console.log('');
console.log(`  filtered by ids derived from scoped rows        ${derived.length}`);
