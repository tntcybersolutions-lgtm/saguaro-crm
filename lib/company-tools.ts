/**
 * company-tools — which of the company rail's tools a tenant actually shows.
 *
 * The sibling of lib/project-tools, applying the same discipline one level up.
 * Project scope was cut from 50 visible tools to about 13 by asking "does this
 * module have any work in it"; company scope was left at 40, which is most of
 * the wall a GC meets at login.
 *
 * THE RULE, borrowed from Procore and from project-tools, in this order:
 *
 *   1. CORE — the spine. Always shown, on day one with an empty database,
 *      because these are how you put the first thing into the product.
 *   2. HAS WORK IN IT — a tool holding real records shows itself. The rail
 *      must never hide something someone has already used.
 *   3. YOU ARE STANDING ON IT — the current page always appears.
 *
 * Everything else sits behind "All tools". Nothing is removed and no
 * entitlement changes: a plan without Fleet still never lists Fleet, which is
 * a different question from whether this tenant uses it.
 *
 * WHY THIS IS NOT THE core/showAll SYSTEM THAT WAS DELETED:
 * that one hid items by a rule the user never set and re-decided on every
 * navigation, so the rail's shape moved and could not be learned. This decides
 * from the tenant's OWN DATA, which changes when they start using a tool and
 * not when they click around. Adding your first vehicle reveals Fleet, and it
 * stays revealed.
 */

/** Counts from /api/company-tools. Every field optional — a missing key means
 *  "no evidence of work", never a crash. */
export interface CompanySignals {
  fleet?: number;
  time?: number;
  takeoffs?: number;
  network?: number;
  radio?: number;
  documents?: number;
  dailyLogs?: number;
  schedule?: number;
  invoices?: number;
  payApps?: number;
  portals?: number;
  autopilot?: number;
  bidHistory?: number;
  bidPackages?: number;
  savedReports?: number;
  people?: number;
  subs?: number;
  leads?: number;
}

/**
 * The spine. A GC can get from signing up to issuing their first pay
 * application on these and nothing else, so they show on an empty account.
 *
 * Catalog is here because it is not tenant data at all — it ships with 223
 * priced items and 16 vendors, so it is useful on day one and "has work in
 * it" would be the wrong question to ask of it.
 */
export const CORE_COMPANY_TOOLS: readonly string[] = [
  '/app',                 // Dashboard
  '/app/my-work',
  '/app/projects',
  '/app/bids',            // Bids & Estimates
  '/app/takeoff',         // Takeoff Studio
  '/app/catalog',
  '/app/documents',
  '/app/people',
  /* CUSTOMERS IS WHERE THE WORK STARTS, SO IT CANNOT BE EARNED.
     This was gated on the leads signal — `(s.leads || 0) > 0`, counting rows in
     lead_pipeline — so a GC who had customers but had never touched the leads
     board could not see their own customer list. The gating is backwards: a
     customer exists BEFORE the job does, referrals and repeat clients never
     pass through a pipeline at all, and an empty customer list is not clutter,
     it is the screen you go to in order to add the first one.
     Leads stays earned; a pipeline board with nothing in it really is clutter. */
  '/app/customers',
];

/** A tool with records behind it reveals itself. */
const HAS_WORK: Record<string, (s: CompanySignals) => boolean> = {
  '/app/fleet':          s => (s.fleet || 0) > 0,
  '/app/time':           s => (s.time || 0) > 0,
  '/app/signal-studio':  s => (s.network || 0) > 0,
  '/app/radio':          s => (s.radio || 0) > 0,
  '/app/daily-logs':     s => (s.dailyLogs || 0) > 0,
  '/app/schedule':       s => (s.schedule || 0) > 0,
  '/app/invoicing':      s => (s.invoices || 0) > 0,
  '/app/billing':        s => (s.payApps || 0) > 0,
  '/app/portals':        s => (s.portals || 0) > 0,
  '/app/autopilot':      s => (s.autopilot || 0) > 0,
  '/app/intelligence':   s => (s.bidHistory || 0) > 0 || (s.bidPackages || 0) > 0,
  '/app/reports':        s => (s.savedReports || 0) > 0 || (s.invoices || 0) > 0 || (s.payApps || 0) > 0,
  /* Compliance is about subs' insurance and licences, so it earns its place
     once there are subs to be compliant. */
  '/app/compliance':     s => (s.subs || 0) > 0,
  /* The directory itself, on the same signal: a tenant with subs on file has
     something to look at, and one without would be opening an empty table. */
  '/app/subs':           s => (s.subs || 0) > 0,
  /* Leads is earned by having a pipeline. Customers is core — see the list
     above for why it cannot be. */
  '/app/leads':          s => (s.leads || 0) > 0,

  /* Nine finished screens that nothing in the codebase linked to. Without a
     probe here an item is only ever visible under "All tools", so a door in
     the rail is not enough on its own — the rule below is what makes each one
     appear when the tenant has something to see in it.
     Every one of these reuses a signal /api/company-tools already returns. */
  '/app/billing/cost-control': s => (s.payApps || 0) > 0 || (s.invoices || 0) > 0,
  '/app/billing/payapp':       s => (s.payApps || 0) > 0,
  '/app/certified-payroll':    s => (s.time || 0) > 0,
  '/app/document-versions':    s => (s.documents || 0) > 0,
  '/app/prequalification':     s => (s.subs || 0) > 0,
  '/app/resource-planning':    s => (s.people || 0) > 0 || (s.schedule || 0) > 0,
  '/app/ask':                  s => (s.documents || 0) > 0,
  /* Warranty claims and approval workflows have no counter of their own in
     CompanySignals, so they stay under "All tools" rather than being given a
     probe that reports on something else. A door that only opens from the full
     list still beats no door. */
};

export function isCompanyToolVisible(
  href: string,
  signals: CompanySignals | null,
  currentPath: string,
  showAll: boolean,
): boolean {
  if (showAll) return true;
  if (CORE_COMPANY_TOOLS.includes(href)) return true;
  if (href === currentPath) return true;
  /* Franchise Rollout is nineteen screens behind one entitlement. A tenant
     entitled to it is by definition running a rollout programme, so the
     entitlement IS the signal — asking again whether each of the nineteen has
     data would hide a programme that has not started yet, which is precisely
     when you need its checklists. Entitlement already hides it from everyone
     else. */
  if (href.startsWith('/app/command-center')) return true;
  if (!signals) return false;
  const probe = HAS_WORK[href];
  return probe ? probe(signals) : false;
}

/** How many tools the filter is holding back, for the "All tools +N" label. */
export function hiddenCompanyToolCount(
  allHrefs: readonly string[],
  signals: CompanySignals | null,
  currentPath: string,
): number {
  return allHrefs.filter(h => !isCompanyToolVisible(h, signals, currentPath, false)).length;
}
