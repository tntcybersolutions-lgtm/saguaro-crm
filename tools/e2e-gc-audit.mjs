/**
 * e2e-gc-audit — every function a GC performs, run for real, pass or fail.
 *
 * The page sweep answers "does every screen load". It cannot answer "does the
 * product WORK", because a page that renders an empty table renders fine. This
 * walks the job the way a general contractor does — a customer becomes a lead,
 * a lead becomes a project, the drawings get taken off, packages go out, subs
 * bid, one is awarded, the money flows, the job closes — and calls the same
 * endpoints the UI calls, with real payloads, checking what came back.
 *
 * Every step records PASS or FAIL with the status and the server's own words.
 * Nothing is skipped quietly: a step that cannot run because an earlier one
 * failed is reported as BLOCKED, naming what blocked it, because "we did not
 * test it" and "it works" must never look the same in a report.
 *
 * Creates real records in the tenant it signs in as. Point it at a QA tenant.
 *
 *   node tools/e2e-gc-audit.mjs
 *   SWEEP_BASE=http://localhost:3000 node tools/e2e-gc-audit.mjs
 *   node tools/e2e-gc-audit.mjs --json audit.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const BASE = process.env.SWEEP_BASE || 'https://saguarocontrol.net';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
const { data: auth, error: authErr } = await sb.auth.signInWithPassword({
  email: env.SAGUARO_QA_EMAIL,
  password: env.SAGUARO_QA_PASS,
});
if (authErr || !auth?.session) {
  console.log('SIGN-IN FAILED:', authErr?.message || 'no session');
  process.exit(1);
}
const H = {
  cookie: `sb-access-token=${auth.session.access_token}; sb-refresh-token=${auth.session.refresh_token}`,
  authorization: `Bearer ${auth.session.access_token}`,
  'content-type': 'application/json',
};

const results = [];
const state = {};          // ids carried between steps
const stamp = Date.now().toString().slice(-6);

/** Run one function. `fn` returns a value on success or throws with a reason. */
async function step(area, name, need, fn) {
  const missing = (need || []).filter((k) => !state[k]);
  if (missing.length) {
    results.push({ area, name, status: 'BLOCKED', detail: `needs ${missing.join(', ')}` });
    return null;
  }
  try {
    const out = await fn();
    results.push({ area, name, status: 'PASS', detail: out?.note || '' });
    return out?.value ?? out ?? true;
  } catch (e) {
    results.push({ area, name, status: 'FAIL', detail: (e?.message || String(e)).slice(0, 150) });
    return null;
  }
}

