/* Scopes the remaining branches of the catch-all dispatcher to a tenant.
 *
 *   node scripts/fix-catchall-branches.js [--apply]
 *
 * app/api/[...path]/route.ts dispatches many endpoints from two handlers. Most
 * branches were already fixed; these had no tenant in scope at all and queried
 * with the service role key, which bypasses RLS. The worst:
 *
 *   GET /api/dashboard/stats  active project count, open bids, pending pay
 *                             applications, total contract value and monthly
 *                             revenue — summed across EVERY tenant, to an
 *                             anonymous caller
 *   GET /api/dashboard/today  pending pay applications with project names,
 *                             expiring COIs with subcontractor names, and
 *                             unread notifications — same, all tenants
 *
 * Each branch now resolves the caller with tenantFromToken() and 401s without
 * one, then filters every query. Written as explicit per-branch edits rather
 * than a blanket regex because the branches differ in shape and a wrong guess
 * here silently returns nothing instead of leaking — both are bugs.
 */

const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');
const FILE = path.resolve(__dirname, '..', 'app/api/[...path]/route.ts');

let src = fs.readFileSync(FILE, 'utf8');
const EOL = src.includes('\r\n') ? '\r\n' : '\n';
const nl = (t) => t.split('\n').join(EOL);

const GUARD = (indent) => [
  `${indent}const bearer = req.headers.get('authorization');`,
  `${indent}const tenantId = await tenantFromToken(bearer?.startsWith('Bearer ') ? bearer.slice(7) : null);`,
  `${indent}if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });`,
].join('\n');

const EDITS = [
  // ── GET /api/dashboard/stats ──────────────────────────────────────────────
  ["  if (seg0 === 'dashboard' && seg1 === 'stats') {\n    try {",
   `  if (seg0 === 'dashboard' && seg1 === 'stats') {\n${GUARD('    ')}\n    try {`],

  ["        supabase.from('projects').select('id', { count: 'exact', head: true }).eq('status', 'active'),",
   "        supabase.from('projects').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'active'),"],

  ["        supabase.from('bids').select('id', { count: 'exact', head: true }).in('status', ['draft', 'submitted', 'under_review']),",
   "        supabase.from('bids').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).in('status', ['draft', 'submitted', 'under_review']),"],

  ["        supabase.from('pay_applications').select('id', { count: 'exact', head: true }).eq('status', 'submitted'),",
   "        supabase.from('pay_applications').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'submitted'),"],

  ["        supabase.from('projects').select('contract_amount').eq('status', 'active'),",
   "        supabase.from('projects').select('contract_amount').eq('tenant_id', tenantId).eq('status', 'active'),"],

  ["await supabase.from('pay_applications').select('current_payment_due').eq('status', 'approved')",
   "await supabase.from('pay_applications').select('current_payment_due').eq('tenant_id', tenantId).eq('status', 'approved')"],

  // ── GET /api/dashboard/today ──────────────────────────────────────────────
  ["  if (seg0 === 'dashboard' && seg1 === 'today') {\n    const items: ActionItem[] = [];",
   `  if (seg0 === 'dashboard' && seg1 === 'today') {\n${GUARD('    ')}\n    const items: ActionItem[] = [];`],

  ["await supabase.from('pay_applications').select('id, application_number, status, project_id, projects(name)')",
   "await supabase.from('pay_applications').select('id, application_number, status, project_id, projects(name)').eq('tenant_id', tenantId)"],

  ["await supabase.from('insurance_certificates').select('id, sub_name, expiry_date, project_id')",
   "await supabase.from('insurance_certificates').select('id, sub_name, expiry_date, project_id').eq('tenant_id', tenantId)"],

  ["await supabase.from('notifications').select('id, type, title, message, entity_id, urgency')",
   "await supabase.from('notifications').select('id, type, title, message, entity_id, urgency').eq('tenant_id', tenantId)"],

  // ── autopilot/alerts — the filter was optional, so omitting it read everyone
  ["      let q = supabaseAdmin.from('autopilot_alerts').select('*').eq('dismissed', false)",
   "      let q = supabaseAdmin.from('autopilot_alerts').select('*').eq('tenant_id', tenantId).eq('dismissed', false)"],
  ["      if (tenantId) q = q.eq('tenant_id', tenantId);\n",
   ""],
];

let applied = 0;
const missed = [];
for (const [rawFind, rawRepl] of EDITS) {
  const find = nl(rawFind);
  const n = src.split(find).length - 1;
  if (n === 0) { missed.push(rawFind.trim().slice(0, 66)); continue; }
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
process.exit(missed.length ? 1 : 0);
