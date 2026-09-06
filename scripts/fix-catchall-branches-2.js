/* Second batch of catch-all branch scoping.
 *
 *   node scripts/fix-catchall-branches-2.js [--apply]
 *
 * Nine more branches of app/api/[...path]/route.ts read or write on the service
 * role client with a caller-supplied projectId and no tenant scope at all:
 *
 *   GET  /api/rfis                    GET  /api/change-orders
 *   GET  /api/takeoffs/latest         GET  /api/bid-packages
 *   GET  /api/bid-packages/:id        POST /api/bid-packages/create
 *   POST /api/bid-packages/suggest-subs
 *   POST /api/change-orders/create    POST /api/rfis/create
 *
 * Knowing a project id — or guessing one — was enough to read another tenant's
 * RFIs, change orders, takeoffs and bid packages, or to create records inside
 * their project. Each branch now resolves the caller with tenantFromToken(),
 * 401s without one, and filters or stamps tenant_id.
 */

const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');
const FILE = path.resolve(__dirname, '..', 'app/api/[...path]/route.ts');

let src = fs.readFileSync(FILE, 'utf8');
const EOL = src.includes('\r\n') ? '\r\n' : '\n';
const nl = (t) => t.split('\n').join(EOL);

const G = [
  "    const bearer = req.headers.get('authorization');",
  "    const tenantId = await tenantFromToken(bearer?.startsWith('Bearer ') ? bearer.slice(7) : null);",
  "    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });",
].join('\n');

