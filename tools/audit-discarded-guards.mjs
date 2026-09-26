#!/usr/bin/env node
/**
 * audit-discarded-guards — tenant checks that are written and then ignored.
 *
 * WHY THIS EXISTS
 *
 * Five document routes contained this:
 *
 *   const { data: project } = await db.from('projects')
 *     .select('*').eq('id', body.projectId)
 *     .eq('tenant_id', g.user.tenantId).single();
 *   const p = project as any;              // assigned, never read
 *   const result = await generateNTP({ projectId: body.projectId, ... });
 *
 * The query is correctly scoped. Nothing reads its answer. `.single()` on zero
 * rows returns { data: null, error } instead of throwing, and the error was
 * destructured away, so a project belonging to another company went straight
 * through to the generator.
 *
 * Verified on production before it was fixed: signed in as one tenant, posting
 * another tenant's projectId returned 200 with a real PDF built from THEIR
 * project, and the row was filed under THEIR tenant — saveDocument derives the
 * tenant from the project, not the caller. Five documents about a customer's
 * job landed in that customer's Document Library, created by a different
 * company's login.
 *
 * A guard that is never read is worse than a missing one. It is the shape of
 * safety without the effect, and it reads as done to anybody reviewing it.
 *
 * WHAT IT LOOKS FOR
 *
 * A SELECT filtered on tenant_id, bound to a name, where neither the row nor
 * the error is consulted in the lines that follow. Passing `--json` prints the
 * raw findings for scripting.
 *
 * WHAT IT STILL CANNOT SEE
 *
 * It follows one level of `const p = row as any` aliasing, and it understands
 * the `(row as any)?.field` cast-read this codebase uses everywhere. It does
 * NOT follow assignment aliasing — `templateRow = tpl; if (!templateRow)` —
 * so the two prequalification-portal hits are known false positives, as are
 * any lookup whose check sits more than ~700 characters of code later.
 *
 * Read it as a shortlist to check by hand, not a verdict. Run against the full
 * 697 routes it produced four to review, and all four turned out to be safe;
 * the five document routes it was written for were the only real ones.
 *
 * Usage: node tools/audit-discarded-guards.mjs [dir]
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.argv.find((a) => !a.startsWith('-') && a !== process.argv[0] && a !== process.argv[1]) || 'app/api';
const JSON_OUT = process.argv.includes('--json');

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

const findings = [];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Comments are blanked to spaces before analysis, preserving every offset so
 * line numbers stay true.
 *
 * The first run of this tool flagged the five routes it was written to catch,
 * AFTER they were fixed — because the comment explaining the fix sat between
 * the query and the check and pushed the check past the lookahead. A comment
 * can also hide a real finding by mentioning the binding. Neither should
 * count: only code decides whether a guard is consulted.
 */
function blankComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
}

