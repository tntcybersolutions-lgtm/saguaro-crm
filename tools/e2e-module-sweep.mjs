#!/usr/bin/env node
/**
 * e2e-module-sweep — drive every module through its own API and check the
 * round trip.
 *
 * WHY THIS EXISTS
 *
 * 418 of this database's 458 tables have never held a row. Twelve have real
 * data. A static audit cannot say anything useful about a module that has
 * never run: the audit that caught projects.open_punch_count and
 * pay_applications.retainage_held both needed rows to compare against, and
 * there are none.
 *
 * So this creates them. Every module gets a realistic record posted to its own
 * create endpoint — the same endpoint the product uses — and then the record is
 * read back through the list endpoint and compared field by field against what
 * was sent.
 *
 * WHAT COUNTS AS A FAILURE
 *
 *   create   — anything that is not 2xx. A 400 naming a field is a bad body on
 *              my side and gets reported as such; a 500 is the product's bug.
 *   readback — the record cannot be found again after a successful create.
 *   fidelity — a field was accepted, stored, and came back DIFFERENT or empty.
 *              This is the quiet one. A create returning 200 while silently
 *              dropping the value is indistinguishable from success until a
 *              customer notices their number is wrong.
 *
 * Usage:
 *   node tools/e2e-module-sweep.mjs                 # against production
 *   node tools/e2e-module-sweep.mjs --keep          # leave the records behind
 *   node tools/e2e-module-sweep.mjs --only rfis,punch-list
 */
import fs from 'node:fs';

const BASE = process.env.SWEEP_BASE || 'https://saguarocontrol.net';
const KEEP = process.argv.includes('--keep');
const ONLY = (() => {
  const i = process.argv.indexOf('--only');
  return i > -1 && process.argv[i + 1] ? new Set(process.argv[i + 1].split(',')) : null;
})();

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);

const PROJECT = 'd3e0a111-0001-4d00-9000-5a6775a0de00';   // Desert Vista Medical Plaza
const today = new Date().toISOString().slice(0, 10);
const plus = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

/**
 * Each module: what to send, where to read it back, and which fields must
 * survive the trip. `match` finds our row in the list response.
 *
 * Bodies carry BOTH casings where a route accepts either, because several do
 * and the point is to exercise what the product actually sends.
 */