const EDITS = [
  // ── GET /api/rfis ─────────────────────────────────────────────────────────
  ["  if (seg0 === 'rfis' && !seg1) {\n    const { searchParams } = new URL(req.url);",
   `  if (seg0 === 'rfis' && !seg1) {\n${G}\n    const { searchParams } = new URL(req.url);`],
  // The filter has to sit AFTER .select(): the query builder does not expose
  // .eq() until select() has been called.
  ["        .select('id, number, title, status, priority, assigned_to, response_due_date, cost_impact_amount, schedule_impact_days, created_at')\n        .eq('project_id', projectId)",
   "        .select('id, number, title, status, priority, assigned_to, response_due_date, cost_impact_amount, schedule_impact_days, created_at')\n        .eq('tenant_id', tenantId)\n        .eq('project_id', projectId)"],

  // ── GET /api/change-orders ────────────────────────────────────────────────
  ["        .from('change_orders')\n        .select('id, co_number, title, status, cost_impact, schedule_impact_days, reason, created_at')\n        .eq('project_id', projectId)",
   "        .from('change_orders')\n        .select('id, co_number, title, status, cost_impact, schedule_impact_days, reason, created_at')\n        .eq('tenant_id', tenantId)\n        .eq('project_id', projectId)"],

  // ── GET /api/takeoffs/latest ──────────────────────────────────────────────
  ["  if (seg0 === 'takeoffs' && seg1 === 'latest') {\n    const { searchParams } = new URL(req.url);",
   `  if (seg0 === 'takeoffs' && seg1 === 'latest') {\n${G}\n    const { searchParams } = new URL(req.url);`],
  ["await supabaseAdmin.from('takeoffs').select('id, project_id, status, materials').eq('p",
   "await supabaseAdmin.from('takeoffs').select('id, project_id, status, materials').eq('tenant_id', tenantId).eq('p"],

  // ── GET /api/bid-packages ─────────────────────────────────────────────────
  ["  if (seg0 === 'bid-packages' && !seg1) {\n    const { searchParams } = new URL(req.url);",
   `  if (seg0 === 'bid-packages' && !seg1) {\n${G}\n    const { searchParams } = new URL(req.url);`],
  ["        .from('bid_packages')\n        .select('id, code, name, trade, status, bid_due_date, awarded_to, awarded_amount, created_at')\n        .eq('project_id', projectId)",
   "        .from('bid_packages')\n        .select('id, code, name, trade, status, bid_due_date, awarded_to, awarded_amount, created_at')\n        .eq('tenant_id', tenantId)\n        .eq('project_id', projectId)"],

  // ── GET /api/bid-packages/:id ─────────────────────────────────────────────
  ["  if (seg0 === 'bid-packages' && seg1 && !seg2) {\n    const id = seg1;",
   `  if (seg0 === 'bid-packages' && seg1 && !seg2) {\n${G}\n    const id = seg1;`],

  // ── POST /api/bid-packages/create ─────────────────────────────────────────
  ["  if (seg0 === 'bid-packages' && seg1 === 'create') {\n    const body = await req.json().catch(() => ({}));",
   `  if (seg0 === 'bid-packages' && seg1 === 'create') {\n${G}\n    const body = await req.json().catch(() => ({}));`],
  ["await supabaseAdmin.from('bid_packages').select('*', { count: 'exact', head: true }).eq('project_id', proj",
   "await supabaseAdmin.from('bid_packages').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('project_id', proj"],
  ["await supabaseAdmin.from('bid_packages').insert({ project_id: projectId,",
   "await supabaseAdmin.from('bid_packages').insert({ tenant_id: tenantId, project_id: projectId,"],

  // ── POST /api/bid-packages/suggest-subs ───────────────────────────────────
  ["  if (seg0 === 'bid-packages' && seg1 === 'suggest-subs') {\n    let trade = ''; let projectId = '';",
   `  if (seg0 === 'bid-packages' && seg1 === 'suggest-subs') {\n${G}\n    let trade = ''; let projectId = '';`],
  ["await supabaseAdmin.from('sub_performance').select('id, name, trade, email, win_rate, last_project, ",
   "await supabaseAdmin.from('sub_performance').select('id, name, trade, email, win_rate, last_project, "],

  // ── POST /api/change-orders/create ────────────────────────────────────────
  ["  if (seg0 === 'change-orders' && seg1 === 'create') {\n    const body = await req.json().catch(() => ({}));",
   `  if (seg0 === 'change-orders' && seg1 === 'create') {\n${G}\n    const body = await req.json().catch(() => ({}));`],
  ["await supabaseAdmin.from('change_orders').select('*', { count: 'exact', head: true }).eq('project_id', projectId);",
   "await supabaseAdmin.from('change_orders').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('project_id', projectId);"],
  ["await supabaseAdmin.from('change_orders').insert({ project_id: projectId, co_number: coNumber,",
   "await supabaseAdmin.from('change_orders').insert({ tenant_id: tenantId, project_id: projectId, co_number: coNumber,"],

  // ── POST /api/rfis/create ─────────────────────────────────────────────────
  ["  if (seg0 === 'rfis' && seg1 === 'create') {\n    const body = await req.json().catch(() => ({}));",
   `  if (seg0 === 'rfis' && seg1 === 'create') {\n${G}\n    const body = await req.json().catch(() => ({}));`],
  ["await supabaseAdmin.from('rfis').select('*', { count: 'exact', head: true }).eq('project_id', projectId);",
   "await supabaseAdmin.from('rfis').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('project_id', projectId);"],
  ["await supabaseAdmin.from('rfis').insert({ project_id: projectId, number, title,",
   "await supabaseAdmin.from('rfis').insert({ tenant_id: tenantId, project_id: projectId, number, title,"],
];

let applied = 0;
const missed = [];
for (const [rawFind, rawRepl] of EDITS) {
  if (rawFind === rawRepl) continue;                 // placeholder, nothing to do
  const find = nl(rawFind);
  const n = src.split(find).length - 1;
  if (n === 0) { missed.push(rawFind.trim().slice(0, 70)); continue; }
  src = src.split(find).join(nl(rawRepl));
  applied += n;
}

if (missed.length) {
  console.log('did not match:');
  missed.forEach((m) => console.log('    ' + JSON.stringify(m)));
}
console.log(`\n${APPLY ? 'APPLIED' : 'DRY RUN'}: ${applied} edit(s)`);
if (APPLY && applied) fs.writeFileSync(FILE, src);
if (!APPLY) console.log('re-run with --apply to write');
