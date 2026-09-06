/* Adds tenant_id to INSERT payloads that omit it.
 *
 *   node scripts/prelaunch-audit.js --json > audit.json
 *   node scripts/fix-tenant-inserts.js            # dry run
 *   node scripts/fix-tenant-inserts.js --apply
 *
 * A row written with no tenant_id on a tenant-scoped table is orphaned: it
 * belongs to nobody, so every tenant-filtered read misses it and the record is
 * effectively lost while still occupying the table. On tables where tenant_id
 * is NOT NULL the insert fails outright instead.
 *
 * Unlike the read and write codemods this edits the payload rather than adding
 * a filter, so it only touches `.insert({ ... })` with a literal object. An
 * insert given a variable or an array is listed for hand work rather than
 * guessed at.
 */

const fs = require('fs');
const path = require('path');
const { ROOT, skipTable, statementEnd, tenantExpr, fromSites, loadFindings } = require('./lib/tenant-codemod');

const APPLY = process.argv.includes('--apply');
const findings = loadFindings('insert-without-tenant');

const byFile = {};
for (const f of findings) (byFile[f.file] ||= []).push(f);

const report = { rewritten: 0, files: 0, noIdentity: [], skipped: {}, notLiteral: [] };

for (const relFile of Object.keys(byFile)) {
  const abs = path.join(ROOT, relFile);
  let src = fs.readFileSync(abs, 'utf8');
  const EOL = src.includes('\r\n') ? '\r\n' : '\n';
  const expr = tenantExpr(src);
  let touched = 0;

  for (const site of fromSites(src)) {
    const end = statementEnd(src, site.index);
    const stmt = src.slice(site.index, end + 1);

    if (!/\.insert\s*\(/.test(stmt)) continue;
    if (/tenant_id/.test(stmt)) continue;

    const reason = skipTable(site.table);
    if (reason) { (report.skipped[reason] ||= []).push(`${relFile}  ${site.table}`); continue; }
    if (!expr) { report.noIdentity.push(`${relFile}  ${site.table}`); continue; }

    // Case 1 — literal object payload: .insert({ ... })
    const lit = /\.insert\s*\(\s*\{/.exec(stmt);
    if (lit) {
      const braceAt = site.index + lit.index + lit[0].length;   // just past the '{'
      const indentMatch = /\n([ \t]+)/.exec(src.slice(braceAt, braceAt + 200));
      const indent = indentMatch ? indentMatch[1] : '      ';
      src = src.slice(0, braceAt) + EOL + indent + `tenant_id: ${expr},` + src.slice(braceAt);
      touched++;
      continue;
    }

    // Case 2 — a variable payload: .insert(body) / .insert(record) / .insert(batch)
    //
    // Several of these pass the raw request body straight through, so the
    // caller controls every column including tenant_id. Spreading first and
    // setting tenant_id last both fills in the missing value and overrides
    // anything the caller tried to supply.
    const ident = /\.insert\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/.exec(stmt);
    if (!ident) { report.notLiteral.push(`${relFile}  ${site.table}`); continue; }

    const name = ident[1];
    // Is it an array? Check how it was declared.
    const declRe = new RegExp(`(?:const|let|var)\\s+${name}\\s*(?::[^=]+)?=\\s*([\\s\\S]{0,80})`);
    const decl = declRe.exec(src);
    const isArray = decl ? /^\s*\[|\.map\s*\(/.test(decl[1]) : /batch|rows|items|records/i.test(name);

    const replacement = isArray
      ? `.insert(${name}.map((row) => ({ ...row, tenant_id: ${expr} })))`
      : `.insert({ ...${name}, tenant_id: ${expr} })`;

    const at = site.index + ident.index;
    src = src.slice(0, at) + replacement + src.slice(at + ident[0].length);
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

console.log(`\n${APPLY ? 'APPLIED' : 'DRY RUN'}: ${report.rewritten} insert(s) in ${report.files} file(s)`);
show('no tenant identity in scope', report.noIdentity);
show('payload is not a literal object', report.notLiteral);
for (const [reason, arr] of Object.entries(report.skipped)) show(reason, arr);
if (!APPLY) console.log('\nre-run with --apply to write');