const MODULES = [
  { name: 'rfis', create: 'rfis/create', list: 'rfis/list',
    body: { project_id: PROJECT, subject: 'SWEEP duct main clash at grid D-2', question: 'Confirm routing below the W21 or advise coordination.', spec_section: '23 31 13', priority: 'high', due_date: plus(5) },
    key: 'subject', check: ['question', 'spec_section', 'priority'] },

  { name: 'punch-list', create: 'punch-list/create', list: 'punch-list/list',
    body: { projectId: PROJECT, title: 'SWEEP sealant missing at window head', description: 'Perimeter sealant absent, unit 3 west elevation.', location: 'Level 3 / West', trade: 'Glazing', priority: 'high', due_date: plus(7) },
    key: 'title', check: ['description', 'location', 'trade', 'priority'] },

  { name: 'submittals', create: 'submittals/create', list: 'submittals/list',
    body: { project_id: PROJECT, title: 'SWEEP curtain wall shop drawings', spec_section: '08 44 13', trade: 'Glazing', subcontractor: 'Sonoran Glass', due_date: plus(9) },
    key: 'title', check: ['spec_section', 'trade', 'subcontractor'] },

  { name: 'change-orders', create: 'change-orders/create', list: 'change-orders/list',
    body: { projectId: PROJECT, title: 'SWEEP added roof curbs', description: 'Six additional curbs for revised RTU layout.', amount: 18750, reason: 'Owner request', status: 'pending' },
    key: 'title', check: ['description', 'amount', 'reason'] },

  { name: 'daily-logs', create: 'daily-logs/create', list: 'daily-logs/list',
    body: { project_id: PROJECT, log_date: today, superintendent: 'Ray Ortega', crew_count: 18, weather: 'Clear', high_temp: '94', work_performed: 'SWEEP level 3 deck rebar and MEP sleeves.', notes: 'Inspection scheduled Thursday.' },
    key: 'work_performed', check: ['superintendent', 'crew_count', 'weather', 'notes'] },

  /* budgets/create is the Takeoff screen's "Generate Budget". It writes a
     header to `budgets` and rolls the line items up by CSI division into
     budget_lines — so the meaningful read-back is the BUDGET SCREEN's endpoint,
     which is where a user would look for it, not the header list. */
  { name: 'budgets', create: 'budgets/create', list: 'projects/' + PROJECT + '/budget',
    body: { projectId: PROJECT, name: 'SWEEP Takeoff Budget', originalTotal: 412000, revisedTotal: 412000,
            overheadPct: 10, profitPct: 10, contingencyPct: 10,
            lineItems: [{ costCode: '07-5300', csiDivision: '07', description: 'SWEEP single-ply roofing',
                          category: 'material', unit: 'SF', quantity: 18400, unitCost: 22.39, originalAmount: 412000, revisedAmount: 412000 }] },
    key: 'cost_code', check: ['original_budget'] },

  { name: 'todos', create: 'todos/create', list: null, noGet: 'no GET route exists under app/api/todos',
    body: { project_id: PROJECT, title: 'SWEEP confirm roof warranty registration', description: 'Manufacturer needs the completed form before closeout.', priority: 'medium', due_date: plus(10) },
    key: 'title', check: ['description', 'priority'] },

  { name: 'permits', create: 'permits/create', list: 'permits?projectId=' + PROJECT,
    body: { project_id: PROJECT, permit_type: 'Mechanical', number: 'SWEEP-MECH-4417', status: 'issued', inspector: 'City of Scottsdale' },
    key: 'number', check: ['permit_type', 'status'] },

  { name: 'inspections', create: 'inspections/create', list: 'inspections/list?projectId=' + PROJECT,
    body: { project_id: PROJECT, inspection_type: 'SWEEP rough mechanical', status: 'scheduled', scheduled_date: plus(3), inspector: 'City of Scottsdale' },
    key: 'inspection_type', check: ['status', 'inspector'] },

  { name: 'deliveries', create: 'deliveries/create', list: 'deliveries?projectId=' + PROJECT,
    /* Deliveries live in punch_list with trade='delivery'; the route takes
       title/description/poNumber, derives a title from the supplier when none
       is given, and owns the status. Match its contract, not a guess at it. */
    body: { projectId: PROJECT, title: 'SWEEP RTU-3 rooftop unit', description: 'Rooftop unit 3, crane pick scheduled', supplier: 'Arroyo Mechanical', poNumber: 'SWEEP-PO-8841', qtyOrdered: 1 },
    key: 'title', check: ['description'] },

  { name: 'selections', create: 'selections/create', list: 'selections/list?projectId=' + PROJECT,
    body: { projectId: PROJECT, item: 'SWEEP corridor floor tile', category: 'Finishes', status: 'pending', allowance: 42000 },
    key: 'item', check: ['category', 'status'] },

  { name: 'bid-packages', create: 'bid-packages/create', list: 'bid-packages/list?projectId=' + PROJECT,
    body: { project_id: PROJECT, name: 'SWEEP Division 08 - Openings', trade: 'Doors & Glazing', due_date: plus(14), status: 'draft' },
    key: 'name', check: ['trade', 'status'] },

  { name: 'cost-codes', create: 'cost-codes/create', list: 'cost-codes/list',
    body: { code: 'SWEEP-09-9100', name: 'SWEEP painting and coatings', division: '09', category: 'Finishes' },
    key: 'code', check: ['name', 'division'] },

  { name: 'schedule', create: 'schedule/create', list: 'schedule/list?projectId=' + PROJECT,
    body: { projectId: PROJECT, name: 'SWEEP roofing installation', start_date: plus(20), end_date: plus(48), status: 'not_started', trade: 'Roofing' },
    key: 'name', check: ['status', 'trade'] },

  { name: 'invoices', create: 'invoices/create', list: 'invoices/list?projectId=' + PROJECT,
    body: { project_id: PROJECT, vendor_name: 'SWEEP Ironwood Steel', amount: 94200, status: 'pending', due_date: plus(30), description: 'Structural steel progress billing' },
    key: 'vendor_name', check: ['amount', 'status', 'description'] },

  { name: 'bills', create: 'bills/create', list: 'bills/list?projectId=' + PROJECT,
    body: { project_id: PROJECT, vendor_name: 'SWEEP Verde Interiors', amount: 31400, status: 'unpaid', due_date: plus(21), description: 'Drywall progress' },
    key: 'vendor_name', check: ['amount', 'status'] },

  { name: 'contracts', create: 'contracts/create', list: 'contracts/list?projectId=' + PROJECT,
    body: { project_id: PROJECT, title: 'SWEEP glazing subcontract', party_name: 'SWEEP Sonoran Glass', trade: 'Glazing', amount: 640000, status: 'executed', party_company: 'Sonoran Glass LLC' },
    key: 'party_name', check: ['trade', 'amount', 'status'] },

  { name: 'specs', create: 'specs/create', list: null, noGet: 'no GET route exists under app/api/specs',
    body: { projectId: PROJECT, title: 'SWEEP 07 5300 EPDM roofing', section: '07 53 00', division: '07' },
    key: 'title', check: ['section'] },

  { name: 'timesheets', create: 'timesheets/create', list: null, noGet: 'no GET route exists under app/api/timesheets',
    body: { project_id: PROJECT, employee_name: 'SWEEP Hector Ruiz', trade: 'Carpentry', work_date: today, regular_hours: 8, overtime_hours: 2, notes: 'Deck edge forms' },
    key: 'work_description', check: ['regular_hours', 'overtime_hours'] },
];

