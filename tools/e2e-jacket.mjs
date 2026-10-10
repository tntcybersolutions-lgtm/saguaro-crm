#!/usr/bin/env node
/**
 * e2e-jacket — does a bid jacket fill itself from a job, the way a GC builds one?
 *
 * Runs against the LIVE app and LIVE database, signed in as Chad's real company
 * (E2E_EMAIL / E2E_PASSWORD). It starts a ZZ AUDIT job and puts a document on it
 * through EVERY door a GC has:
 *
 *   files      Files / Documents page        POST /api/files/upload
 *   drawings   Drawings page (sheet upload)  POST /api/drawings/upload
 *   specs      Specs page (section + file)   POST /api/specs/create → /api/specs/:id/upload
 *   takeoff    Takeoff blueprint upload      /api/takeoff/create → upload-url → PUT → upload-complete
 *   jacket     the jacket's own Add Document /api/files/upload → /api/bid-packages/:id/documents
 *
 * then creates a bid package the way the wizard does, opens its jacket (the API
 * and the real page, iPhone WebKit + desktop) and checks every document landed
 * in the divider it belongs in, and that every required divider is filled.
 * Then it reads every bid package the company already has and records how
 * full each jacket is (read-only).
 *
 * Writes tools/walk/jacket-e2e.md, jacket-e2e.json and tools/walk/jacket-shots/.
 * Exit 1 when any check fails; exit 2 when the E2E secrets are missing. Needs
 * PLAYWRIGHT_DIR. Never prints the sign-in.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tools/walk');
const SHOTS = path.join(OUT, 'jacket-shots');
const SITE = 'https://www.saguarocontrol.net';
const RUN = process.env.GITHUB_RUN_ID || String(Date.now());
const TAG = `ZZ AUDIT ${RUN.slice(-6)}`;

// Chad's real company, on the live site and live database — never the App
// Store demo company. Every write is a ZZ AUDIT test record, archived after.
// The login comes from the E2E_EMAIL / E2E_PASSWORD GitHub secrets and is
// never printed; without them the test refuses to run rather than test a
// different company.
const email = (process.env.E2E_EMAIL || '').trim();
const pass = process.env.E2E_PASSWORD || '';
if (!email || !pass) {
  console.error('E2E_EMAIL / E2E_PASSWORD are not set as GitHub Actions secrets — add them to run this on your real company.');
  process.exit(2);
}

const require = createRequire(path.join(process.env.PLAYWRIGHT_DIR || '/tmp/pw', 'noop.js'));
const { webkit, chromium, devices } = require('playwright');

/** A small, valid one-page PDF whose text says what it is. */
function pdf(title) {
  const text = title.replace(/[()\\]/g, ' ');
  const stream = `BT /F1 18 Tf 40 740 Td (${text}) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(body.length); body += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = body.length;
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

const checks = [];
const ok = (name, pass, detail = '') => {
  checks.push({ name, pass: !!pass, detail: String(detail).slice(0, 400) });
  console.log(`${pass ? ' ok ' : 'FAIL'}  ${name}${detail && !pass ? ' — ' + String(detail).slice(0, 200) : ''}`);
};
const json = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return { __raw: t.slice(0, 200) }; } };

fs.mkdirSync(SHOTS, { recursive: true });
for (const f of fs.readdirSync(SHOTS)) fs.rmSync(path.join(SHOTS, f));

const browser = await webkit.launch();
const phone = await browser.newContext({ ...devices['iPhone 15'], colorScheme: 'dark' });
const page = await phone.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message || e).slice(0, 160)));

await page.goto(`${SITE}/login`, { waitUntil: 'networkidle' });
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', pass);
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 90000 });
console.log('signed in (real company)');
const api = page.request;

const result = { run: RUN, tag: TAG, job: null, package: null, doors: {}, jacket: null, existing: [], checks };
let projectId = null;
let packageId = null;

try {
  // ── 1. The job, started like a GC starts one ─────────────────────────────
  {
    const r = await api.post(`${SITE}/api/projects/create`, { data: {
      name: `${TAG} Jacket Job`, address: '100 N Central Ave, Phoenix, AZ 85004', projectType: 'commercial',
      contractValue: 250000, description: 'Automated jacket check — test record',
    } });
    const d = await json(r);
    projectId = d.projectId || null; // app/api/projects/create → { projectId, project, success }
    ok('start a job', r.ok() && projectId, `${r.status()} ${JSON.stringify(d).slice(0, 200)}`);
    result.job = projectId;
  }
  if (!projectId) throw new Error('no job');

  const upload = async (url, fields, fileName) => {
    const multipart = { ...fields, file: { name: fileName, mimeType: 'application/pdf', buffer: pdf(fileName.replace(/\.pdf$/i, '')) } };
    const r = await api.post(url, { multipart });
    return { r, d: await json(r) };
  };

  // ── 2. Documents through every door ──────────────────────────────────────
  const docs = {
    files: `${TAG} A-201 Electrical Plan.pdf`,
    drawings: `${TAG} E-101 Power Plan.pdf`,
    specs: `${TAG} 26 05 00 Common Work Results for Electrical.pdf`,
    takeoff: `${TAG} Plan Set.pdf`,
    jacketDrawing: `${TAG} E-401 Panel Schedules.pdf`,
    jacketOther: `${TAG} Site Logistics Plan.pdf`,
  };
  {
    const { r, d } = await upload(`${SITE}/api/files/upload`, { projectId }, docs.files);
    // → { success, files, failed, file }
    ok('files page: upload', r.ok() && d.success === true && d.file?.id, `${r.status()} ${JSON.stringify(d).slice(0, 200)}`);
    result.doors.files = r.status();
  }
  {
    const { r, d } = await upload(`${SITE}/api/drawings/upload`, { projectId, sheet_number: 'E-101', title: `${TAG} Power Plan`, discipline: 'Electrical' }, docs.drawings);
    // → { success, drawing, url }
    ok('drawings page: sheet upload', r.ok() && d.drawing?.id, `${r.status()} ${JSON.stringify(d).slice(0, 200)}`);
    result.doors.drawings = r.status();
  }
  {
    // The Specs page posts { projectId, status, last_updated, ...form }; the route reads section_number|sectionNumber|section, title, division.
    const c = await api.post(`${SITE}/api/specs/create`, { data: { projectId, section: '26 05 00', title: `${TAG} Common Work Results for Electrical`, division: '26', status: 'draft' } });
    const cd = await json(c);
    const specId = cd.spec?.id || null; // → { success, spec, specification }
    ok('specs page: add section', c.ok() && specId, `${c.status()} ${JSON.stringify(cd).slice(0, 200)}`);
    if (specId) {
      const { r, d } = await upload(`${SITE}/api/specs/${specId}/upload`, { specId }, docs.specs);
      ok('specs page: attach file', r.ok() && d.success === true, `${r.status()} ${JSON.stringify(d).slice(0, 200)}`);
      result.doors.specs = r.status();
    }
  }
  {
    const c = await api.post(`${SITE}/api/takeoff/create`, { data: { projectId } });
    const cd = await json(c);
    const tid = cd.data?.id || null; // lib/api-response ok() → { data }
    ok('takeoff: start', c.ok() && tid, `${c.status()} ${JSON.stringify(cd).slice(0, 200)}`);
    if (tid) {
      const u = await api.post(`${SITE}/api/takeoff/${tid}/upload-url`, { data: { fileName: docs.takeoff } });
      const ud = await json(u);
      const bytes = pdf(docs.takeoff);
      const put = ud.signedUrl ? await api.put(ud.signedUrl, { data: bytes, headers: { 'x-upsert': 'true', 'Content-Type': 'application/pdf' } }) : null;
      const done = ud.path ? await api.post(`${SITE}/api/takeoff/${tid}/upload-complete`, { data: { path: ud.path, fileName: docs.takeoff, fileType: 'application/pdf', fileSize: bytes.length } }) : null;
      ok('takeoff: blueprint uploaded', u.ok() && put?.ok() && done?.ok() && (await json(done)).success === true, `${u.status()}/${put?.status()}/${done?.status()} ${JSON.stringify(ud).slice(0, 120)}`);
      result.doors.takeoff = done?.status() ?? u.status();
    }
  }

  // ── 3. The package, the way the wizard makes one ─────────────────────────
  {
    const due = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    const r = await api.post(`${SITE}/api/bid-packages/create`, { data: {
      projectId, name: `${TAG} Electrical`, trade: 'Electrical', due_date: due,
      scope_summary: 'Furnish and install power, lighting and low-voltage rough-in per the E-series sheets.',
      bid_instructions: 'Bid on the attached form. Include alternates separately. Questions through the portal.',
      insurance_requirements: 'General liability $1,000,000 per occurrence; auto $1,000,000; workers comp statutory.',
      requires_bond: true,
      lineItems: [
        { description: 'Power rough-in', quantity: 1, unit: 'LS' },
        { description: 'Lighting fixtures and controls', quantity: 1, unit: 'LS' },
        { description: 'Low-voltage rough-in', quantity: 1, unit: 'LS' },
      ],
    } });
    const d = await json(r);
    packageId = d.bidPackage?.id || null; // → { success, bidPackage }
    ok('create bid package (wizard)', r.ok() && packageId, `${r.status()} ${JSON.stringify(d).slice(0, 200)}`);
    result.package = packageId;
  }
  if (!packageId) throw new Error('no package');

  // ── 4. The jacket's own Add Document ─────────────────────────────────────
  for (const [key, category] of [['jacketDrawing', 'drawing'], ['jacketOther', 'attachment']]) { // BidJacketAssembly's <option> values
    const { r, d } = await upload(`${SITE}/api/files/upload`, { projectId, entityType: 'bid_package', entityId: packageId, category }, docs[key]);
    const fid = d.file?.id;
    const at = fid ? await api.post(`${SITE}/api/bid-packages/${packageId}/documents`, { data: { projectFileId: fid, category, label: docs[key] } }) : null;
    ok(`jacket Add Document (${category})`, r.ok() && at?.ok(), `${r.status()}/${at?.status()} ${fid ? '' : JSON.stringify(d).slice(0, 160)}`);
    result.doors[key] = at?.status() ?? r.status();
  }

  // ── 5. The jacket ────────────────────────────────────────────────────────
  const jr = await api.get(`${SITE}/api/bid-packages/${packageId}/jacket`);
  const jacket = await json(jr);
  ok('jacket opens', jr.ok() && Array.isArray(jacket.sections), `${jr.status()} ${JSON.stringify(jacket).slice(0, 200)}`);
  const sections = Array.isArray(jacket.sections) ? jacket.sections : [];
  result.jacket = sections.map((s) => ({ key: s.key, label: s.label, required: s.required, count: s.count,
    docs: (s.docs || []).map((x) => x.name), pages: (s.pages || []).map((x) => x.title) }));
  const docNames = (key) => (sections.find((s) => s.key === key)?.docs || []).map((x) => String(x.name || ''));
  const inSection = (key, needle) => docNames(key).some((n) => n.includes(needle));
  const where = (needle) => sections.filter((s) => (s.docs || []).some((x) => String(x.name || '').includes(needle))).map((s) => s.key).join(',') || 'nowhere';

  ok('files-page plan (A-201) is in Drawings', inSection('drawings', 'A-201'), `found in: ${where('A-201')}`);
  ok('drawings-page sheet (E-101) is in Drawings', inSection('drawings', 'E-101'), `found in: ${where('E-101')}`);
  ok('takeoff plan set is in Drawings', inSection('drawings', 'Plan Set'), `found in: ${where('Plan Set')}`);
  ok('spec section (26 05 00) is in Specifications', inSection('specs', '26 05 00'), `found in: ${where('26 05 00')}`);
  ok('jacket-added drawing (E-401) is in Drawings', inSection('drawings', 'E-401'), `found in: ${where('E-401')}`);
  ok('jacket-added other file is in Attachments', inSection('attachments', 'Site Logistics'), `found in: ${where('Site Logistics')}`);
  const sec = (k) => sections.find((s) => s.key === k);
  ok('Instructions to bidders filled', (sec('invitation')?.pages || []).some((p) => /Instructions/i.test(p.title || '')), JSON.stringify(sec('invitation')).slice(0, 200));
  ok('Scope filled', (sec('scope')?.count || 0) > 0, JSON.stringify(sec('scope')).slice(0, 200));
  ok('Bid form has the 3 lines in order', JSON.stringify((jacket.lineItems || []).map((l) => l.description)) === JSON.stringify(['Power rough-in', 'Lighting fixtures and controls', 'Low-voltage rough-in']), JSON.stringify((jacket.lineItems || []).map((l) => l.description)));
  const insText = JSON.stringify(jacket.requirements || {});
  ok('Insurance reads as entered (no raw JSON)', /General liability/i.test(insText) && !/\{\\?"general_liability/.test(insText), insText.slice(0, 200));
  ok('Bond required shows', jacket.requirements?.bond === true, insText.slice(0, 120));
  ok('nothing required is missing', Array.isArray(jacket.completeness?.missing) && jacket.completeness.missing.length === 0, JSON.stringify(jacket.completeness));

  // ── 6. The real page, phone and desktop ──────────────────────────────────
  const shoot = async (p, name) => { await p.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };
  const openJacket = async (p, label) => {
    await p.goto(`${SITE}/app/projects/${projectId}/bid-packages/${packageId}/jacket`, { waitUntil: 'networkidle' });
    await p.waitForSelector('text=Drawings', { timeout: 30000 });
    await shoot(p, `${label}-1-cover`);
    for (const d of ['Drawings', 'Specifications', 'Bid Form', 'Insurance & Bonding']) {
      const t = p.getByRole('button', { name: new RegExp(`^\\s*${d.replace(/&/g, '&')}`) }).first();
      if (await t.count()) { await t.click(); await p.waitForTimeout(800); await shoot(p, `${label}-${d.replace(/\W+/g, '-').toLowerCase()}`); }
    }
    const bodyText = await p.locator('body').innerText();
    ok(`${label}: page shows the uploaded plans`, /E-101/.test(bodyText) || /A-201/.test(bodyText), 'E-101 / A-201 not visible on the page');
    const sw = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    ok(`${label}: no sideways scroll`, sw[0] <= sw[1] + 1, sw.join('>'));
  };
  await openJacket(page, 'phone');
  const desk = await (await chromium.launch()).newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', storageState: await phone.storageState() });
  const dpage = await desk.newPage();
  await openJacket(dpage, 'desktop');

  // ── 7. Every package the company already has (read-only) ─────────────────
  const pr = await json(await api.get(`${SITE}/api/projects?limit=200&fields=id,name`));
  const projects = (pr.projects || []).filter((p) => p.id && p.id !== projectId); // app/api/projects GET → { projects }
  for (const p of projects) {
    const lr = await json(await api.get(`${SITE}/api/projects/${p.id}/bid-packages`));
    const pkgs = lr.packages || []; // → { packages }
    for (const k of pkgs) {
      const j = await json(await api.get(`${SITE}/api/bid-packages/${k.id}/jacket`));
      const counts = Object.fromEntries((j.sections || []).map((s) => [s.key, s.count]));
      result.existing.push({ job: p.name, package: k.name || k.trade || k.id, counts, missing: j.completeness?.missing ?? j.error ?? null });
    }
  }
} catch (e) {
  ok('run completed', false, e?.message || e);
} finally {
  // The job is a test record: archive it (files stay with it).
  if (projectId) {
    const del = await api.delete(`${SITE}/api/projects/${projectId}`).catch(() => null);
    console.log(`archived test job: ${del?.status?.() ?? 'n/a'}`);
  }
  ok('no page errors', errors.length === 0, errors.join(' / '));
}

// ── Report ─────────────────────────────────────────────────────────────────
const failed = checks.filter((c) => !c.pass);
const keys = ['invitation', 'scope', 'drawings', 'specs', 'bidform', 'requirements', 'addenda', 'attachments'];
const md = [
  '# Bid jacket end to end — every way a GC adds documents (live app, real company)',
  '',
  `Run ${RUN} · ${checks.length - failed.length} of ${checks.length} checks passed · test job archived after the run.`,
  '',
  '| Check | Result |', '|---|---|',
  ...checks.map((c) => `| ${c.name} | ${c.pass ? '✅' : '❌ ' + c.detail.replace(/\|/g, '/')} |`),
  '',
  '## The new jacket, divider by divider', '',
  '| Divider | Count | What is in it |', '|---|---|---|',
  ...(result.jacket || []).map((s) => `| ${s.label}${s.required ? ' *' : ''} | ${s.count} | ${[...s.pages, ...s.docs].join('; ').replace(/\|/g, '/').slice(0, 300)} |`),
  '',
  `## Every existing bid package (${result.existing.length}) — read-only`, '',
  `| Job | Package | ${keys.join(' | ')} | Missing |`, `|---|---|${keys.map(() => '---').join('|')}|---|`,
  ...result.existing.map((x) => `| ${x.job} | ${x.package} | ${keys.map((k) => x.counts[k] ?? '–').join(' | ')} | ${Array.isArray(x.missing) ? x.missing.join(', ') || 'none' : String(x.missing)} |`),
  '',
  'Screens: tools/walk/jacket-shots/',
].join('\n');
fs.writeFileSync(path.join(OUT, 'jacket-e2e.md'), md + '\n');
fs.writeFileSync(path.join(OUT, 'jacket-e2e.json'), JSON.stringify(result, null, 2));
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
await browser.close().catch(() => {});
process.exit(failed.length ? 1 : 0);
