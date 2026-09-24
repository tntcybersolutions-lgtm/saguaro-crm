/**
 * WHAT ACTUALLY WORKS — every destination in the sidebar, graded from the code.
 *
 * Chad, 24 Sep 2026: "SAGUARO IS ONLY PIECED TOGETHER PARTLY WORKING AND U KEEP
 * SAYING ITS READY THEN SAYING OH IM SORRY ITS NOT READY."
 *
 * He is right, and the cause is claims made from directory listings instead of
 * from code. This grades each nav destination on evidence only:
 *
 *   PAGE      does app/<route>/page.tsx exist at all
 *   LINES     how big it is (a 40-line page is a title and nothing else)
 *   FETCHES   which /api/... endpoints it actually calls
 *   API       does every one of those routes exist on disk
 *   AUTH      does the API guard with getUser/requireAuth
 *   TENANT    does the API filter on tenant_id
 *   STUB      does the page contain placeholder markers
 *
 * Grade:
 *   GREEN  page renders, calls at least one API, every API exists, guarded and
 *          tenant-scoped, no stub markers
 *   AMBER  page exists and calls an API, but something is missing
 *   RED    no page, or a page that calls nothing, or a stub marker
 *
 * No network, no database, no claims — just the tree. Run:
 *   node tools/audit-pages.mjs
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SIDEBAR = join(ROOT, 'components/AppSidebar.tsx');

/* Pull every href out of the sidebar rather than retyping them — the nav is the
   contract with the user, so the audit must follow it exactly. */
const src = readFileSync(SIDEBAR, 'utf8');
const staticHrefs = [...src.matchAll(/href:\s*'([^']+)'/g)].map((m) => m[1]);
const dynamicHrefs = [...src.matchAll(/href:\s*`([^`]+)`/g)]
  .map((m) => m[1].replace(/\$\{activeProjectId\}/g, '[id]'));
const hrefs = [...new Set([...staticHrefs, ...dynamicHrefs])].filter((h) => h.startsWith('/'));

/* Real stub markers only. The first cut included the bare word "placeholder",
   which matched placeholder="Search projects…" — an ordinary input attribute —
   and graded working pages as stubs. An audit that cries wolf is worse than no
   audit, so every pattern here must be one that cannot appear in shipping code. */
const STUBS = [
  'Coming Soon', 'coming soon', 'Coming soon',
  'TODO', 'FIXME', 'not implemented', 'Not implemented',
  'implement later', 'wire this up', 'Under construction', 'under construction',
  '// placeholder', '/* placeholder', 'PLACEHOLDER',
];

/**
 * ⚠️ RESOLVE DYNAMIC SEGMENTS AGAINST THE DISK, NEVER AGAINST A GUESS.
 *
 * The first version substituted `${activeProjectId}` with the literal `[id]`
 * and looked for app/app/projects/[id]/schedule/page.tsx. That directory does
 * not exist — the real one is [projectId], with sixty subdirectories of working
 * pages — so this reported "no page.tsx" for every per-job link and I told Chad
 * the job workspace was an empty directory. It was never empty. Twenty RED
 * findings, all false, from one hardcoded slug name.
 *
 * A placeholder segment now matches whatever [param] directory is actually
 * there, exactly as apiFileFor already did for API routes.
 */
function pageFileFor(route) {
  const parts = route.replace(/^\//, '').split('/').filter(Boolean);
  let dirs = [join(ROOT, 'app')];

  for (const part of parts) {
    const next = [];
    for (const d of dirs) {
      if (!existsSync(d)) continue;
      // A literal directory wins when it exists.
      if (existsSync(join(d, part))) next.push(join(d, part));
      // Otherwise any dynamic segment can absorb this value — including the
      // placeholder this audit itself substituted in.
      for (const e of readdirSync(d)) {
        if (/^\[.+\]$/.test(e) && statSync(join(d, e)).isDirectory()) next.push(join(d, e));
      }
    }
    if (!next.length) return null;
    dirs = next;
  }

  for (const d of dirs) {
    for (const f of ['page.tsx', 'page.ts']) {
      if (existsSync(join(d, f))) return join(d, f);
    }
  }
  return null;
}

function apiFileFor(endpoint) {
  const clean = endpoint.split('?')[0].replace(/^\/api\//, '').replace(/\/$/, '');
  const parts = clean.split('/').filter(Boolean);
  // Walk the tree allowing [param] segments to absorb a concrete value.
  let dirs = [join(ROOT, 'app/api')];
  for (const part of parts) {
    const next = [];
    for (const d of dirs) {
      if (!existsSync(d)) continue;
      if (existsSync(join(d, part))) next.push(join(d, part));
      for (const e of readdirSync(d)) {
        if (/^\[.+\]$/.test(e) && statSync(join(d, e)).isDirectory()) next.push(join(d, e));
      }
    }
    if (!next.length) return null;
    dirs = next;
  }
  for (const d of dirs) if (existsSync(join(d, 'route.ts'))) return join(d, 'route.ts');
  return null;
}

const rows = [];
for (const route of hrefs) {
  const pf = pageFileFor(route);
  if (!pf) { rows.push({ route, grade: 'RED', why: 'no page.tsx' }); continue; }

  const body = readFileSync(pf, 'utf8');
  const lines = body.split('\n').length;
  const endpoints = [...new Set([...body.matchAll(/['"`](\/api\/[^'"`\s)]+)['"`]/g)].map((m) => m[1]))];
  const stub = STUBS.find((s) => body.includes(s));

  if (!endpoints.length) {
    rows.push({ route, grade: 'RED', lines, why: stub ? `no API call + "${stub}"` : 'calls no API' });
    continue;
  }

  const missing = [], unguarded = [], untenanted = [];
  for (const ep of endpoints) {
    const af = apiFileFor(ep);
    if (!af) { missing.push(ep); continue; }
    const api = readFileSync(af, 'utf8');
    if (!/getUser\s*\(|requireAuth\s*\(/.test(api)) unguarded.push(ep);
    if (!/tenant_id/.test(api)) untenanted.push(ep);
  }

  const problems = [];
  if (missing.length) problems.push(`${missing.length} API missing: ${missing.slice(0, 2).join(', ')}`);
  if (unguarded.length) problems.push(`${unguarded.length} unguarded`);
  if (untenanted.length) problems.push(`${untenanted.length} no tenant filter`);
  if (stub) problems.push(`stub marker "${stub}"`);

  rows.push({
    route, lines, apis: endpoints.length,
    grade: problems.length ? 'AMBER' : 'GREEN',
    why: problems.join(' · ') || `${endpoints.length} API(s), guarded, tenant-scoped`,
  });
}

const order = { RED: 0, AMBER: 1, GREEN: 2 };
rows.sort((a, b) => order[a.grade] - order[b.grade] || a.route.localeCompare(b.route));

const count = (g) => rows.filter((r) => r.grade === g).length;
console.log(`\nSAGUARO NAV AUDIT — ${rows.length} destinations in the sidebar\n`);
for (const r of rows) {
  console.log(`  ${r.grade.padEnd(5)} ${r.route.padEnd(46)} ${String(r.lines ?? '-').padStart(5)}L  ${r.why}`);
}
console.log(`\n  RED ${count('RED')}   AMBER ${count('AMBER')}   GREEN ${count('GREEN')}\n`);