/** POST/GET that fails loudly with the server's own message. */
async function call(method, path, body) {
  const r = await fetch(BASE + path, {
    method,
    headers: H,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }
  if (!r.ok) {
    throw new Error(`${r.status} ${json?.error || text.slice(0, 110) || r.statusText}`);
  }
  if (json?.error) throw new Error(`200 but error: ${json.error}`);
  return json;
}
const GET = (p) => call('GET', p);
const POST = (p, b) => call('POST', p, b);

/** First array found on a response, whatever the envelope calls it. */
const rows = (j) => {
  if (Array.isArray(j)) return j;
  for (const k of ['data', 'items', 'rows', 'results', 'customers', 'projects', 'packages',
                   'bidPackages', 'subs', 'documents', 'activities', 'budgets', 'logs',
                   'changeOrders', 'payApps', 'invoices', 'bills', 'contracts', 'leads']) {
    if (Array.isArray(j?.[k])) return j[k];
  }
  const firstArray = Object.values(j || {}).find(Array.isArray);
  return firstArray || [];
};

console.log(`\n  GC END-TO-END AUDIT — ${BASE}`);
console.log(`  signed in as ${env.SAGUARO_QA_EMAIL}\n`);

/* ── SALES CRM ─────────────────────────────────────────────────────────── */

await step('Sales CRM', 'Read customer list', [], async () => {
  const j = await GET('/api/customers');
  return { note: `${rows(j).length} customers` };
});

state.customerId = await step('Sales CRM', 'Create a customer', [], async () => {
  const j = await POST('/api/customers', {
    name: `Audit Customer ${stamp}`,
    email: `audit.customer.${stamp}@example.test`,
    phone: '(602) 555-0100',
    status: 'customer',
    state: 'AZ',
  });
  const id = j?.customer?.id || j?.data?.id || j?.id;
  if (!id) throw new Error('created but no id returned');
  return { value: id, note: id };
});

await step('Sales CRM', 'Read lead pipeline', [], async () => {
  const j = await GET('/api/leads');
  return { note: `${rows(j).length} leads` };
});

await step('Sales CRM', 'Read bid board', [], async () => {
  const j = await GET('/api/bids/list');
  return { note: `${rows(j).length} bids` };
});

await step('Sales CRM', 'Read bid history', [], async () => {
  const j = await GET('/api/bids/history');
  return { note: `${rows(j).length} records` };
});

/* ── PROJECT SETUP ─────────────────────────────────────────────────────── */

state.projectId = await step('Project', 'Create a project', [], async () => {
  const j = await POST('/api/projects/create', {
    name: `Audit Job ${stamp}`,
    address: '1 Audit Way, Phoenix, AZ 85001',
    phase: 'bidding',
  });
  const id = j?.projectId || j?.project?.id;
  if (!id) throw new Error('created but no projectId returned');
  return { value: id, note: id };
});

await step('Project', 'Read project list', [], async () => {
  const j = await GET('/api/projects?limit=5&fields=id,name');
  return { note: `${rows(j).length} projects` };
});

await step('Project', 'Read one project', ['projectId'], async () => {
  const j = await GET(`/api/projects/${state.projectId}`);
  if (!j) throw new Error('empty response');
  return { note: 'ok' };
});

/* ── PRECONSTRUCTION ───────────────────────────────────────────────────── */

await step('Preconstruction', 'Read catalog', [], async () => {
  const j = await GET('/api/catalog');
  return { note: `${rows(j).length} items` };
});

await step('Preconstruction', 'Read takeoffs for project', ['projectId'], async () => {
  const j = await GET(`/api/takeoff?projectId=${state.projectId}&limit=5`);
  return { note: `${rows(j).length} takeoffs` };
});

state.bidPackageId = await step('Preconstruction', 'Create a bid package', ['projectId'], async () => {
  const j = await POST('/api/bid-packages/create', {
    project_id: state.projectId,
    name: `Audit Package ${stamp}`,
    trade: 'Electrical',
    scope: 'Audit scope of work.',
    due_date: new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10),
  });
  const id = j?.bidPackage?.id || j?.package?.id || j?.data?.id || j?.id;
  if (!id) throw new Error('created but no id returned');
  return { value: id, note: id };
});

await step('Preconstruction', 'Read bid packages', ['projectId'], async () => {
  const j = await GET(`/api/bid-packages/list?projectId=${state.projectId}`);
  return { note: `${rows(j).length} packages` };
});

await step('Preconstruction', 'Generate a bid jacket', ['bidPackageId'], async () => {
  await POST(`/api/bid-packages/${state.bidPackageId}/generate-jacket`, {});
  return { note: 'jacket generated' };
});

/* ── SUBS & BIDDING ────────────────────────────────────────────────────── */

state.subId = await step('Subs', 'Create a subcontractor', [], async () => {
  const j = await POST('/api/subcontractors', {
    company_name: `Audit Electric ${stamp}`,
    trade: 'Electrical',
    email: `audit.sub.${stamp}@example.test`,
    phone: '(480) 555-0100',
    license_number: `ROC-${stamp}`,
    state: 'AZ',
  });
  const id = j?.sub?.id || j?.data?.id || j?.id;
  if (!id) throw new Error('created but no id returned');
  return { value: id, note: id };
});

await step('Subs', 'Read subcontractor directory', [], async () => {
  const j = await GET('/api/subcontractors');
  return { note: `${rows(j).length} on file` };
});

await step('Subs', 'Invite sub to bid', ['bidPackageId', 'subId'], async () => {
  const j = await POST(`/api/bid-packages/${state.bidPackageId}/invite-subs`, {
    subs: [{ name: `Audit Electric ${stamp}`, email: `audit.sub.${stamp}@example.test`, subId: state.subId }],
  });
  const first = (j?.results || [])[0];
  if (first && first.status !== 'invited') throw new Error(first.error || 'not invited');
  return { note: 'invited' };
});

await step('Subs', 'Suggest subs for a package', ['bidPackageId'], async () => {
  const j = await GET(`/api/bid-packages/suggest-subs?packageId=${state.bidPackageId}`);
  return { note: `${rows(j).length} suggested` };
});

await step('Bidding', 'Read leveling for a package', ['bidPackageId'], async () => {
  const j = await GET(`/api/bid-packages/${state.bidPackageId}/leveling`);
  if (!j) throw new Error('empty response');
  return { note: 'leveling loaded' };
});

