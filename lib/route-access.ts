/**
 * Which screens a role may open — the app shell's half of the permission
 * rules, so a person never lands on a page whose every call is refused.
 *
 * The rules mirror the categories the screens' own API routes check (a
 * screen listed here with Budget is one whose data route answers 403 without
 * Budget). The server guard is still the security; this decides what the rail
 * lists and when the shell shows "You don't have access" instead of a page.
 *
 * A leaf: client-safe, no imports beyond the vocabulary.
 */
import { meetsLevel, type PermCategory, type PermLevel } from './permission-categories';

/** One rule: any of the listed rights opens it. `companyWide` = not for a job-scoped role (Subcontractor). */
export type AccessRule = { any: ReadonlyArray<readonly [PermCategory, PermLevel]>; companyWide?: boolean; label: string };

const r = (label: string, any: AccessRule['any'], companyWide = false): AccessRule => ({ label, any, companyWide });

/** /app/projects/<id><path> — the job's tools. Longest prefix wins. */
export const JOB_TOOL_ACCESS: Readonly<Record<string, AccessRule>> = {
  '/budget': r('the budget', [['Budget', 'View']]),
  '/commitments': r('commitments', [['Budget', 'View']]),
  '/contracts': r('contracts', [['Budget', 'View']]),
  '/purchase-orders': r('purchase orders', [['Budget', 'View']]),
  '/bills': r('bills', [['Budget', 'View']]),
  '/invoices': r('invoices', [['Budget', 'View']]),
  '/cash-flow': r('cash flow', [['Budget', 'View']]),
  '/payroll': r('payroll', [['Budget', 'View']]),
  '/pay-apps': r('pay applications', [['Pay Apps', 'View']]),
  '/change-orders': r('change orders', [['Change Orders', 'View']]),
  '/proposal': r('the proposal', [['Sales', 'View'], ['Budget', 'View']]),
  '/estimate': r('the estimate', [['Sales', 'View'], ['Budget', 'View']]),
  '/rfis': r('RFIs', [['RFIs', 'View']]),
  '/items/rfis': r('RFIs', [['RFIs', 'View']]),
  '/submittals': r('submittals', [['Submittals', 'View']]),
  '/safety': r('safety', [['Safety', 'View']]),
  '/schedule': r('the schedule', [['Schedule', 'View']]),
};

/** /app<path> — company screens. Longest prefix wins. */
export const COMPANY_ACCESS: Readonly<Record<string, AccessRule>> = {
  '/app/leads': r('the sales pipeline', [['Sales', 'View']], true),
  '/app/customers': r('customers', [['Sales', 'View']], true),
  '/app/sales': r('sales', [['Sales', 'View']], true),
  '/app/classic': r('the sales dashboard', [['Sales', 'View']], true),
  '/app/billing': r('billing and the subscription', [['Admin', 'View']], true),
  '/app/billing/payapp': r('pay applications', [['Pay Apps', 'View']], true),
  '/app/billing/cost-control': r('cost control', [['Budget', 'View']], true),
  '/app/invoicing': r('invoicing', [['Budget', 'View']], true),
  '/app/certified-payroll': r('certified payroll', [['Budget', 'View']], true),
  '/app/compliance/prevailing-wage': r('prevailing wage rates', [['Budget', 'View'], ['Admin', 'View']], true),
  '/app/people': r('people and roles', [['Admin', 'View']], true),
  '/app/roles-permissions': r('roles and permissions', [['Admin', 'View']], true),
  '/app/custom-fields': r('custom fields', [['Admin', 'View']], true),
  '/app/integrations': r('integrations', [['Admin', 'View']], true),
  '/app/approval-workflows': r('approval workflows', [['Admin', 'View']], true),
  '/app/settings/branding': r('company branding', [['Admin', 'View']], true),
  '/app/settings/import': r('data import', [['Admin', 'View']], true),
  '/app/settings/integrations-hub': r('integrations', [['Admin', 'View']], true),
  '/app/settings/platform-integrations': r('platform integrations', [['Admin', 'View']], true),
  '/app/settings/payments': r('payment settings', [['Admin', 'View']], true),
  '/app/settings/storage': r('storage settings', [['Admin', 'View']], true),
  '/app/sub-portal': r('the sub portal', [['Projects', 'Edit']], true),
  '/app/portals': r('portals', [['Projects', 'Edit']], true),
  '/app/projects/new': r('new jobs', [['Projects', 'Full']], true),
  '/app/subs': r('the subcontractor directory', [['Projects', 'View']], true),
  '/app/prequalification': r('prequalification', [['Projects', 'Edit']], true),
  '/app/resource-planning': r('resource planning', [['Projects', 'View']], true),
  '/app/reports': r('reports', [['Reports', 'View']], true),
  '/app/reports-builder': r('reports', [['Reports', 'View']], true),
  '/app/intelligence': r('portfolio intelligence', [['Reports', 'View']], true),
  '/app/bids': r('the bid board', [['Projects', 'Edit'], ['Budget', 'View']], true),
  '/app/bid-intelligence': r('bid intelligence', [['Sales', 'View'], ['Budget', 'View']], true),
  '/app/takeoff/rates': r('cost rates', [['Budget', 'View']], true),
  '/app/command-center': r('the command center', [['Projects', 'View']], true),
};

const JOB_RE = /^\/app\/projects\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\/.*)?$/i;

function longest(table: Readonly<Record<string, AccessRule>>, path: string): AccessRule | null {
  let best: string | null = null;
  for (const k of Object.keys(table)) {
    if ((path === k || path.startsWith(k + '/')) && (!best || k.length > best.length)) best = k;
  }
  return best ? table[best] : null;
}

/** The rule for a screen, or null when anyone signed in may open it. */
export function ruleFor(pathname: string): { rule: AccessRule | null; job: string | null } {
  const path = (pathname || '').split('?')[0].replace(/\/+$/, '') || '/';
  const m = path.match(JOB_RE);
  if (m) {
    const sub = m[2] || '';
    // Every page of a job needs Projects: View on that job ("No access" closes all of it).
    return { rule: longest(JOB_TOOL_ACCESS, sub) ?? r('this job', [['Projects', 'View']]), job: m[1].toLowerCase() };
  }
  return { rule: longest(COMPANY_ACCESS, path), job: null };
}

/** May a person with `perms` (and job scope) open this rule? */
export function allowedBy(
  rule: AccessRule | null,
  perms: Partial<Record<PermCategory, PermLevel>> | null | undefined,
  jobScoped = false,
): boolean {
  if (!rule) return true;
  if (!perms) return false;
  if (rule.companyWide && jobScoped) return false;
  // On a job, the job itself must be open too.
  return rule.any.some(([c, l]) => meetsLevel(perms[c], l));
}

/** Job pages also need the job open: Projects at least View there. */
export function jobOpen(perms: Partial<Record<PermCategory, PermLevel>> | null | undefined): boolean {
  return !!perms && meetsLevel(perms['Projects'], 'View');
}
