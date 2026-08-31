/**
 * project-tools — which of the 49 project modules a job actually shows.
 *
 * The project sidebar listed every module on every job, whether it was a
 * $40k tenant improvement or a $40M hospital. Forty-nine doors is not a
 * feature list to a GC opening the product for the first time; it is the
 * reason they cannot find the three they need.
 *
 * Three rules decide visibility, in this order:
 *
 *   1. CORE — the spine of the product. Always shown. A GC can run a job
 *      start to finish on these six and nothing else.
 *   2. HAS WORK IN IT — a module with real data on this project shows itself.
 *      This is the rule that matters: the sidebar must never hide something
 *      someone has already put work into. Driven off /api/project-context,
 *      which the layout already loads, so this costs no extra request.
 *   3. YOU ARE STANDING ON IT — the current page always appears, however you
 *      arrived. A nav that loses the page you are on is worse than a long one.
 *
 * Everything else is one click away behind "All tools". Nothing is removed,
 * and no schema change was needed to do it.
 */

/** Shape of the bits of /api/project-context this file reads. All optional —
 *  a missing key simply means "no evidence of work", never a crash. */
export interface ToolSignals {
  counts?: {
    invoices?: number;
    bills?: number;
    purchaseOrders?: number;
    openRfis?: number;
    openSubmittals?: number;
    scheduleTasks?: number;
    openPunch?: number;
  };
  money?: { payAppCount?: number; originalContract?: number };
  budget?: { lineCount?: number };
  subs?: unknown[];
  bidPackages?: unknown[];
  recent?: { lastDailyLogDate?: string | null };
}

/** Hrefs, as they appear in NAV_SECTIONS (relative to the project base). */
export const CORE_TOOLS: readonly string[] = [
  '',              // Overview
  '/takeoff',
  '/bid-packages',
  '/budget',
  '/daily-logs',
  '/files',
  '/team',
];

/** href -> does this project have work in that module? */
const HAS_WORK: Record<string, (s: ToolSignals) => boolean> = {
  '/schedule':         s => (s.counts?.scheduleTasks || 0) > 0,
  '/purchase-orders':  s => (s.counts?.purchaseOrders || 0) > 0,
  '/invoices':         s => (s.counts?.invoices || 0) > 0,
  '/bills':            s => (s.counts?.bills || 0) > 0,
  '/rfis':             s => (s.counts?.openRfis || 0) > 0,
  '/submittals':       s => (s.counts?.openSubmittals || 0) > 0,
  '/punch-list':       s => (s.counts?.openPunch || 0) > 0,
  '/pay-apps':         s => (s.money?.payAppCount || 0) > 0,
  '/crews':            s => (s.subs?.length || 0) > 0,
  '/contracts':        s => (s.subs?.length || 0) > 0,
};

/**
 * @param href        the nav item's href
 * @param signals     project context, or null while it loads
 * @param currentPath the active href, so the page you are on never vanishes
 * @param showAll     the "All tools" toggle
 */
export function isToolVisible(
  href: string,
  signals: ToolSignals | null,
  currentPath: string,
  showAll: boolean
): boolean {
  if (showAll) return true;
  if (CORE_TOOLS.includes(href)) return true;
  if (href === currentPath) return true;
  if (!signals) return false;
  const probe = HAS_WORK[href];
  return probe ? probe(signals) : false;
}

/** How many modules "All tools" would add — for the toggle's label. */
export function hiddenToolCount(
  allHrefs: readonly string[],
  signals: ToolSignals | null,
  currentPath: string
): number {
  return allHrefs.filter(h => !isToolVisible(h, signals, currentPath, false)).length;
}