/* ── FINANCIAL ─────────────────────────────────────────────────────────── */

state.budgetId = await step('Financial', 'Create a budget line', ['projectId'], async () => {
  /* Deliberately snake_case: this endpoint took projectId only, so the very
     object that created a bid package failed here. Passing the sibling spelling
     is the regression test. */
  const j = await POST('/api/budgets/create', {
    project_id: state.projectId,
    name: `Audit Budget ${stamp}`,
    originalTotal: 10000,
    lineItems: [{ csi_division: '26', description: 'Audit budget line', original_amount: 10000 }],
  });
  const id = j?.budget?.id || j?.data?.id || j?.id;
  return { value: id || true, note: id ? String(id) : 'created' };
});

await step('Financial', 'Read budget', ['projectId'], async () => {
  const j = await GET(`/api/budgets/list?projectId=${state.projectId}`);
  return { note: `${rows(j).length} lines` };
});

state.changeOrderId = await step('Financial', 'Create a change order', ['projectId'], async () => {
  const j = await POST('/api/change-orders/create', {
    project_id: state.projectId,
    title: `Audit CO ${stamp}`,
    description: 'Audit change order',
    amount: 2500,
    status: 'pending',
  });
  const id = j?.changeOrder?.id || j?.data?.id || j?.id;
  return { value: id || true, note: id ? String(id) : 'created' };
});

await step('Financial', 'Read change orders', ['projectId'], async () => {
  const j = await GET(`/api/change-orders/list?projectId=${state.projectId}`);
  return { note: `${rows(j).length} change orders` };
});

state.payAppId = await step('Financial', 'Create a pay application', ['projectId'], async () => {
  const j = await POST('/api/pay-apps/create', {
    projectId: state.projectId,
    periodFrom: new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10),
    periodTo: new Date().toISOString().slice(0, 10),
  });
  const id = j?.payApp?.id;
  if (!id) throw new Error('created but no id returned');
  return { value: id, note: id };
});

await step('Financial', 'Read pay applications', ['projectId'], async () => {
  const j = await GET(`/api/pay-apps/list?projectId=${state.projectId}`);
  return { note: `${rows(j).length} pay apps` };
});

await step('Financial', 'Read invoices', ['projectId'], async () => {
  const j = await GET(`/api/invoices/list?projectId=${state.projectId}`);
  return { note: `${rows(j).length} invoices` };
});

await step('Financial', 'Read bills', ['projectId'], async () => {
  const j = await GET(`/api/bills/list?projectId=${state.projectId}`);
  return { note: `${rows(j).length} bills` };
});

await step('Financial', 'Create a contract', ['projectId'], async () => {
  /* snake_case again — contracts, bills and invoices took project_id alone. */
  const j = await POST('/api/contracts/create', {
    project_id: state.projectId,
    title: `Audit Contract ${stamp}`,
    party_name: `Audit Electric ${stamp}`,
    contract_amount: 10000,
  });
  const id = j?.contract?.id || j?.data?.id || j?.id;
  return { note: id ? String(id) : 'created' };
});

await step('Financial', 'Create a vendor bill', ['projectId'], async () => {
  const j = await POST('/api/bills/create', {
    project_id: state.projectId,
    vendor_name: `Audit Electric ${stamp}`,
    amount: 2500,
  });
  const id = j?.bill?.id || j?.data?.id || j?.id;
  return { note: id ? String(id) : 'created' };
});

await step('Financial', 'Create a client invoice', ['projectId'], async () => {
  const j = await POST('/api/invoices/create', {
    project_id: state.projectId,
    vendor_name: `Audit Customer ${stamp}`,
    amount: 5000,
  });
  const id = j?.invoice?.id || j?.data?.id || j?.id;
  return { note: id ? String(id) : 'created' };
});

await step('Financial', 'Read cost control report', ['projectId'], async () => {
  const j = await GET(`/api/cost-control?projectId=${state.projectId}`);
  if (!j) throw new Error('empty response');
  return { note: 'loaded' };
});

/* ── FIELD ─────────────────────────────────────────────────────────────── */

await step('Field', 'Create a daily log', ['projectId'], async () => {
  const j = await POST('/api/daily-logs/create', {
    project_id: state.projectId,
    log_date: new Date().toISOString().slice(0, 10),
    weather: 'Clear, 88F',
    notes: 'Audit daily log entry.',
  });
  const id = j?.log?.id || j?.data?.id || j?.id;
  return { note: id ? String(id) : 'created' };
});