for (const file of files) {
  const src = blankComments(fs.readFileSync(file, 'utf8'));
  const re =
    /const\s*\{\s*data:\s*(\w+)\s*(?:,\s*error:\s*(\w+)\s*)?\}\s*=\s*await\s+[\s\S]{0,400}?\.eq\(\s*['"]tenant_id['"][\s\S]{0,240}?\.(single|maybeSingle)\(\)/g;

  let m;
  while ((m = re.exec(src)) !== null) {
    const name = m[1];
    const errName = m[2];
    const kind = m[3];
    /* Whitespace is collapsed before testing. Blanking a comment preserves its
       LENGTH, so a long explanatory comment between the query and its check
       still ate the whole lookahead until this line existed. */
    const after = src
      .slice(m.index + m[0].length, m.index + m[0].length + 4000)
      .replace(/\s+/g, ' ')
      .slice(0, 700);

    /* FOLLOW ONE LEVEL OF ALIASING. `const p = project as any;` immediately
       after the query is common here, and the check is then written against
       `p`. weather/route.ts does exactly that and was reported as unguarded
       until this existed. It matters in both directions: documents/ntp used
       the same alias and then never tested it, which is the real bug — so the
       tool has to read the alias rather than assume either answer. */
    const aliasMatch = after.match(/^\s*;?\s*const\s+(\w+)\s*=\s*(\w+)\s+as\s+/);
    const alias = aliasMatch && aliasMatch[2] === name ? aliasMatch[1] : null;
    const names = alias ? [name, alias] : [name];
    /* Grouped. Without the (?:…) the alternation binds across the whole
       pattern, so an alias named "p" would match a bare p anywhere in the
       following lines and quietly clear a real finding. */
    const n = `(?:${names.map(esc).join('|')})`;
    /* "Consulted" is generous on purpose: any test of the value, any use of it
       in a conditional, any property read that would throw on null. The point
       is to find the ones where NOTHING happens, not to grade the style. */
    const consulted = new RegExp(
      [
        `if\\s*\\(\\s*!\\s*${n}\\b`,          // if (!row)
        `!${n}\\s*\\)`,                        // … && !row)
        `${n}\\s*(?:===|!==)\\s*null`,         // row === null
        `${n}\\s*\\?\\??\\.?`,                 // row?.x   row ?? y
        `if\\s*\\(\\s*${n}\\s*[)&]`,           // if (row)
        `${n}\\s*\\|\\|`,                      // row || fallback
        `return\\s+${n}\\b`,                   // return row
        `\\b${n}\\s*\\.`,                      // row.field
        /* The cast-then-read idiom this codebase uses constantly:
             const n = ((last as any)?.co_number || 0) + 1;
           The optional chain hangs off the closing paren, not off the name, so
           every one of these read as "never consulted" until this line. Four
           of the eight findings left at that point were this and nothing
           else. */
        `\\(\\s*${n}\\s+as\\s+[^)]*\\)\\s*\\??\\.`,
      ].join('|'),
    ).test(after);
    const errorHandled = errName ? new RegExp(`\\b${esc(errName)}\\b`).test(after) : false;

    if (!consulted && !errorHandled) {
      /* AN IGNORED LOOKUP IS NOT AUTOMATICALLY A HOLE, and reporting it as one
         would bury the real findings. pay-apps/[id]/submit ignores its lookup,
         but it only reads a token to reuse, and the UPDATE that follows is
         itself scoped by tenant_id — a foreign id updates zero rows. That is
         fine, and a tool that cannot tell it apart from documents/ntp is not
         worth running.
         The question that decides severity is what happens NEXT: if the write
         after the ignored lookup is not tenant-scoped, the ignored lookup was
         the only thing standing between a caller and another company's row. */
      const follows = src
        .slice(m.index + m[0].length, m.index + m[0].length + 6000)
        .replace(/\s+/g, ' ');
      const writeMatch = follows.match(/\.(insert|update|upsert|delete)\s*\(/);
      let severity = 'benign — no write follows';
      if (writeMatch) {
        const verb = writeMatch[1];
        const chain = follows.slice(writeMatch.index, writeMatch.index + 700);
        /* An INSERT cannot carry .eq() — there is no row to filter yet. It is
           isolated when the row it writes stamps tenant_id from the session,
           which is the house pattern. UPDATE and DELETE act on rows that
           already exist, so those do need the filter. Treating both the same
           way put a dozen perfectly safe inserts in front of the real
           findings. */
        const scoped =
          verb === 'insert' || verb === 'upsert'
            ? /tenant_id\s*:/.test(chain)
            : /\.eq\(\s*['"]tenant_id['"]/.test(chain);
        /* A generator or helper called with a bare id is the documents/ntp
           shape: the write happens somewhere this file cannot vouch for. */
        const handsOffId = /\b(generate|create|build)[A-Z]\w*\s*\(/.test(follows.slice(0, writeMatch.index));
        severity = scoped && !handsOffId
          ? 'benign — the write is tenant-scoped'
          : 'REVIEW — write follows with no tenant scope in its chain';
      } else if (/\b(generate|create|build)[A-Z]\w*\s*\(/.test(follows)) {
        severity = 'REVIEW — a generator is called with an unverified id';
      }

      findings.push({
        file: file.split(path.sep).join('/'),
        line: src.slice(0, m.index).split(/\r?\n/).length,
        binding: name,
        kind,
        error: errName ? 'bound but unused' : 'discarded',
        severity,
      });
    }
  }
}

if (JSON_OUT) {
  console.log(JSON.stringify(findings, null, 2));
} else if (!findings.length) {
  console.log(`CLEAN — every tenant-scoped lookup under ${ROOT} has its result consulted.`);
} else {
  const review = findings.filter((f) => f.severity.startsWith('REVIEW'));
  const benign = findings.filter((f) => !f.severity.startsWith('REVIEW'));
  console.log(`${findings.length} tenant-scoped lookup(s) whose result is never consulted.`);
  console.log(`${review.length} of them are followed by something not itself tenant-scoped.\n`);
  for (const f of review) {
    console.log(`  ${f.file}:${f.line}`);
    console.log(`     "${f.binding}" ignored (.${f.kind}(), error ${f.error})`);
    console.log(`     ${f.severity}`);
  }
  if (benign.length) {
    console.log(`\n${benign.length} ignored but harmless — what follows carries its own tenant filter:`);
    for (const f of benign) console.log(`  ${f.file}:${f.line}  (${f.binding})`);
  }
  console.log('\nA scoped query is only a guard if something acts on the answer.');
}
process.exit(findings.length ? 1 : 0);
