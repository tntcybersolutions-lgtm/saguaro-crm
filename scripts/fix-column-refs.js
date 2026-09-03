#!/usr/bin/env node
/**
 * fix-column-refs — rename columns that the schema calls something else.
 *
 * audit-column-refs found 66 queries naming a column that does not exist. Most
 * are a straight rename: the code says `name`, subcontractors calls it
 * `company_name`; the code says `expiration_date`, insurance_certificates calls
 * it `expiry_date`. Each of those is a query that errors the moment it runs.
 *
 * The rename has to be scoped to the table it belongs to. `name` is a perfectly
 * good column on schedule_phases, workers and dozens of others — a global
 * find-and-replace would break far more than it fixed. So this reuses the
 * audit's rule: a .from('table') owns the chained calls up to the next .from(),
 * and only inside that window is the column rewritten.
 *
 * ONLY certain renames live here. Where a column does not exist under any name
 * — project_team.is_primary, workers.project_id, portal_documents.visible_to —
 * the code is asking for something the schema never had, and that is a product
 * decision, not a mechanical fix. Those are left alone and reported.
 */

const fs = require('fs');
const path = require('path');

/* table -> { wrongColumn: rightColumn }. Every mapping verified against the
   live schema before being written here. */
const RENAMES = {
  subcontractors: { name: 'company_name' },
  insurance_certificates: {
    subcontractor_id: 'sub_id',
    expiration_date: 'expiry_date',
    company_name: 'sub_name',
  },
  /* `.eq('project_id', id)` on the projects table itself — the row IS the
     project, so the key is id. */
  projects: { project_id: 'id' },
  project_team: { company_name: 'company' },
  profiles: { user_id: 'id', company_name: 'company' },
  rfis: { title: 'subject', number: 'rfi_number', cost_impact_amount: 'cost_impact' },
  sub_performance: { name: 'sub_name', last_project: 'last_project_date', rating: 'avg_rating' },
  schedule_phases: { phase_name: 'name' },
  approval_decisions: { status: 'decision' },
  activity_log: { module: 'entity_type', user_email: 'user_name' },
  lien_waivers: { pay_app_id: 'pay_application_id' },
  bid_packages: { code: 'package_number' },
  bids: { bid_amount: 'amount', ai_score: 'score' },
  trade_knowledge: { summary: 'content' },
  notifications: { urgency: 'priority' },
};

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', '.git'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

const dry = !process.argv.includes('--write');
let edits = 0;
const touched = new Set();

for (const f of walk('app/api').concat(walk('lib'))) {
  const rel = f.split(path.sep).join('/');
  if (rel === 'lib/database.types.ts') continue;
  let src = fs.readFileSync(rel, 'utf8');
  if (!/\.from\(/.test(src)) continue;

  /* Rebuilt each pass because rewriting shifts offsets. */
  let changed = true;
  while (changed) {
    changed = false;
    /* EVERY .from( bounds a chain, not just the ones naming a literal table.
       Matching only literals let a chain run straight through
       `.from(src.table as any).eq('project_id', …)` and attribute it to a
       `.from('projects')` further up — rewriting a dynamic table's correct
       filter into a wrong one. A boundary has to be every from, or it is not a
       boundary. */
    const froms = [...src.matchAll(/\.from\(\s*(?:['"`](\w+)['"`]\s*)?/g)];
    for (let i = 0; i < froms.length; i++) {
      const map = froms[i][1] ? RENAMES[froms[i][1]] : null;
      if (!map) continue;
      const start = froms[i].index + froms[i][0].length;
      const stop = i + 1 < froms.length ? froms[i + 1].index : Math.min(src.length, start + 1200);
      let chain = src.slice(start, stop);
      const before = chain;

      for (const [wrong, right] of Object.entries(map)) {
        /* Filters: .eq('wrong', … -> .eq('right', … */
        chain = chain.replace(
          new RegExp(`(\\.(?:eq|neq|gt|gte|lt|lte|like|ilike|is|in|contains|order)\\(\\s*)(['"\`])${wrong}\\2`, 'g'),
          `$1$2${right}$2`,
        );
        /* Select lists: only the whole token, never a substring of another
           column ("name" must not touch "company_name"). */
        chain = chain.replace(/\.select\(\s*(['"`])([^'"`]+)\1/g, (m, q, cols) => {
          if (cols.includes('(') || cols.includes('*')) return m;
          const parts = cols.split(',');
          /* Only rewrite a list that actually names the wrong column.
             Rejoining unconditionally reformatted every select it passed —
             39 files touched to fix a handful, with the real change buried in
             whitespace churn. A codemod that reformats unrelated code is a
             codemod nobody can review. */
          if (!parts.some((c) => c.trim() === wrong)) return m;
          /* De-duplicate after the rename. Several selects name BOTH the wrong
             column and the right one — schedule_phases 'name, phase_name',
             trade_knowledge 'title, summary, content', sub_performance
             'last_project, last_project_date'. Renaming without dropping the
             duplicate produces 'name, name', which PostgREST rejects, turning a
             broken query into a differently broken one. */
          const seen = new Set();
          const out = parts
            .map((c) => (c.trim() === wrong ? right : c.trim()))
            .filter((c) => (seen.has(c) ? false : (seen.add(c), true)))
            .join(', ');
          return `.select(${q}${out}${q}`;
        });
      }

      if (chain !== before) {
        src = src.slice(0, start) + chain + src.slice(stop);
        edits++;
        touched.add(rel);
        changed = true;
        break;
      }
    }
  }

  if (touched.has(rel) && !dry) fs.writeFileSync(rel, src);
}

console.log('='.repeat(74));
console.log(dry ? 'FIX COLUMN REFS — dry run (pass --write to apply)' : 'FIX COLUMN REFS — applied');
console.log('='.repeat(74));
console.log(`  chains rewritten  ${edits}`);
console.log(`  files touched     ${touched.size}`);
for (const t of [...touched].sort()) console.log(`    ${t}`);
