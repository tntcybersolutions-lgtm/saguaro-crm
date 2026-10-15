/**
 * What the top bar says for a path: the page title, and — only on a
 * sub-page — where "‹ Back" goes.
 *
 * Rules (flat frame, owner approved 2026-10-10):
 *  - A tab's own page (Home, My Work, Jobs, Time) has no back link.
 *  - A section opened from the menu (/app/compliance, /app/billing…) has no
 *    back link either: its parent is Home, which is a tab. The old "← Home"
 *    pill on every screen is gone.
 *  - Anything deeper goes back one level: /app/compliance/lien-deadlines →
 *    "‹ Compliance". Inside a job the job itself is the parent of its tools
 *    ("‹ Copper Ridge…"), and Jobs is the parent of the job ("‹ Jobs").
 *  - A record id in the path is never shown as a title or a label.
 *
 * Pure: no React, no fetching — the caller passes the job names it knows.
 */

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Segment → label, where Title Case of the slug would read wrong. */
export const TOPBAR_LABELS: Record<string, string> = {
  app: 'Home',
  'my-work': 'My Work',
  projects: 'Jobs',
  time: 'Time',
  bids: 'Bids & Estimates',
  takeoff: 'AI Takeoff',
  documents: 'Documents',
  autopilot: 'Autopilot',
  reports: 'Reports',
  intelligence: 'Intelligence',
  field: 'Field App',
  portals: 'Portals',
  billing: 'Billing',
  compliance: 'Compliance',
  settings: 'Settings',
  invoicing: 'Invoicing',
  'daily-logs': 'Daily Logs',
  schedule: 'Schedule',
  customers: 'Customers',
  design: 'Design Studio',
  subs: 'Subcontractors',
  prequalification: 'Prequalification',
  'command-center': 'Command Center',
  rfis: 'RFIs',
  'pay-apps': 'Pay Apps',
  'change-orders': 'Change Orders',
  'bid-packages': 'Bid Packages',
  'lien-waivers': 'Lien Waivers',
  'purchase-orders': 'Purchase Orders',
  commitments: 'Commitments',
  w9: 'W-9',
  oac: 'OAC',
  kpis: 'KPIs',
  qc: 'QC',
  'api-docs': 'API Docs',
  quickbooks: 'QuickBooks',
  payapp: 'Pay App',
  'cost-control': 'Cost Control',
  'sub-portal': 'Sub Portal',
  'client-portal': 'Client Portal',
  'reports-builder': 'Report Builder',
  builder: 'Report Builder',
  'roles-permissions': 'Roles & Permissions',
  'notification-settings': 'Notification Settings',
  'warranty-claims': 'Warranty Claims',
  'certified-payroll': 'Certified Payroll',
  'bid-intelligence': 'Bid Intelligence',
  'resource-planning': 'Resource Planning',
  'approval-workflows': 'Approval Workflows',
  'document-versions': 'Document Versions',
  'custom-fields': 'Custom Fields',
  'dashboard-config': 'Dashboard Setup',
  'signal-studio': 'Signal Studio',
  'lien-deadlines': 'Lien Deadlines',
  'prevailing-wage': 'Prevailing Wage',
  'long-lead': 'Long Lead',
  'pre-site': 'Pre-Site',
  'owner-updates': 'Owner Updates',
  new: 'New',
};

/** The paths the phone tab bar opens. Their pages never show a back link. */
export const TAB_ROOTS = ['/app', '/app/my-work', '/app/projects', '/app/time'] as const;

export type TopBar = { title: string; back: { label: string; href: string } | null };

function slugLabel(seg: string): string {
  if (TOPBAR_LABELS[seg]) return TOPBAR_LABELS[seg];
  return seg.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function resolveTopBar(
  pathname: string,
  opts: { projectNames?: Record<string, string>; companyName?: string | null } = {},
): TopBar {
  const names = opts.projectNames || {};
  const clean = '/' + pathname.split('?')[0].split('#')[0].split('/').filter(Boolean).join('/');
  const segs = clean.split('/').filter(Boolean);

  if (segs[0] !== 'app') return { title: segs.length ? slugLabel(segs[segs.length - 1]) : '', back: null };
  if (segs.length === 1) return { title: (opts.companyName || '').trim() || 'Home', back: null };

  const projIdx = segs[1] === 'projects' ? 1 : -1;
  const isProjectId = (i: number) => projIdx === 1 && i === 2 && UUID_RE.test(segs[2]);
  const jobName = (id: string) => names[id] || 'Job';

  // The label a segment would carry as a parent / title. A bare record id
  // (not the job) has no name the bar can know, so it reads as nothing.
  const labelAt = (i: number): string => {
    const seg = segs[i];
    if (isProjectId(i)) return jobName(seg);
    if (UUID_RE.test(seg) || /^\d+$/.test(seg)) return '';
    return slugLabel(seg);
  };

  const title = isProjectId(segs.length - 1) ? '' : labelAt(segs.length - 1);

  // Tab pages and the sections under Home: no back link.
  if (segs.length === 2) return { title, back: null };

  const parentSegs = segs.slice(0, -1);
  const parentHref = '/' + parentSegs.join('/');
  let parentLabel = labelAt(parentSegs.length - 1);
  if (!parentLabel) {
    // The parent is a record page (…/bid-packages/<id>): name it after its list.
    const listLabel = labelAt(parentSegs.length - 2);
    parentLabel = listLabel ? listLabel.replace(/s$/, '') : 'Back';
  }
  return { title, back: { label: parentLabel, href: parentHref } };
}
