/* Shared machinery for the tenant-scoping codemods.
 *
 * Both scripts/fix-tenant-writes.js and scripts/fix-tenant-reads.js need the
 * same three things: which tables actually have a tenant_id column, how to find
 * the end of a Supabase query chain, and what the tenant expression is called in
 * a given file. Keeping one copy means the verified table lists cannot drift
 * apart between the two.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

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

// Referenced in code but absent from the database entirely.
const NOT_IN_DB = new Set(['email_unsubscribes', 'todos', 'incidents']);

// Not tenant-scoped by design.
const GLOBAL_TABLE = /^(tenants|profiles|users|subscriptions|plans|states|state_.*|lien_waiver_templates|auth\.|storage\.)$/;

/** True when a tenant filter must not be added to this table. */
function skipTable(table) {
  if (NOT_IN_DB.has(table)) return 'not-in-database';
  if (NO_TENANT_COLUMN.has(table)) return 'no-tenant-column';
  if (GLOBAL_TABLE.test(table)) return 'global-table';
  return null;
}

/** Index of the ')' closing the call whose '(' sits at openIdx. */
function matchParen(src, openIdx) {
  let d = 0;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (c === '(') d++;
    else if (c === ')') { d--; if (d === 0) return i; }
  }
  return -1;
}

/**
 * End index of the statement starting at idx.
 *
 * The newline fallback matters: many of these chains have no trailing
 * semicolon, and scanning on for one swallows following statements — which then
 * look as though they already filter on tenant_id, so the real site is skipped.
 */
function statementEnd(src, idx, limit = 4000) {
  let d = 0;
  for (let i = idx; i < src.length && i < idx + limit; i++) {
    const c = src[i];
    if ('({['.includes(c)) d++;
    else if (')}]'.includes(c)) d--;
    else if (c === ';' && d <= 0) return i;
    else if (c === '\n' && d <= 0 && i > idx + 10) {
      const nxt = src.slice(i + 1, i + 60).trim();
      if (!nxt.startsWith('.')) return i - 1;
    }
  }
  return Math.min(idx + limit, src.length - 1);
}

/**
 * How this file refers to the caller's tenant, or null when it has no identity
 * in scope and must be handled by hand.
 */
function tenantExpr(src) {
  if (/const\s+user\s*=\s*await\s+getUser\s*\(/.test(src)) return 'user.tenantId';
  if (/const\s*\{[^}]*\btenantId\b[^}]*\}\s*=\s*auth\b/.test(src)) return 'tenantId';
  return null;
}

/** Every `.from('table')` occurrence, latest first so offsets stay valid. */
function fromSites(src) {
  const sites = [];
  for (const m of src.matchAll(/\.from\(\s*['"`]([\w.]+)['"`]\s*\)/g)) {
    sites.push({ index: m.index, table: m[1] });
  }
  return sites.reverse();
}

function loadFindings(cat) {
  const p = path.join(ROOT, 'audit.json');
  if (!fs.existsSync(p)) {
    console.error('audit.json not found — run: node scripts/prelaunch-audit.js --json > audit.json');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8')).filter((f) => f.cat === cat);
}

module.exports = {
  ROOT, NO_TENANT_COLUMN, NOT_IN_DB, GLOBAL_TABLE,
  skipTable, matchParen, statementEnd, tenantExpr, fromSites, loadFindings,
};