await step('Field', 'Read daily logs', ['projectId'], async () => {
  const j = await GET(`/api/daily-logs/list?projectId=${state.projectId}`);
  return { note: `${rows(j).length} logs` };
});

await step('Field', 'Read schedule', ['projectId'], async () => {
  const j = await GET(`/api/schedule/list?projectId=${state.projectId}`);
  return { note: `${rows(j).length} tasks` };
});

await step('Field', 'Read RFIs', ['projectId'], async () => {
  const j = await GET(`/api/rfis?projectId=${state.projectId}`);
  return { note: `${rows(j).length} RFIs` };
});

/* ── DOCUMENTS & COMPLIANCE ────────────────────────────────────────────── */

await step('Documents', 'Read document library', [], async () => {
  const j = await GET('/api/documents/library');
  return { note: `${rows(j).length} documents` };
});

await step('Documents', 'Request a W-9', ['projectId'], async () => {
  await POST('/api/documents/w9-request', {
    projectId: state.projectId,
    vendorName: `Audit Electric ${stamp}`,
    vendorEmail: `audit.sub.${stamp}@example.test`,
  });
  return { note: 'requested' };
});

await step('Compliance', 'Read compliance register', [], async () => {
  const j = await GET('/api/compliance');
  if (!j) throw new Error('empty response');
  return { note: 'loaded' };
});

await step('Compliance', 'Read lien deadlines', [], async () => {
  const j = await GET('/api/compliance/lien-deadlines');
  if (!j) throw new Error('empty response');
  return { note: 'loaded' };
});

/* ── CLOSEOUT ──────────────────────────────────────────────────────────── */

await step('Closeout', 'Read closeout checklist', ['projectId'], async () => {
  const j = await GET(`/api/projects/${state.projectId}/closeout`);
  if (!j) throw new Error('empty response');
  return { note: `${rows(j).length} items` };
});

/* ── DASHBOARD & HISTORY ───────────────────────────────────────────────── */

await step('Dashboard', 'Read dashboard stats', [], async () => {
  const j = await GET('/api/dashboard/stats');
  if (!j) throw new Error('empty response');
  return { note: 'loaded' };
});

await step('Dashboard', "Read today's priority actions", [], async () => {
  const j = await GET('/api/dashboard/today');
  return { note: `${rows(j).length} items` };
});

await step('Dashboard', 'Read company tool signals', [], async () => {
  const j = await GET('/api/company-tools');
  if (!j?.signals) throw new Error('no signals returned');
  return { note: 'loaded' };
});

await step('History', 'Read company activity feed', [], async () => {
  const j = await GET('/api/activity?limit=20');
  const n = rows(j).length;
  if (n === 0) throw new Error('activity feed is empty — nothing is recording');
  return { note: `${n} events` };
});

await step('History', 'Activity recorded this run', ['projectId'], async () => {
  const j = await GET(`/api/activity?project=${state.projectId}&limit=20`);
  const n = rows(j).length;
  if (n === 0) throw new Error('no activity recorded for the project just created');
  return { note: `${n} events on the new job` };
});

/* ── REPORT ────────────────────────────────────────────────────────────── */

const pass = results.filter((r) => r.status === 'PASS').length;
const fail = results.filter((r) => r.status === 'FAIL');
const blocked = results.filter((r) => r.status === 'BLOCKED');

let area = '';
for (const r of results) {
  if (r.area !== area) { area = r.area; console.log(`\n  ${area.toUpperCase()}`); }
  const mark = r.status === 'PASS' ? '  ok  ' : r.status === 'FAIL' ? ' FAIL ' : ' skip ';
  console.log(`  ${mark} ${r.name.padEnd(36)} ${r.detail}`);
}

console.log(`\n  ${pass} passed · ${fail.length} failed · ${blocked.length} blocked · ${results.length} total\n`);

if (fail.length) {
  console.log('  FAILURES');
  for (const f of fail) console.log(`    ${f.area} — ${f.name}: ${f.detail}`);
  console.log('');
}

const jsonIdx = process.argv.indexOf('--json');
if (jsonIdx > -1 && process.argv[jsonIdx + 1]) {
  writeFileSync(process.argv[jsonIdx + 1], JSON.stringify({ base: BASE, results, state }, null, 2));
  console.log(`  wrote ${process.argv[jsonIdx + 1]}\n`);
}

process.exit(fail.length ? 1 : 0);
