/* Adds the missing tenant filter to cross-tenant WRITE sites.
 *
 *   node scripts/fix-tenant-writes.js           # dry run, prints the plan
 *   node scripts/fix-tenant-writes.js --apply   # writes the files
 *
 * createServerClient() uses SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS.
 * On those routes .eq('tenant_id', user.tenantId) is the ONLY thing separating
 * tenants, so an update/delete without it lets any authenticated user mutate
 * any other tenant's rows.
 *
 * Conservative by design. A site is only rewritten when ALL of these hold:
 *   - the file declares `const user = await getUser(...)`
 *   - the target table actually has a tenant_id column (verified against
 *     information_schema, see NO_TENANT_COLUMN below)
 *   - the statement contains .update( / .delete( / .upsert( and no tenant_id
 * Everything else is reported for manual handling rather than guessed at.
 */

const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');
const ROOT = path.resolve(__dirname, '..');

// Verified 2026-09-05 against information_schema on jddfvugsaosvgllbkzch.
// These public tables have NO tenant_id column — they are scoped through a
// parent row, so a tenant filter here would error at runtime.
const NO_TENANT_COLUMN = new Set([
  'admin_access_log', 'ai_pricing', 'climate_recommendations', 'daily_log_crew',
  'daily_log_photos', 'daily_log_weather', 'design_comparison_variants',
  'design_contractor_leads', 'design_room_package_items', 'design_saved_gallery',
  'design_style_presets', 'design_style_swipes', 'documents', 'email_verifications',
  'network_site_templates', 'password_resets', 'pay_application_lines', 'plans',
  'platform_admins', 'platform_integrations', 'portal_sub_bid_line_items',
  'portal_sub_bid_responses', 'portal_sub_pay_app_line_items', 'prevailing_wage_rates',
  'proposal_lines', 'referrals', 'roi_configs', 'selection_options', 'storage_pricing',
  'subscription_plans', 'support_plans', 'support_ticket_messages',
  'takeoff_blueprints', 'takeoff_cost_items', 'takeoff_trials', 'tenants',
  'user_pricing_tiers', 'webhook_deliveries',
]);

// Referenced in code but absent from the database entirely — writing to these
// fails at runtime regardless of tenancy. Reported, never rewritten.
const NOT_IN_DB = new Set(['email_unsubscribes', 'todos', 'incidents']);

const findings = JSON.parse(fs.readFileSync(path.join(ROOT, 'audit.json'), 'utf8'))
  .filter(f => f.cat === 'cross-tenant-write');

/** End index of the balanced call whose '(' is at openIdx. */
function matchParen(src, openIdx) {
  let d = 0;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (c === '(') d++;
    else if (c === ')') { d--; if (d === 0) return i; }
  }
  return -1;
}

const byFile = {};
for (const f of findings) (byFile[f.file] ||= []).push(f);

const report = { rewritten: 0, files: 0, skipNoUser: [], skipNoColumn: [], skipNotInDb: [], skipOther: [] };

for (const [relFile, list] of Object.entries(byFile)) {
  const abs = path.join(ROOT, relFile);
  let src = fs.readFileSync(abs, 'utf8');
  // Either guard puts a tenant id in scope, under a different name.
  const hasUser = /const\s+user\s*=\s*await\s+getUser\s*\(/.test(src);
  const hasTenantId = /const\s*\{[^}]*\btenantId\b[^}]*\}\s*=\s*auth\b/.test(src);
  const tenantExpr = hasUser ? 'user.tenantId' : 'tenantId';
  let touched = 0;

  // Rewrite from the end so earlier offsets stay valid.
  const sites = [];
  for (const m of src.matchAll(/\.from\(\s*['"`]([\w.]+)['"`]\s*\)/g)) sites.push({ i: m.index, table: m[1] });
  sites.reverse();

  for (const site of sites) {
    const { table } = site;
    // Bound the statement exactly as the audit does. The newline fallback
    // matters: plenty of these chains have no trailing semicolon, and scanning
    // on for one swallows later statements — which then look like they already
    // filter on tenant_id, so the real site is skipped.
    let end = site.i + 4000, d = 0;
    for (let i = site.i; i < src.length && i < site.i + 4000; i++) {
      const c = src[i];
      if ('({['.includes(c)) d++;
      else if (')}]'.includes(c)) d--;
      else if (c === ';' && d <= 0) { end = i; break; }
      else if (c === '\n' && d <= 0 && i > site.i + 10) {
        const nxt = src.slice(i + 1, i + 60).trim();
        if (!nxt.startsWith('.')) { end = i - 1; break; }
      }
    }
    const stmt = src.slice(site.i, end + 1);
    if (!/\.(update|delete|upsert)\s*\(/.test(stmt)) continue;
    if (/tenant_id/.test(stmt)) continue;

    if (NOT_IN_DB.has(table))        { report.skipNotInDb.push(`${relFile}  ${table}`); continue; }
    if (NO_TENANT_COLUMN.has(table)) { report.skipNoColumn.push(`${relFile}  ${table}`); continue; }
    if (!hasUser && !hasTenantId)    { report.skipNoUser.push(`${relFile}  ${table}`); continue; }

    // Insert immediately after the write call so it joins the filter chain.
    const wm = /\.(update|delete|upsert)\s*\(/.exec(stmt);
    const openRel = wm.index + wm[0].length - 1;
    const closeRel = matchParen(stmt, openRel);
    if (closeRel < 0) { report.skipOther.push(`${relFile}  ${table}  unbalanced call`); continue; }

    const at = site.i + closeRel + 1;
    src = src.slice(0, at) + `.eq('tenant_id', ${tenantExpr})` + src.slice(at);
    touched++;
  }

  if (touched) {
    report.rewritten += touched;
    report.files++;
    if (APPLY) fs.writeFileSync(abs, src);
    console.log(`${touched === 1 ? ' ' : ''}${touched}  ${relFile}`);
  }
}

const show = (label, arr) => {
  if (!arr.length) return;
  console.log(`\n${label} (${arr.length}) — handle by hand:`);
  [...new Set(arr)].slice(0, 20).forEach(x => console.log('    ' + x));
};
console.log(`\n${APPLY ? 'APPLIED' : 'DRY RUN'}: ${report.rewritten} write sites in ${report.files} files`);
show('no getUser in file', report.skipNoUser);
show('table has no tenant_id column', report.skipNoColumn);
show('table not in database', report.skipNotInDb);
show('could not parse', report.skipOther);
if (!APPLY) console.log('\nre-run with --apply to write');
