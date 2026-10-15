/**
 * The tools inside one project — the single source of truth for the rail.
 *
 * These lived in the project layout, which rendered them in a SECOND sidebar
 * beside the company rail. Every project page therefore showed roughly twenty
 * company tools you cannot use from inside a job, plus roughly forty project
 * tools, in two separate columns. That is the "everything is scattered"
 * problem: two navigations competing, neither of them the answer to "where is
 * the thing I want".
 *
 * One rail, context-aware — company tools at the portfolio level, project
 * tools inside a project — is how Procore does it and why theirs is learnable.
 * The list lives here so the rail and anything else that needs it read the
 * same definition.
 */

import {
  Handshake,
  SquaresFour, Ruler, Calculator, FileText, CalendarBlank, Package, Palette,
  Clipboard, NotePencil, Wallet, ArrowsClockwise, Money, Receipt, Signature,
  ShieldCheck, IdentificationBadge, ClipboardText, Camera, MagnifyingGlass,
  HardHat, CheckCircle, CheckSquare, Timer, Question, Export, ChatCircle,
  Folder, Bank, BookOpen, Users, Globe, Laptop, ArrowsSplit, Plug, Shield,
  WifiHigh, Broadcast, Gear, Robot, ChartBar, Brain, CaretLeft, CaretRight, ArrowLeft, X, UsersThree,
} from '@phosphor-icons/react';

export interface ProjectNavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: number | null;
  accent?: string;
}

export interface ProjectNavSection {
  label: string;
  items: ProjectNavItem[];
}