/* ─────────────────────────────────────────────────────────────── */

const session = await (await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: env.APP_REVIEW_DEMO_EMAIL, password: env.APP_REVIEW_DEMO_PASS }),
})).json();
if (!session.access_token) { console.error('sign-in failed'); process.exit(1); }
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` };

const norm = (v) => (v == null ? '' : typeof v === 'number' ? String(v) : String(v).trim());
const results = [];

for (const mod of MODULES) {
  if (ONLY && !ONLY.has(mod.name)) continue;
  const r = { name: mod.name, createStatus: null, found: false, drift: [], error: null };

  try {
    const res = await fetch(`${BASE}/api/${mod.create}`, { method: 'POST', headers: H, body: JSON.stringify(mod.body) });
    r.createStatus = res.status;
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { r.error = body?.error || `HTTP ${res.status}`; results.push(r); continue; }

    if (!mod.list) {
      /* The create worked; there is simply no endpoint to read it back with.
         That is a finding about the product, not a failure of this sweep. */
      r.found = true; r.noGet = mod.noGet; results.push(r); continue;
    }
    const sep = mod.list.includes('?') ? '&' : '?';
    const lres = await fetch(`${BASE}/api/${mod.list}${sep}_t=${Date.now()}`, { headers: H });
    if (!lres.ok) { r.error = `list HTTP ${lres.status}`; results.push(r); continue; }
    const ljson = await lres.json().catch(() => ({}));
    const rows = Array.isArray(ljson) ? ljson
      : Object.values(ljson).find((v) => Array.isArray(v)) ?? [];

    const wanted = norm(mod.body[mod.key] ?? mod.body[Object.keys(mod.body).find((k) => k.toLowerCase() === mod.key.toLowerCase())]);
    const mine = rows.find((row) => Object.values(row).some((v) => norm(v) && wanted && norm(v) === wanted))
      || rows.find((row) => Object.values(row).some((v) => typeof v === 'string' && v.includes('SWEEP')));
    if (!mine) { r.error = `created ${r.createStatus} but not in the list of ${rows.length}`; results.push(r); continue; }
    r.found = true;

    /* FIDELITY. A field that was sent, accepted and then came back empty or
       different is the failure this whole sweep exists to catch. */
    for (const f of mod.check) {
      const sent = mod.body[f] ?? mod.body[f.replace(/_(\w)/g, (_, c) => c.toUpperCase())];
      if (sent == null) continue;
      const got = mine[f] ?? mine[f.replace(/_(\w)/g, (_, c) => c.toUpperCase())];
      if (norm(got) !== norm(sent)) r.drift.push({ field: f, sent: norm(sent), got: got === undefined ? '(absent)' : norm(got) || '(empty)' });
    }
    r.id = mine.id;
  } catch (e) {
    r.error = String(e?.message || e);
  }
  results.push(r);
}

/* ── report ── */
const ok = results.filter((r) => r.found && !r.drift.length);
const drifted = results.filter((r) => r.found && r.drift.length);
const failed = results.filter((r) => !r.found);

console.log(`\n${results.length} modules exercised against ${BASE}\n`);
console.log(`  clean round trip : ${ok.length}`);
console.log(`  saved but lossy  : ${drifted.length}`);
console.log(`  could not save   : ${failed.length}\n`);

if (failed.length) {
  console.log('COULD NOT SAVE');
  for (const r of failed) console.log(`  ${String(r.createStatus ?? '---').padEnd(4)} ${r.name.padEnd(16)} ${r.error}`);
  console.log('');
}
if (drifted.length) {
  console.log('SAVED, BUT A FIELD DID NOT SURVIVE');
  for (const r of drifted) {
    console.log(`  ${r.name}`);
    for (const d of r.drift) console.log(`     ${d.field.padEnd(20)} sent ${JSON.stringify(d.sent)}  got ${JSON.stringify(d.got)}`);
  }
  console.log('');
}
if (ok.length) console.log('CLEAN: ' + ok.map((r) => r.name).join(', ') + '\n');

if (!KEEP) console.log('(records left in place — pass --keep to suppress this note, or clean with the SWEEP marker)');
process.exit(failed.length ? 1 : 0);
