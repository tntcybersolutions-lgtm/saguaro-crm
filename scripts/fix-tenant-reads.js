/* Adds the missing tenant filter to cross-tenant READ sites.
 *
 *   node scripts/prelaunch-audit.js --json > audit.json
 *   node scripts/fix-tenant-reads.js            # dry run
 *   node scripts/fix-tenant-reads.js --apply
 *
 * createServerClient() uses the service role key, which bypasses RLS, so on
 * these routes .eq('tenant_id', ...) is the only thing keeping one tenant's
 * SELECT from returning another tenant's rows.
 *
 * The filter goes in immediately after .select(...), which keeps it ahead of
 * .single()/.maybeSingle()/.order()/.limit() — appending at the end of the
 * chain would land after a terminator and change the result shape.
 *
 * Only rewrites when the file has a tenant identity in scope and the table
 * genuinely has a tenant_id column. Everything else is listed for hand work.
 */

const fs = require('fs');
const path = require('path');
const {
  ROOT, skipTable, matchParen, statementEnd, tenantExpr, fromSites, loadFindings,
} = require('./lib/tenant-codemod');

const APPLY = process.argv.includes('--apply');
const findings = loadFindings('cross-tenant-read');

const byFile = {};
for (const f of findings) (byFile[f.file] ||= []).push(f);

const report = { rewritten: 0, files: 0, noIdentity: [], skipped: {}, unparsed: [] };

for (const relFile of Object.keys(byFile)) {
  const abs = path.join(ROOT, relFile);
  let src = fs.readFileSync(abs, 'utf8');
  const expr = tenantExpr(src);
  let touched = 0;

  for (const site of fromSites(src)) {
    const end = statementEnd(src, site.index);
    const stmt = src.slice(site.index, end + 1);

    // Reads only — writes are handled by fix-tenant-writes.js.
    if (!/\.select\s*\(/.test(stmt)) continue;
    if (/\.(update|delete|upsert|insert)\s*\(/.test(stmt)) continue;
    if (/tenant_id/.test(stmt)) continue;

    const reason = skipTable(site.table);
    if (reason) { (report.skipped[reason] ||= []).push(`${relFile}  ${site.table}`); continue; }
    if (!expr) { report.noIdentity.push(`${relFile}  ${site.table}`); continue; }

    // Insert right after .select(...) so it precedes any terminator.
    const sm = /\.select\s*\(/.exec(stmt);
    const openRel = sm.index + sm[0].length - 1;
    const closeRel = matchParen(stmt, openRel);
    if (closeRel < 0) { report.unparsed.push(`${relFile}  ${site.table}`); continue; }

    const at = site.index + closeRel + 1;
    src = src.slice(0, at) + `.eq('tenant_id', ${expr})` + src.slice(at);
    touched++;
  }

  if (touched) {
    report.rewritten += touched;
    report.files++;
    if (APPLY) fs.writeFileSync(abs, src);
    console.log(`${String(touched).padStart(2)}  ${relFile}`);
  }
}

const show = (label, arr) => {
  if (!arr || !arr.length) return;
  const uniq = [...new Set(arr)];
  console.log(`\n${label} (${uniq.length}) — by hand:`);
  uniq.slice(0, 15).forEach((x) => console.log('    ' + x));
  if (uniq.length > 15) console.log(`    ... ${uniq.length - 15} more`);
};

console.log(`\n${APPLY ? 'APPLIED' : 'DRY RUN'}: ${report.rewritten} read sites in ${report.files} files`);
show('no tenant identity in scope', report.noIdentity);
for (const [reason, arr] of Object.entries(report.skipped)) show(reason, arr);
show('could not parse', report.unparsed);
if (!APPLY) console.log('\nre-run with --apply to write');