export const PROJECT_NAV_SECTIONS: ProjectNavSection[] = [
  {
    /* Overview is the project's home, not a preconstruction tool, so it sits
       alone above the phases — the same place Procore puts Project Home. */
    label: 'PROJECT',
    items: [
      { label: 'Overview',        href: '',                   icon: SquaresFour, badge: null },
    ],
  },
  {
    /* Bid Packages moved here from EXECUTION. You send bid packages to price
       the job, before anyone is awarded anything — filing it under Execution
       put a preconstruction activity after contracts in a nav that otherwise
       reads as the order work happens. */
    label: 'PRECONSTRUCTION',
    items: [
      { label: 'Takeoff',         href: '/takeoff',           icon: Ruler, badge: null, accent: 'takeoff' },
      { label: 'Estimate',        href: '/estimate',          icon: Calculator, badge: null, accent: 'estimates' },
      { label: 'Bid Packages',          href: '/bid-packages',      icon: Package, badge: null, accent: 'bids' },
      { label: 'Proposal',        href: '/proposal',          icon: FileText, badge: null },
    ],
  },
  {
    label: 'EXECUTION',
    items: [
      { label: 'Schedule',              href: '/schedule',          icon: CalendarBlank, badge: null, accent: 'schedule' },
      { label: 'Selections & Allowances', href: '/selections',      icon: Palette, badge: null },
      { label: 'Contracts',             href: '/contracts',         icon: Clipboard, badge: null, accent: 'contracts' },
      { label: 'Subcontractors',        href: '/subs',              icon: Users, badge: null, accent: 'subs' },
      { label: 'Purchase Orders',       href: '/purchase-orders',   icon: NotePencil, badge: null },
    ],
  },
  {
    /* FIELD comes before FINANCIAL: a GC runs the work in the field, and the
       money (costing, pay apps, invoices) follows from what happened there.
       JobTread, Buildertrend and Procore all order the in-job rail
       Execution → Field → Financials; we had Financial above Field, which read
       as "bill before you build". */
    label: 'FIELD',
    items: [
      { label: 'Daily Logs',      href: '/daily-logs',        icon: ClipboardText, badge: null, accent: 'daily' },
      { label: 'T&M Tickets',     href: '/tm-tickets',        icon: Money, badge: null, accent: 'tm' },
      { label: 'Photos',          href: '/photos',            icon: Camera, badge: null, accent: 'photos' },
      { label: 'Inspections',     href: '/inspections',       icon: MagnifyingGlass, badge: null, accent: 'inspections' },
      { label: 'Safety',          href: '/safety',            icon: HardHat, badge: null, accent: 'safety' },
      { label: 'Punch List',      href: '/punch-list',        icon: CheckCircle, badge: null, accent: 'punch' },
      { label: 'To-Dos',          href: '/todos',             icon: CheckSquare,  badge: null, accent: 'todos' },
      { label: 'Timesheets',      href: '/timesheets',        icon: Timer,  badge: null, accent: 'time' },
      { label: 'Crews',           href: '/crews',             icon: Users,  badge: null, accent: 'crews' },
    ],
  },
  {
    label: 'FINANCIAL',
    items: [
      { label: 'Budget',          href: '/budget',            icon: Wallet, badge: null, accent: 'budget' },
      { label: 'Commitments',     href: '/commitments',       icon: Handshake, badge: null, accent: 'commitments' },
      { label: 'Change Orders',   href: '/change-orders',     icon: ArrowsClockwise, accent: 'changeorders' },
      { label: 'Pay Applications', href: '/pay-apps',         icon: Money, badge: null, accent: 'payapps' },
      { label: 'Client Invoices', href: '/invoices',          icon: Receipt, badge: null, accent: 'invoices' },
      { label: 'Bills',           href: '/bills',             icon: FileText, badge: null, accent: 'bills' },
      { label: 'Lien Waivers',    href: '/lien-waivers',      icon: Signature, badge: null, accent: 'waivers' },
      { label: 'Insurance',       href: '/insurance',         icon: ShieldCheck,  badge: null },
      { label: 'Certified Payroll', href: '/payroll',         icon: IdentificationBadge, badge: null },
      { label: 'W-9 Requests',    href: '/w9',                icon: FileText, badge: null },
    ],
  },
  {
    label: 'COMMUNICATION',
    items: [
      { label: 'RFIs',            href: '/rfis',              icon: Question, accent: 'rfis' },
      { label: 'Submittals',      href: '/submittals',        icon: Export, badge: null },
      { label: 'Messages',        href: '/messages',          icon: ChatCircle, badge: null, accent: 'messages' },
      { label: 'Meetings',        href: '/meetings',          icon: UsersThree, badge: null, accent: 'meetings' },
    ],
  },
  {
    label: 'DOCUMENTS',
    items: [
      { label: 'Files',           href: '/files',             icon: Folder, badge: null, accent: 'documents' },
      { label: 'Drawings',        href: '/drawings',          icon: Ruler, badge: null, accent: 'drawings' },
      { label: 'Permits',         href: '/permits',           icon: Bank,  badge: null, accent: 'permits' },
      { label: 'Specifications',  href: '/specs',             icon: BookOpen, badge: null, accent: 'specs' },
    ],
  },
  {
    /* Closeout is a PHASE, not a document type, so it gets the last section —
       this nav otherwise reads as the job's lifecycle.

       NOTE: this list and the one in app/app/projects/[projectId]/layout.tsx
       are two copies of the same navigation — this one drives the desktop
       rail, that one the mobile slide-over. They hold the same 49 links, but
       this section existed in the mobile copy for a while and not here, so a
       phone showed a CLOSEOUT section and a desktop did not. Any change to
       one must be made to the other until they are merged. */
    label: 'CLOSEOUT',
    items: [
      { label: 'Closeout',        href: '/closeout',          icon: CheckCircle, badge: null },
    ],
  },
  {
    label: 'TEAM',
    items: [
      { label: 'Directory',       href: '/directory',         icon: Users, badge: null, accent: 'team' },
      { label: 'Team',            href: '/team',              icon: Users, badge: null, accent: 'team' },
      { label: 'Compliance',      href: '/compliance',        icon: ShieldCheck,  badge: null, accent: 'compliance' },
    ],
  },
  {
    /* Niche vertical — collapsed under "More" at the bottom, out of the main
       GC flow (the owner runs some low-voltage work but it is not the lifecycle
       a GC follows on every job). */
    label: 'MORE · LOW VOLTAGE / IT',
    items: [
      { label: 'Network',          href: '/network',            icon: Globe, badge: null },
      { label: 'Devices',          href: '/network/devices',    icon: Laptop, badge: null },
      { label: 'VLANs',            href: '/network/vlans',      icon: ArrowsSplit, badge: null },
      { label: 'Cables',           href: '/network/cables',     icon: Plug, badge: null },
      { label: 'Firewall',         href: '/network/firewall',   icon: Shield,  badge: null },
      { label: 'WiFi',             href: '/network/wifi',       icon: WifiHigh, badge: null },
      { label: 'Signal Studio',    href: '/app/signal-studio',  icon: Broadcast, badge: null, accent: 'signal' },
      { label: 'Config Gen',       href: '/network/config',     icon: Gear,  badge: null },
      { label: 'AI Wizard',        href: '/network/wizard',     icon: Robot, badge: null },
      { label: 'Reports',          href: '/network/reports',    icon: ChartBar, badge: null },
    ],
  },
  {
    label: 'MORE · INTELLIGENCE',
    items: [
      { label: 'Bid Intelligence', href: '/intelligence',    icon: Brain, badge: null },
      { label: 'Autopilot Alerts', href: '/autopilot',       icon: Robot  },
    ],
  },
];

