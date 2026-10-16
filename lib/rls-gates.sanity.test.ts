/**
 * The database's role gates and the app's role checks have to name the same
 * permission category for the same data. This checks the parts of
 * 20261016g_rls_replace_legacy_role_checks.sql that can drift from code:
 *   - every gated table names a real category and real levels;
 *   - comments (entity_comments) are gated by the category of the item they
 *     are on, exactly as lib/items/registry.ts guards that item;
 *   - the tables whose API routes guard them with a known category use it.
 * Run: npx -y tsx lib/rls-gates.sanity.test.ts   (exit 0 = every assertion held)
 */
import fs from 'node:fs';
import path from 'node:path';
import { CATEGORIES } from './permission-categories';
import { ITEM_TOOLS } from './items/registry';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

const sql = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261016g_rls_replace_legacy_role_checks.sql'), 'utf8');

// ('table', 'Category', 'sel'|NULL, 'ins', 'upd', 'del') rows of the gate list.
const rowRe = /\('([a-z_]+)',\s*'([^']+)',\s*(NULL|'\w+'),\s*(NULL|'\w+'),\s*(NULL|'\w+'),\s*(NULL|'\w+')\)/g;
const gates = new Map<string, { cat: string; levels: (string | null)[] }>();
for (const m of sql.matchAll(rowRe)) {
  gates.set(m[1], { cat: m[2], levels: m.slice(3, 7).map((v) => (v === 'NULL' ? null : v.replace(/'/g, ''))) });
}
check('gate list parsed', gates.size >= 20, String(gates.size));

const LEVELS = new Set(['View', 'Edit', 'Full']);
for (const [tbl, g] of gates) {
  check(`${tbl}: category is real`, g.cat === '*item*' || (CATEGORIES as readonly string[]).includes(g.cat), g.cat);
  check(`${tbl}: levels are real`, g.levels.every((l) => l === null || LEVELS.has(l)), g.levels.join(','));
  check(`${tbl}: delete needs at least what edit needs`, g.levels[3] !== null && (g.levels[3] === 'Full' || g.levels[3] === g.levels[2]));
}

// Comments follow the item: entity_type = tool.table, category = tool.perm.
const commentMap = new Map<string, string>();
for (const m of sql.matchAll(/entity_type = '([a-z_]+)' AND \(SELECT rbac\.has_permission\('([^']+)'/g)) commentMap.set(m[1], m[2]);
for (const m of sql.matchAll(/entity_type IN \(([^)]*)\) AND \(SELECT rbac\.has_permission\('([^']+)'/g)) {
  for (const t of m[1].split(',').map((s) => s.trim().replace(/'/g, ''))) commentMap.set(t, m[2]);
}
const fallback = sql.match(/AND \(SELECT rbac\.has_permission\('([^']+)', %1\$L\)\)\)\s*\)\$e\$/);
for (const tool of Object.values(ITEM_TOOLS)) {
  const cat = commentMap.get(tool.table) ?? fallback?.[1];
  check(`comments on ${tool.table} gated by ${tool.perm}`, cat === tool.perm, String(cat));
}
const excluded = [...sql.matchAll(/entity_type IS DISTINCT FROM '([a-z_]+)'/g)].map((m) => m[1]).sort();
check('fallback excludes exactly the explicitly mapped item types', JSON.stringify(excluded) === JSON.stringify([...commentMap.keys()].sort()),
  `${excluded.join(',')} vs ${[...commentMap.keys()].sort().join(',')}`);

// Tables the API guards with a known category (requirePermission in app/api).
const EXPECTED: Record<string, string> = {
  daily_logs: 'Projects', rfis: 'RFIs', safety_incidents: 'Safety', photos: 'Documents', project_files: 'Documents',
  approval_workflows: 'Documents', integrations: 'Admin', custom_field_definitions: 'Admin', resource_assignments: 'Projects',
  proposals: 'Documents', bid_packages: 'Projects', bid_submissions: 'Projects',
};
for (const [tbl, cat] of Object.entries(EXPECTED)) check(`${tbl} gated by ${cat}`, gates.get(tbl)?.cat === cat, String(gates.get(tbl)?.cat));
check('integrations (OAuth tokens) need Admin: Full even to read', gates.get('integrations')?.levels[0] === 'Full');
check('custom field definitions stay readable (every record renders them)', gates.get('custom_field_definitions')?.levels[0] === null);

process.exit(failed ? 1 : 0);