/**
 * The job lifecycle as a left-to-right flow — the horizontal phase bar that
 * sits across the top of every project screen.
 *
 * Every GC platform (JobTread, Procore, Buildertrend) keeps its tools in a
 * VERTICAL rail; what they don't give you is the one-glance "where is this job
 * in its life" that a contractor actually thinks in — win it, build it, bill
 * it, close it. This strip is that: the mental left-to-right arc the rail can't
 * show, with the phase you're standing in lit. Each phase jumps to its first
 * tool; the rail (PROJECT_NAV_SECTIONS, same order) is the detail beneath it.
 *
 * The `match` hrefs are the tool routes that belong to the phase, so the bar
 * can light the current phase from the URL. Keep this in step with the section
 * order above.
 */
export interface ProjectPhase {
  key: string;
  label: string;
  tagline: string;
  icon: React.ElementType;
  /** Where clicking the phase lands — its first/primary tool. '' = overview. */
  href: string;
  /** Tool routes (relative) that count as "in" this phase, for URL matching. */
  match: string[];
}

export const PROJECT_PHASES: ProjectPhase[] = [
  { key: 'overview',  label: 'Overview',        tagline: 'The job at a glance',   icon: SquaresFour, href: '',             match: [] },
  { key: 'precon',    label: 'Preconstruction', tagline: 'Price & win the work',  icon: Calculator,  href: '/takeoff',     match: ['/takeoff', '/estimate', '/bid-packages', '/proposal'] },
  { key: 'execution', label: 'Execution',       tagline: 'Set up & buy out',      icon: Clipboard,   href: '/schedule',    match: ['/schedule', '/selections', '/contracts', '/subs', '/purchase-orders'] },
  { key: 'field',     label: 'Field',           tagline: 'Build & track daily',   icon: HardHat,     href: '/daily-logs',  match: ['/daily-logs', '/tm-tickets', '/photos', '/inspections', '/safety', '/punch-list', '/todos', '/timesheets', '/crews'] },
  { key: 'financial', label: 'Financials',      tagline: 'Cost, bill & get paid', icon: Money,       href: '/budget',      match: ['/budget', '/change-orders', '/pay-apps', '/invoices', '/bills', '/lien-waivers', '/insurance', '/payroll', '/w9'] },
  { key: 'docs',      label: 'Docs & Comms',    tagline: 'Drawings, RFIs, files', icon: Folder,      href: '/files',       match: ['/files', '/drawings', '/permits', '/specs', '/rfis', '/submittals', '/messages', '/meetings', '/directory', '/team', '/compliance'] },
  { key: 'closeout',  label: 'Closeout',        tagline: 'Finish & hand over',    icon: CheckCircle, href: '/closeout',    match: ['/closeout'] },
];

/** The phase a project-relative path belongs to (longest match wins). */
export function phaseForPath(relPath: string): string {
  const p = relPath || '';
  let best = 'overview';
  let bestLen = -1;
  for (const ph of PROJECT_PHASES) {
    for (const m of ph.match) {
      if (p === m || p.startsWith(m + '/') || p.startsWith(m)) {
        if (m.length > bestLen) { best = ph.key; bestLen = m.length; }
      }
    }
  }
  return best;
}
