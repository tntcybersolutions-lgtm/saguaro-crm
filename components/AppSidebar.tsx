'use client';
/**
 * AppSidebar — Procore-style persistent left sidebar.
 * Collapsible, grouped navigation with icons, badges, and active states.
 */
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CaretUp,
  DotsThree,
  FolderSimple,
  GridFour,
  Gauge,
  Blueprint,
  CurrencyDollar,
  FileText,
  Star,
  ChartBar,
  Brain,
  SquaresFour,
  CreditCard,
  ShieldCheck,
  Gear,
  CaretLeft,
  CaretRight,
  SignOut,
  MagnifyingGlass,
  Bell,
  UserCircle,
  Buildings,
  Wrench,
  ClipboardText,
  CalendarBlank,
  Truck,
  Package,
  HardHat,
  Users,
  Warning,
  Flag,
  ChartLineUp,
  Kanban,
  Notepad,
  AddressBook,
  ListChecks,
  CalendarCheck,
  ShareNetwork,
  NotePencil,
  Receipt,
  SealCheck,
  Clock,
  WifiHigh,
  Broadcast,
  Briefcase,
  UsersThree,
  CaretDown,
  Check,
} from '@phosphor-icons/react';
import { colors, font, radius, shadow, sidebar as sidebarTokens, z } from '../lib/design-tokens';
import { useWhiteLabel } from './WhiteLabelProvider';
import { useEntitlements } from '../lib/hooks/useEntitlements';
import { moduleAccent } from '../lib/module-identity';
import { Pill } from './ui/premium';
import { PROJECT_NAV_SECTIONS } from '@/lib/project-nav';
import { useProjectContext, refreshProjectContext } from '@/lib/hooks/useProjectContext';
import { isToolVisible, hiddenToolCount, type ToolSignals } from '@/lib/project-tools';
import { isCompanyToolVisible, hiddenCompanyToolCount, type CompanySignals } from '@/lib/company-tools';
import { usePermissions } from '@/lib/hooks/usePermissions';
import type { PermCategory } from '@/lib/permission-categories';
import { normalisePhase, stepsForPhase, stepsDone, LEADING_SECTIONS, PHASE_LABEL } from '@/lib/project-phase';
import { isClosedStatus } from '@/lib/project-lifecycle';
import useSWR, { mutate as swrMutate } from 'swr';
import BrandMark from '@/components/BrandMark';
import { STATUS_COLORS } from '@/lib/status-colors';

/* ── Types ──────────────────────────────────────────────────────────── */
interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: number;
  gate?: string; // gated feature flag; item hidden unless the tenant is entitled
  /* Kept for the mobile rail and the command palette's ranking. It no longer
     decides what the desktop sidebar shows — everything entitled is shown. */
  core?: boolean;
  accentKey?: string; // module-identity key -> tints the inactive icon + count badge
}
interface NavSection {
  title: string;
  items: NavItem[];
  /* Which half of the product this belongs to.
     The complaint was never that a page was missing — it was that running the
     company and running a job sat interleaved in one undifferentiated list, so
     nobody could tell where to look. 'sell' is winning the work: who you are
     talking to, what you are chasing, what you bid. 'build' is doing it.
     Undefined means the section spans both and sits outside the split — Home
     at the top, cross-cutting tools at the bottom. Company scope only; inside
     a project the rail renders PROJECT_NAV_SECTIONS, which is one job's worth
     of work and has no halves to separate. */
  zone?: 'sell' | 'build';
}

/* Section headers render in Title Case (docs/COPY-STYLE.md §1–§2). The
   underlying titles are KEYS — the open/closed preference in localStorage,
   LEADING_SECTIONS, SECTION_PERMISSION — so the data is never rewritten; only
   what is drawn is. "MORE · LOW VOLTAGE / IT" -> "More · Low Voltage / IT". */
const KEEP_UPPER = new Set(['IT', 'AI', 'RFI', 'RFIS', 'CO', 'COS', 'SOV', 'PO', 'POS', 'T&M', 'QC', 'OAC', 'KPI', 'KPIS', 'BIM', 'W-9']);
const SMALL_WORDS = new Set(['a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'so', 'yet', 'as', 'at', 'by', 'in', 'of', 'off', 'on', 'per', 'to', 'up', 'via', 'vs', 'from', 'into', 'onto', 'over', 'with']);
function displayTitle(raw: unknown): string {
  const s = String(raw ?? '');
  if (s !== s.toUpperCase()) return s; // already authored in mixed case
  const words = s.split(' ');
  return words.map((w, i) => {
    if (KEEP_UPPER.has(w)) return w === 'RFIS' ? 'RFIs' : w === 'COS' ? 'COs' : w === 'POS' ? 'POs' : w === 'KPIS' ? 'KPIs' : w;
    const lower = w.toLowerCase();
    if (i > 0 && i < words.length - 1 && SMALL_WORDS.has(lower)) return lower;
    return lower.replace(/(^|-)([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase());
  }).join(' ');
}

/** "Acme General Contractors" -> "AG" (first letters of the first two words). */
function companyInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  return (words.length >= 2 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).toUpperCase();
}

/* ── Tenant brand lockup ────────────────────────────────────────────────
 * The upper-left identity block. When the tenant has ANY branding (uploaded
 * logo or company name) it renders a proper lockup: the logo at a real size
 * with graceful aspect handling, company name + plan pill beneath, hover
 * state, and a click-through to Settings → Branding. When there is no logo
 * it falls back to a clean typographic monogram — never a tiny box, never a
 * fake logo. No tenant branding at all → the Saguaro lockup (unchanged). */
function BrandLockup({ collapsed }: { collapsed: boolean }) {
  const wl = useWhiteLabel();
  const [imgFailed, setImgFailed] = useState(false);
  const [hover, setHover] = useState(false);
  const [plan, setPlan] = useState<{ name: string | null; status: string | null } | null>(null);

  // A fresh logo URL gets a fresh chance to load.
  useEffect(() => { setImgFailed(false); }, [wl.logoUrl]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/billing/subscription')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d && !cancelled) setPlan({ name: d.plan_name ?? null, status: d.status ?? null }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const hasLogo = !!wl.logoUrl && !imgFailed;
  /* A dark logo on near-black chrome reads as an empty tile — the owner's
   * "you can't see it". Tone is measured from the artwork's visible pixels at
   * upload time (see app/api/branding/logo/route.ts), so dark marks get a light
   * plate to sit on and white knock-out marks are left alone. 'unknown' (SVG,
   * or uploaded before tone detection) keeps the old neutral treatment. */
  const needsPlate = hasLogo && wl.logoTone === 'dark';
  const platedImg: React.CSSProperties = needsPlate
    ? { background: 'var(--text-primary)', padding: 6, borderRadius: 8, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.06)' }
    : {};
  const hasTenantBrand = hasLogo || !!wl.companyName;

  // Plan pill — honest states only: nothing renders until billing answers.
  const planPill = (() => {
    if (!plan) return null;
    if (plan.status === 'past_due') return <Pill tone="red" caps>Past Due</Pill>;
    if (plan.status === 'trialing') return <Pill tone="amber" caps>Trial</Pill>;
    if (plan.name) return <Pill tone="gold" caps>{plan.name}</Pill>;
    return null;
  })();

  /* ── Default Saguaro lockup (no tenant branding yet) ── */
  if (!hasTenantBrand) {
    return (
      <div
        style={{
          height: sidebarTokens.headerHeight,
          // Below the status bar in the iOS app; 0 elsewhere.
          paddingTop: 'env(safe-area-inset-top, 0px)',
          boxSizing: 'content-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          padding: collapsed ? '0' : '0 16px',
          borderBottom: `1px solid ${colors.border}`,
          flexShrink: 0,
        }}
      >
        <Link
          href="/app"
          aria-label="Saguaro — Dashboard"
          style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', overflow: 'hidden' }}
        >
          <BrandMark size="sm" markOnly={collapsed} href={null} />
        </Link>
      </div>
    );
  }

  const monogram = (size: number, fontSize: number) => (
    <span
      aria-hidden
      style={{
        width: size, height: size, flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: Math.round(size * 0.27),
        background: 'linear-gradient(150deg, var(--brand-primary-strong), var(--brand-primary) 60%, var(--brand-primary-hover))',
        boxShadow: '0 4px 14px var(--brand-primary-25), inset 0 1px 0 rgba(255,255,255,0.35)',
        color: 'var(--on-brand)', fontSize, fontWeight: 900,
        userSelect: 'none',
      }}
    >
      {companyInitials(wl.companyName || '?')}
    </span>
  );

  /* ── Collapsed: one generous tile, logo contained (or monogram) ── */
  if (collapsed) {
    return (
      <div style={{ borderBottom: `1px solid ${colors.border}`, flexShrink: 0, padding: '10px 8px', display: 'flex', justifyContent: 'center' }}>
        <Link
          href="/app/settings#branding"
          title={`${wl.companyName || 'Company branding'} — brand settings`}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 52, height: 52, borderRadius: 12, textDecoration: 'none',
            background: hover ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${hover ? 'var(--brand-primary-35)' : colors.borderDim}`,
            transition: 'background .15s ease, border-color .15s ease',
            overflow: 'hidden',
          }}
        >
          {hasLogo ? (
            <img
              src={wl.logoUrl}
              alt={wl.companyName || 'Company logo'}
              onError={() => setImgFailed(true)}
              /* Fill the square tile — cover + centered so a photo or a mark
                 never letterboxes, drifts, or spills past the 52px tile. The
                 parent clips (overflow: hidden), so nothing runs off. A DARK
                 mark keeps its light plate and is contained, same rule as the
                 expanded banner — cropped onto dark chrome it would vanish. */
              style={needsPlate
                ? { maxWidth: 44, maxHeight: 44, width: 'auto', height: 'auto', objectFit: 'contain', display: 'block', ...platedImg }
                : { width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block' }}
            />
          ) : monogram(36, 14)}
        </Link>
      </div>
    );
  }

  /* ── Expanded: compact identity row — small thumbnail + company name. The
     full photo stays in Settings → Branding, where this row links. ── */
  return (
    <div style={{ borderBottom: `1px solid ${colors.border}`, flexShrink: 0, padding: '10px 10px 9px' }}>
      <Link
        href="/app/settings#branding"
        title="Company branding — open Settings"
        aria-label={`${wl.companyName || 'Company'} — brand settings`}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, textDecoration: 'none',
          padding: '8px 10px', borderRadius: 12,
          background: hover ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
          border: `1px solid ${hover ? 'var(--brand-primary-35)' : colors.borderDim}`,
          transition: 'background .15s ease, border-color .15s ease',
        }}
      >
        {hasLogo ? (
          <span style={{ width: 36, height: 36, borderRadius: 10, overflow: 'hidden', flexShrink: 0, display: 'grid', placeItems: 'center', background: needsPlate ? '#F5F5F5' : 'rgba(255,255,255,0.04)' }}>
            <img
              src={wl.logoUrl}
              alt={wl.companyName || 'Company logo'}
              onError={() => setImgFailed(true)}
              style={needsPlate
                ? { maxWidth: 30, maxHeight: 30, width: 'auto', height: 'auto', objectFit: 'contain', display: 'block' }
                : { width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block' }}
            />
          </span>
        ) : monogram(36, 14)}
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: font.weight.black, color: colors.text, letterSpacing: '-0.01em', lineHeight: 1.2 }}>
            {wl.companyName || 'Your company'}
          </span>
          {planPill && <span style={{ display: 'flex' }}>{planPill}</span>}
        </span>
      </Link>
    </div>
  );
}

/**
 * Eight destinations are always in the rail. The other thirty-odd wait behind
 * one toggle.
 *
 * The rail listed forty-one items across six sections, and the feedback was the
 * same every time: too many buttons, no obvious path to just start a job. Every
 * one of those pages is real and stays reachable — the problem was never that
 * they exist, it was being asked to choose among forty of them before doing
 * anything.
 *
 * One rule now: everything this tenant is entitled to, in a fixed order, on
 * every screen.
 *
 * It used to be three — core items always, the current page always, and a
 * reveal toggle for the rest — and the effect of those three together was a
 * rail that changed shape as you moved through the product. An item you used
 * yesterday sat somewhere else today because you arrived from a different
 * page. A menu that moves cannot be learned, and being learnable is the whole
 * value of a menu.
 *
 * Entitlement still applies: a plan without Fleet does not list Fleet. That is
 * a stable difference between tenants rather than a moving target within one.
 */

/* ── Navigation Config ─────────────────────────────────────────────── */
/**
 * Which permission governs each company section.
 *
 * The permission system has been complete and enforced on the server for a
 * long time — twelve categories, four levels, requirePermission on the routes
 * that matter — and the navigation ignored every bit of it. So a salesperson
 * saw pay applications, certified payroll, cost control and the takeoff studio
 * in their rail, and the first thing they learned about any of them was the
 * 403 they got from opening it. A rail that lists what you may not do is not a
 * menu, it is a list of doors that are locked.
 *
 * Home is absent on purpose: the dashboard, your own work and the project list
 * are what "logged in" means, and a rail without them is not a smaller product,
 * it is a broken one.
 *
 * Hiding is not the security. The guard on each route is, and it stays.
 */
const SECTION_PERMISSION: Record<string, PermCategory> = {
  'Sales':          'Sales',
  'Subs & Vendors': 'Projects',
  'Tools':          'Projects',
  'Documents':      'Documents',
  'Financial':      'Pay Apps',
  'Company':        'Admin',
};

const NAV_SECTIONS: NavSection[] = [
  /* OUTSIDE A JOB YOU PICK SOMETHING. INSIDE A JOB YOU FOLLOW THE STAGES.
     That is the whole rule, and it needs no teaching because it is how a GC
     already thinks.

     This rail used to be grouped by phase — Preconstruction, Execution,
     Financial — which is exactly how lib/project-nav groups the rail INSIDE a
     job. Two rails, ten sections, the same six words at two different scopes.
     A GC saw "Documents" and "Execution" twice and could not tell which one
     they were standing in, and that is the duplication behind "hard to
     follow": not missing structure, the same structure said twice.

     The phase story belongs to the job, where the project rail tells it in
     full. At company scope these are nouns — things you open, not stages you
     are at. The "you are here / do this next" strip spans both and is the one
     place that speaks in stages everywhere. */
  {
    title: 'Home',
    items: [
      { label: 'Dashboard',    href: '/app',              icon: GridFour, core: true, accentKey: 'portfolio' },
      { label: 'My Work',      href: '/app/my-work',      icon: Briefcase, accentKey: 'work', core: true },
      { label: 'Projects',     href: '/app/projects',     icon: FolderSimple, core: true, accentKey: 'portfolio' },
    ],
  },
  {
    title: 'Sales',
    zone: 'sell',
    items: [
      { label: 'Sales Home',       href: '/app/sales',        icon: Gauge, core: true, accentKey: 'bids' },
      { label: 'Leads',            href: '/app/leads',        icon: Kanban, accentKey: 'bids' },
      { label: 'Customers',        href: '/app/customers',    icon: AddressBook, accentKey: 'contacts' },
      { label: 'Bid Board',        href: '/app/bids',         icon: CurrencyDollar, core: true, accentKey: 'bids' },
      { label: 'Intelligence',     href: '/app/intelligence', icon: Brain, accentKey: 'bidintelligence' },
      { label: 'Reviews',          href: '/app/reviews',      icon: Star, accentKey: 'contacts' },
    ],
  },
  {
    /* Money in is Sales; money out is here. The directory, and the three
       screens that exist to answer "can I award them work" — compliance,
       prequalification, and the portal they answer through. */
    title: 'Subs & Vendors',
    zone: 'build',
    items: [
      { label: 'Subs & Vendors',   href: '/app/subs',             icon: UsersThree,  accentKey: 'subs' },
      { label: 'Compliance',       href: '/app/compliance',       icon: ShieldCheck, accentKey: 'compliance' },
      { label: 'Prequalification', href: '/app/prequalification', icon: ListChecks,  accentKey: 'compliance' },
      { label: 'Portals',          href: '/app/portals',          icon: SquaresFour, accentKey: 'ccportals' },
    ],
  },
  {
    /* Cross-project working tools. "Preconstruction" was the old label and it
       was the project rail's word, not this rail's — Takeoff Studio and the
       catalog are used before a job exists and across every job after. */
    title: 'Tools',
    zone: 'build',
    items: [
      { label: 'Takeoff Studio',    href: '/app/takeoff',           icon: Blueprint, accentKey: 'takeoff', core: true },
      { label: 'Catalog',           href: '/app/catalog',           icon: Package, accentKey: 'catalog' },
      { label: 'Schedule',          href: '/app/schedule',          icon: CalendarBlank, accentKey: 'schedule', core: true },
      { label: 'Daily Logs',        href: '/app/daily-logs',        icon: ClipboardText, accentKey: 'daily' },
      { label: 'Resource Planning', href: '/app/resource-planning', icon: HardHat, accentKey: 'team' },
      { label: 'Service & Dispatch', href: '/app/service',          icon: Wrench, accentKey: 'team' },
      { label: 'Warranty Claims',   href: '/app/warranty-claims',   icon: Wrench, accentKey: 'compliance' },
      { label: 'Signal Studio',     href: '/app/signal-studio',     icon: WifiHigh, accentKey: 'signal' },
      { label: 'Saguaro Radio',     href: '/app/radio',             icon: Broadcast, accentKey: 'radio' },
    ],
  },
  {
    title: 'Documents',
    zone: 'build',
    items: [
      { label: 'Documents',         href: '/app/documents',         icon: FileText, accentKey: 'documents', core: true },
      { label: 'Document Versions', href: '/app/document-versions', icon: Notepad,  accentKey: 'documents' },
    ],
  },
  {
    title: 'Financial',
    zone: 'build',
    items: [
      { label: 'Invoicing',         href: '/app/invoicing',            icon: CreditCard, accentKey: 'invoices', core: true },
      { label: 'Billing',           href: '/app/billing',              icon: CurrencyDollar, accentKey: 'financials' },
      { label: 'Cost Control',      href: '/app/billing/cost-control', icon: ChartLineUp, accentKey: 'financials' },
      { label: 'Progress Billing',  href: '/app/billing/payapp',       icon: Receipt, accentKey: 'financials' },
      { label: 'Certified Payroll', href: '/app/certified-payroll',    icon: SealCheck, accentKey: 'financials' },
      { label: 'Reports',           href: '/app/reports',              icon: ChartBar, accentKey: 'reports' },
    ],
  },
  {
    title: 'Company',
    items: [
      { label: 'People & Access',    href: '/app/people',             icon: Users, accentKey: 'team', core: true },
      { label: 'Time Clock',         href: '/app/time',               icon: Clock, accentKey: 'time' },
      { label: 'Fleet',              href: '/app/fleet',              icon: Truck, gate: 'fleet', accentKey: 'fleet' },
      /* Autopilot de-featured: no top-level entry. It lives under Sales →
         Intelligence (a secondary link there) and at its direct URL. */
      { label: 'Approval Workflows', href: '/app/approval-workflows', icon: Flag, accentKey: 'autopilot' },
      { label: 'Ask Sage',           href: '/app/ask',                icon: Brain, accentKey: 'sage' },
    ],
  },
  {
    /* Entire section is gated to command_center — hidden unless the tenant is
       entitled. LAST on purpose: nineteen screens is longer than the entire
       core lifecycle above it, and it used to sit between Sales and
       Preconstruction, so an entitled tenant scrolled past a rollout program
       to reach Takeoff. A bolt-on goes after the product, not through it. */
    title: 'Franchise Rollout',
    items: [
      { label: 'Command Center',    href: '/app/command-center',            icon: Gauge,        gate: 'command_center', accentKey: 'commandcenter' },
      { label: 'Rollout Pipeline',  href: '/app/command-center/rollout',    icon: Kanban,       gate: 'command_center', accentKey: 'ccrollout' },
      { label: 'Pre-Site Inspection', href: '/app/command-center/pre-site', icon: MagnifyingGlass, gate: 'command_center', accentKey: 'ccpresite' },
      { label: 'KPI Dashboard',     href: '/app/command-center/kpis',       icon: ChartLineUp,  gate: 'command_center', accentKey: 'cckpis' },
      { label: 'Long-Lead Tracker', href: '/app/command-center/long-lead',  icon: Truck,        gate: 'command_center', accentKey: 'cclonglead' },
      { label: 'Risk Register',     href: '/app/command-center/risks',      icon: Warning,      gate: 'command_center', accentKey: 'ccrisks' },
      { label: 'Milestone Variance',href: '/app/command-center/milestones', icon: Flag,         gate: 'command_center', accentKey: 'ccmilestones' },
      { label: 'Escalations',       href: '/app/command-center/escalations',icon: Bell,         gate: 'command_center', accentKey: 'ccescalations' },
      { label: 'OAC Meetings',      href: '/app/command-center/oac',        icon: Users,        gate: 'command_center', accentKey: 'ccoac' },
      { label: 'Verification Hub',  href: '/app/command-center/verify',     icon: ShieldCheck,  gate: 'command_center', accentKey: 'ccverify' },
      { label: 'Owner Updates',     href: '/app/command-center/owner-updates', icon: Notepad,   gate: 'command_center', accentKey: 'ccownerupdates' },
      { label: 'Stakeholders',      href: '/app/command-center/directory',  icon: AddressBook,  gate: 'command_center', accentKey: 'contacts' },
      { label: 'Phase Checklists',  href: '/app/command-center/checklists', icon: ListChecks,   gate: 'command_center', accentKey: 'ccchecklists' },
      { label: 'Vendor Schedule',   href: '/app/command-center/vendors',    icon: CalendarCheck,gate: 'command_center', accentKey: 'ccvendors' },
      { label: 'Daily Reports',     href: '/app/command-center/daily-logs', icon: NotePencil,   gate: 'command_center', accentKey: 'daily' },
      { label: 'Budget & COs',      href: '/app/command-center/budget',     icon: CurrencyDollar, gate: 'command_center', accentKey: 'budget' },
      { label: 'Financials',        href: '/app/command-center/financials', icon: Receipt,      gate: 'command_center', accentKey: 'financials' },
      { label: 'QC by Trade',       href: '/app/command-center/qc',         icon: SealCheck,    gate: 'command_center', accentKey: 'ccqc' },
      { label: 'Owner Portals',     href: '/app/command-center/portals',    icon: ShareNetwork, gate: 'command_center', accentKey: 'ccportals' },
    ],
  },
];

const BOTTOM_ITEMS: NavItem[] = [
  { label: 'Settings', href: '/app/settings', icon: Gear },
];

/* ── Sidebar Component ─────────────────────────────────────────────── */
export default function AppSidebar({
  collapsed,
  onToggle,
  onLogout,
  userInitials,
}: {
  collapsed: boolean;
  onToggle: () => void;
  onLogout: () => void;
  userInitials: string;
}) {
  const pathname = usePathname();

  /**
   * THE RAIL SCROLLS AND SAID NOTHING ABOUT IT.
   *
   * Measured on production at a 1920x794 window: the <nav> was 533px tall
   * holding 945px of items — 412px hidden. "Saguaro Radio" was sliced through
   * the middle at the fold, and Invoicing, Billing, Reports, Autopilot,
   * Compliance and Portals were below it. Seven of twenty-two destinations,
   * with no scrollbar, no fade, no arrow. You see "Documents", then a hairline,
   * then Settings pinned at the bottom, and you conclude that is the whole
   * product. The half-cut row reads as a rendering glitch rather than an
   * invitation to scroll.
   *
   * So the rail now says so: a fade over the bottom edge whenever there is
   * more below, and it clears the moment you reach the end. Measured live
   * rather than assumed, because the cut-off point depends on window height.
   */
  const navRef = React.useRef<HTMLElement>(null);
  const [moreBelow, setMoreBelow] = useState(false);

  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const measure = () => {
      // 2px of slack: sub-pixel layout should not leave the fade stuck on.
      setMoreBelow(el.scrollHeight - el.clientHeight - el.scrollTop > 2);
    };
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', measure); ro.disconnect(); };
  }, [collapsed, pathname]);

  /**
   * One rail, two contexts — the whole point of this change.
   *
   * The app used to render the company rail AND a second project rail side by
   * side, so every project page showed about twenty tools you cannot use from
   * inside a job next to about forty you can. Two navigations competing is why
   * it read as scattered.
   *
   * Inside a project the rail becomes that project's tools. Outside it, the
   * company tools. Same rail, same position, contents that match where you
   * are — which is the model every GC already knows.
   */
  const projectId = (() => {
    const seg = (pathname ?? '').split('/').filter(Boolean);
    const i = seg.indexOf('projects');
    const candidate = i >= 0 ? seg[i + 1] : undefined;
    const isUuid = !!candidate
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate);
    return isUuid ? candidate : null;
  })();
  const inProject = Boolean(projectId);

  /* Project sections, with hrefs resolved against this project. */
  const projectSections = React.useMemo(() => {
    if (!projectId) return [];
    const base = `/app/projects/${projectId}`;
    return PROJECT_NAV_SECTIONS.map((sec) => ({
      title: sec.label,
      items: sec.items.map((it) => ({
        label: it.label,
        href: it.href.startsWith('/app/') ? it.href : base + it.href,
        icon: it.icon,
        accentKey: it.accent,
      })),
    }));
  }, [projectId]);
  const { features } = useEntitlements(); // fail-closed: gated items hidden until entitled

  /* ── COLLAPSIBLE SECTIONS ────────────────────────────────────────────
   *
   * Company scope lists 25 tools; project scope lists about fifty. All of
   * them, expanded, on every screen. That is the "too much in my face"
   * complaint, and it is a real one: nobody uses fifty tools on a Tuesday.
   *
   * This is NOT the old core/showAll filtering that was removed, and the
   * distinction matters. That system decided FOR you which items to hide,
   * and its answer changed as you navigated, so the rail's shape moved and
   * could never be learned. Here the section ORDER never changes, every
   * section header is always present in the same place, and what is open is
   * YOUR choice, remembered. A collapsed section is one click from open and
   * it is exactly where it was yesterday.
   *
   * The DEFAULT adapts to how much there actually is, because collapsing is
   * only a fix for too much. Measured on a real project: the tool filter
   * already cuts 50 links to 13, and defaulting those 13 to closed left a GC
   * looking at a rail containing the single word "Overview" under nine shut
   * headers. Two reductions stacked is not twice as good, it is a dead end.
   *
   * So: if what is left is small enough to read at a glance, open all of it.
   * Only when the list is genuinely long — company scope's 40, or project
   * scope with "All tools" on — fall back to opening the first section plus
   * whichever one holds the page you are on. A stored preference always wins
   * over both.
   */
  /* Retired: the rail no longer decides how much to open from how long the
     list is, because that made the shape depend on data volume AND on the
     current page. See the isOpen comment below. */
  // const OPEN_ALL_BELOW = 16;
  /* "All tools" is an explicit request to see everything, so it opens
     everything. Leaving the collapse default in charge there produced a rail
     that answered a click labeled "All tools" with one link and ten shut
     headers — technically all the tools, visibly none of them. */
  /* ── PER-PROJECT TOOL VISIBILITY ─────────────────────────────────────
   *
   * lib/project-tools already decides which of the 49 project modules a job
   * should show: six core tools, plus anything with real work in it, plus
   * whatever page you are standing on, with the rest one click behind "All
   * tools". It was written for exactly the complaint that the rail is a wall.
   *
   * It was wired into the project layout's MOBILE slide-over and nowhere
   * else, so a phone showed about eight tools and a desktop — the thing
   * everyone actually uses — showed all forty-nine. The filter existed and
   * the screen that needed it never called it.
   *
   * useProjectContext is SWR on one key per project with a 30s dedupe, and
   * the project layout already subscribes to it, so reading it here costs no
   * additional request.
   */
  const { ctx: projectCtx } = useProjectContext(projectId || null);

  /* Company-scope signals. "Has this company ever used Fleet" does not change
     between two clicks, so this is cached for five minutes on one key for the
     whole tenant — it costs one request per session, not one per navigation. */
  const { data: companyData } = useSWR<{ signals: CompanySignals }>(
    inProject ? null : '/api/company-tools',
    (u: string) => fetch(u).then((r) => (r.ok ? r.json() : null)),
    { dedupingInterval: 300_000, revalidateOnFocus: false, keepPreviousData: true },
  );
  const companySignals = companyData?.signals ?? null;

  /* Which phase this job is in, so the rail can number its steps in the same
     order the journey rail on the overview teaches. Both read
     lib/project-phase, so the menu and the guidance cannot drift apart —
     which is exactly how users ended up asking where to start. */
  const projectPhase = normalisePhase((projectCtx as any)?.project?.phase);
  /* A closed job is neither being chased nor run. It used to read "Building ·
     You won it — running the job" (or "Bidding · Chasing this job" for a lost
     bid) with a phase toggle that made no sense on finished work. */
  const jobClosed = isClosedStatus((projectCtx as any)?.project?.status);
  const phaseTone = jobClosed ? STATUS_COLORS.closed : projectPhase === 'building' ? STATUS_COLORS.ongoing : STATUS_COLORS.lead;
  const phaseSteps = stepsForPhase(projectPhase);

  /* Which steps are already behind you. Same signals the journey rail on the
     overview uses, so a tick in the menu and a tick on the page agree. */
  /* lib/project-phase stepsDone is the ONE definition of "done". This used to
     be a private copy of the map, and the copy is how the rail ticked "Bill
     the owner" on an auto-created $0 draft while nothing else could be fixed
     in one place. */
  const phaseDone: Record<string, boolean> = React.useMemo(
    () => stepsDone(projectCtx as any, (projectCtx as any)?.money, isClosedStatus),
    [projectCtx],
  );
  const [showAllTools, setShowAllTools] = useState(false);
  const toolSignals = (projectCtx ?? null) as ToolSignals | null;

  /** The project-relative href of the current page, so the filter can never
   *  hide the row you are standing on. */
  const activeProjectHref = React.useMemo(() => {
    if (!projectId) return '';
    const base = `/app/projects/${projectId}`;
    const all = PROJECT_NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.href));
    const rel = pathname.startsWith(base) ? pathname.slice(base.length) : pathname;
    return all.find((h) => h !== '' && rel.startsWith(h)) ?? '';
  }, [pathname, projectId]);

  const hiddenTools = React.useMemo(() => {
    if (inProject) {
      const all = PROJECT_NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.href));
      return hiddenToolCount(all, toolSignals, activeProjectHref);
    }
    /* Company scope counts only what this tenant is ENTITLED to — offering
       "+19" for a Franchise Rollout they cannot buy would be a lie. */
    const all = NAV_SECTIONS.flatMap((sec) =>
      sec.items.filter((i) => !i.gate || features[i.gate] === true).map((i) => i.href));
    return hiddenCompanyToolCount(all, companySignals, pathname);
  }, [inProject, toolSignals, activeProjectHref, companySignals, pathname, features]);

  const scopeKey = inProject ? 'project' : 'company';
  const [openSections, setOpenSections] = useState<Record<string, boolean> | null>(null);

  // Loaded after mount, not in the initializer, so server and client agree.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('sag_nav_open_' + scopeKey);
      setOpenSections(raw ? JSON.parse(raw) : {});
    } catch {
      setOpenSections({});
    }
  }, [scopeKey]);

  const toggleSection = React.useCallback((title: string, next: boolean) => {
    setOpenSections((prev) => {
      const merged = { ...(prev || {}), [title]: next };
      try { window.localStorage.setItem('sag_nav_open_' + scopeKey, JSON.stringify(merged)); } catch { /* private mode */ }
      return merged;
    });
  }, [scopeKey]);
  /* showAll, its stored preference and the hidden-item count are gone with the
     filtering they served. The rail shows everything this tenant has, in one
     order, on every screen — there is nothing left to reveal. */
  /* Filtered sections, computed once — the render below reads these, and the
     open/closed default needs the TOTAL to decide whether collapsing is even
     warranted. */
  const { can: canDo, resolved: permsResolved } = usePermissions();

  const renderSections = React.useMemo(() => {
    const src: any[] = inProject ? projectSections : NAV_SECTIONS;
    const base = `/app/projects/${projectId}`;
    return src
      .map((section: any) => {
        const entitled = section.items.filter((item: any) => !item.gate || features[item.gate] === true);
        const items = inProject
          ? entitled.filter((item: any) => {
              const rel = item.href.startsWith(base) ? item.href.slice(base.length) : item.href;
              /* A STEP IN THE CURRENT PHASE IS NEVER HIDDEN.
                 The tool filter hides modules with no work in them, and the
                 phase numbers the sequence — put together, they produced a
                 rail reading "1 Takeoff, 3 Bid Packages" with 2, 4 and 5
                 filtered away. A sequence with holes in it is worse than no
                 sequence: it tells a GC there is a step 2 and then refuses to
                 show it. You cannot teach an order and hide half of it. */
              /* A step in this phase is never hidden by the work filter — the
                 block above names it, so the toolbox must be able to show
                 it too rather than pointing at something absent. */
              if (phaseSteps.some((st) => st.href === rel)) return true;
              return isToolVisible(rel, toolSignals, activeProjectHref, showAllTools);
            })
          /* Company scope gets the same discipline one level up: core tools,
             tools this tenant has records in, and the page you are on. */
          : entitled.filter((item: any) =>
              isCompanyToolVisible(item.href, companySignals, pathname, showAllTools));
        return { ...section, items };
      })
      // A section whose every item is hidden takes its header with it.
      .filter((section: any) => section.items.length > 0)
      /* AND A SECTION THIS PERSON MAY NOT USE DOES NOT APPEAR AT ALL.
         Company scope only: inside a job the rail is one job's tools, and a
         person who can open the job can see what the job has. */
      .filter((section: any) => {
        if (inProject) return true;
        const cat = SECTION_PERMISSION[String(section.title)];
        return !cat || canDo(cat, 'View');
      })
      /* SECTIONS IN THE ORDER THE WORK HAPPENS.
       *
       * Rendering them in file order put EXECUTION above FINANCIAL, so a
       * project in the building phase showed its numbered steps as
       * 3 Schedule, 1 Budget, 5 Pay Applications, 4 Daily Logs, 6 Closeout,
       * top to bottom. Every number was correct and the column still read
       * as broken: a list numbered 3, 1, 5, 4 is not a sequence, it is a
       * jumble with digits on it.
       *
       * The phase's leading sections now come first, in the phase's own
       * order, so the numbers ascend down the rail. Everything else keeps
       * its existing relative position after them, so the order is still
       * fixed and learnable — just fixed to how the job runs rather than to
       * the order someone happened to type the array in. */
      .sort((a: any, b: any) => {
        if (!inProject) return 0;
        const lead = LEADING_SECTIONS[projectPhase];
        const rank = (t: string) => {
          const k = lead.indexOf(String(t).toUpperCase());
          return k === -1 ? lead.length : k;
        };
        return rank(a.title) - rank(b.title);
      });
  }, [inProject, projectSections, features, projectId, toolSignals, activeProjectHref, showAllTools, companySignals, pathname, canDo, permsResolved]);

  const totalVisible = renderSections.reduce((n: number, s2: any) => n + s2.items.length, 0);

  const width = collapsed ? sidebarTokens.widthCollapsed : sidebarTokens.width;

  function isActive(href: string) {
    if (href === '/app') return pathname === '/app';
    // Command Center index highlights only on its own page, not its sub-routes
    // (Rollout, KPIs, Long-Lead, …), which each own their nav item.
    if (href === '/app/command-center') return pathname === '/app/command-center';
    return pathname.startsWith(href);
  }

  return (
    <aside
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        width,
        // glass rail on jet black (COPY-STYLE §6): a faint white pane over the
        // black page, one lit hairline on the content edge
        background: 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.025)), #000000',
        backdropFilter: 'blur(16px) saturate(140%)',
        WebkitBackdropFilter: 'blur(16px) saturate(140%)',
        borderRight: '1px solid rgba(255,255,255,0.09)',
        boxShadow: '14px 0 34px rgba(0,0,0,0.5)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: z.sidebar,
        transition: 'width .2s ease',
        overflow: 'hidden',
      }}
    >
      {/* ── Tenant brand lockup (logo / monogram + name + plan) ─────── */}
      <BrandLockup collapsed={collapsed} />

      {/* ── Navigation Sections ─────────────────────────────────────── */}
      <nav
        ref={navRef}
        className="sidebarNav"
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '10px 0',
          /* Fades the last ~40px so a clipped row reads as "there is more",
             not as a glitch. Cleared at the end of the list so the final item
             is never dimmed. WebkitMaskImage too — Safari still wants it. */
          maskImage: moreBelow
            ? 'linear-gradient(to bottom, #000 calc(100% - 40px), transparent)'
            : undefined,
          WebkitMaskImage: moreBelow
            ? 'linear-gradient(to bottom, #000 calc(100% - 40px), transparent)'
            : undefined,
        }}
      >
        {/* The phase pill, "We Won It" and the numbered steps now live in ONE place:
            NextAction on the job overview (components/project/NextAction). The rail is
            a toolbox again — grouped, unnumbered, in one fixed place. */}
        {renderSections.map((section: any, sIdx: number) => {
          const visibleItems = section.items;
          /* Open when the user says so. Otherwise: open everything when there
             is little enough to read at a glance, and only fall back to
             "first section + the one you are in" when the list is long. */
          const stored = openSections?.[section.title];
          /* THE RAIL MUST NOT MOVE WHEN YOU NAVIGATE.
             This used to open a section because it "holds the current page",
             so every navigation re-shaped the menu: a section expanded, the
             ones below it slid down, and the link that was under your cursor a
             second ago was now a different link. It is the reason clicking
             Customers could land you on Projects.
             The shape is now a function of the tenant's DATA, never of where
             you happen to be standing — the same discipline lib/company-tools
             already applies to which tools appear at all. At company scope
             everything is open; a section only closes because somebody closed
             it, and that choice is remembered. Inside a project the phase's
             leading sections still lead, which is stable for the whole job. */
          const isOpen = collapsed
            ? true
            : stored !== undefined
              ? stored
              : !inProject
                ? true
                : LEADING_SECTIONS[projectPhase].includes(String(section.title).toUpperCase()) || sIdx === 0;

          /* THE SPLIT. A labeled rule the first time each half of the product
             starts, so the rail reads as two halves rather than one long list
             of groups. Company scope only: inside a project the rail is one
             job's worth of work and has no halves to separate.
             Nothing is moved or hidden by this — every section keeps its place
             and its contents. It only says out loud where the boundary is. */
          const prevZone = sIdx > 0 ? renderSections[sIdx - 1]?.zone : undefined;
          const showZoneDivider = !inProject && !!section.zone && section.zone !== prevZone;
          /* Same meaning as the phase pill: blue sells (Lead), green builds (Ongoing). */
          const zoneTone = section.zone === 'sell' ? STATUS_COLORS.lead.color : STATUS_COLORS.ongoing.color;
          const zoneLabel = section.zone === 'sell' ? 'Winning the Work' : 'Running the Work';

          return (
          <div key={section.title} style={{ marginBottom: sIdx === renderSections.length - 1 ? 4 : 14 }}>
            {showZoneDivider && (
              collapsed ? (
                /* No room for words at 64px — the rule alone still marks the
                   boundary, and the color carries the same meaning it does on
                   the phase pill: blue sells, green builds. */
                <div aria-hidden style={{ height: 2, borderRadius: 2, margin: '4px 10px 12px', background: `linear-gradient(90deg, ${zoneTone}, transparent)` }} />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '2px 8px 10px', padding: '0 8px 0 12px', minWidth: 0 }}>
                  <span style={{
                    fontSize: 12, fontWeight: 800, letterSpacing: 'normal',
                    color: zoneTone, whiteSpace: 'nowrap',
                  }}>{zoneLabel}</span>
                  <span aria-hidden style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${zoneTone}55, transparent)` }} />
                </div>
              )
            )}
            {/* Section Title — a real button, so it is keyboard reachable and
                announces its expanded state to a screen reader. */}
            {!collapsed && (
              <button
                type="button"
                onClick={() => toggleSection(section.title, !isOpen)}
                aria-expanded={isOpen}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '0 16px 6px 20px',
                  background: 'transparent',
                  border: 'none',
                  /* When a section is collapsed these headers are the ONLY nav
                     text on screen, so they must read as structure, not as
                     disabled. Title Case at 12px in the secondary text grey —
                     clearly subordinate to the white item labels, clearly
                     readable on black, and no longer brand-colored (neon yellow
                     is reserved for the active item and the primary action). */
                  fontSize: '12px',
                  fontWeight: font.weight.bold,
                  color: colors.textDim,
                  userSelect: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span>{displayTitle(section.title)}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  {/* A closed section says how much is inside, so nothing feels
                      lost — you can see there are eleven tools in there. */}
                  {!isOpen && (
                    <span style={{
                      fontVariantNumeric: 'tabular-nums',
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.16)',
                      color: colors.textMuted,
                      borderRadius: 999, padding: '1px 6px', fontSize: 10.5, lineHeight: 1.5,
                    }}>{visibleItems.length}</span>
                  )}
                  <CaretDown
                    size={10}
                    weight="bold"
                    color={colors.textDim}
                    style={{ transform: isOpen ? 'none' : 'rotate(-90deg)', transition: 'transform .15s' }}
                  />
                </span>
              </button>
            )}
            {collapsed && sIdx > 0 && (
              <div style={{ height: 1, background: colors.borderDim, margin: '8px 14px' }} />
            )}

            {/* Items */}
            {isOpen && visibleItems.map((item: any) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              const accent = item.accentKey ? moduleAccent(item.accentKey) : null;
              const vivid = accent ? (accent.vivid ?? accent.hex) : null;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    gap: 11,
                    height: sidebarTokens.itemHeight,
                    padding: collapsed ? '0' : '0 12px 0 16px',
                    margin: '2px 8px',
                    borderRadius: radius.lg,
                    fontSize: font.size.md,
                    fontWeight: active ? font.weight.semibold : font.weight.medium,
                    color: active ? colors.gold : colors.textMuted,
                    background: active
                      ? 'linear-gradient(180deg, var(--brand-primary-18), var(--brand-primary-12))'
                      : 'transparent',
                    boxShadow: active ? 'inset 0 0 0 1px var(--brand-primary-25)' : 'none',
                    textDecoration: 'none',
                    transition: 'background .15s ease, color .15s ease',
                    position: 'relative',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                  }}
                  onMouseEnter={(e) => {
                    if (!active) {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                      e.currentTarget.style.color = colors.text;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active) {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = colors.textMuted;
                    }
                  }}
                >
                  {/* Active indicator — module vivid left rule (gold for un-accented items) */}
                  {active && !collapsed && (
                    <span
                      aria-hidden
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 8,
                        bottom: 8,
                        width: 3,
                        borderRadius: '0 3px 3px 0',
                        background: vivid || colors.gold,
                      }}
                    />
                  )}
                  {vivid && active ? (
                    /* vivid module chip — saturated hue UNDER a white glyph, never hue-on-hue */
                    <span
                      style={{
                        flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: collapsed ? 22 : 20, height: collapsed ? 22 : 20, borderRadius: 6,
                        background: `linear-gradient(150deg, ${vivid}, color-mix(in srgb, ${vivid} 80%, #000000))`,
                        border: `1px solid ${vivid}8C`,
                        boxShadow: `0 0 12px -3px ${vivid}40, inset 0 1px 0 rgba(255,255,255,0.25)`,
                      }}
                    >
                      <Icon size={collapsed ? 14 : 13} weight="fill" color="var(--text-primary)" />
                    </span>
                  ) : (
                    <Icon
                      size={collapsed ? 20 : 18}
                      weight={active ? 'fill' : 'regular'}
                      /* EACH MODULE IN ITS OWN COLOUR, at full strength.
                       *
                       * This was neutral for a while, and the note that made it
                       * neutral blamed the hues: "#B8A98A parchment, #A9A2C4
                       * lavender-gray, #FF8A00 steel, #8FB3A9 patina ... twelve
                       * muted pastels do not read as restraint, they read as
                       * muddy". That diagnosis was right about those values and
                       * wrong about which values were in play — every one it
                       * names is a module's `hex`, the SOFT tone meant for
                       * fills and rings. `vivid` is the other half of the pair
                       * and it is a different animal:
                       *
                       *   hex    19-51% saturation   the muddy pastels
                       *   vivid  71-96% saturation   e.g. amber, blue, green
                       *
                       * Measured all 97 modules against this rail: every vivid
                       * clears 3:1, most sit between 5:1 and 9:1. So the color
                       * is confident AND legible, which is what the pastels
                       * never were.
                       *
                       * Only the ICON wears it. Labels stay one uniform slate,
                       * so the rail still reads as a list rather than a rainbow
                       * of text, and the active item keeps its vivid chip and
                       * gold rule to stay the loudest thing on screen. Full
                       * opacity — dimming a saturated color is what produced
                       * the mud in the first place. */
                      color={vivid || undefined}
                      style={{ flexShrink: 0, opacity: 1 }}
                    />
                  )}
                  {!collapsed && (
                    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 7, minWidth: 0 }}>

                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                    </span>
                  )}
                  {!collapsed && item.badge && (
                    <span
                      style={{
                        marginLeft: 'auto',
                        fontSize: font.size.xs,
                        fontWeight: font.weight.bold,
                        background: active ? colors.gold : accent ? accent.soft : colors.raisedAlt,
                        color: active ? 'var(--on-brand)' : accent ? accent.hex : colors.textMuted,
                        borderRadius: radius.full,
                        padding: '1px 7px',
                        minWidth: 18,
                        textAlign: 'center',
                      }}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
          );
        })}
        {/* ── "All tools" ────────────────────────────────────────────
            Only inside a project, and only when the tool filter is actually
            holding something back. Company scope has no such control because
            it is not filtered.

            This is not the old showAll toggle that was removed. That one hid
            COMPANY items by a rule the user never set, so the rail's shape
            changed as you navigated. This hides only project modules with no
            work in them, never the page you are on, it says how many, and
            one click brings every one of them back. */}
        {!collapsed && hiddenTools > 0 && (
          <div style={{ padding: '2px 12px 12px' }}>
            <button
              type="button"
              onClick={() => setShowAllTools((v) => !v)}
              aria-expanded={showAllTools}
              style={{
                width: '100%', minHeight: 40, display: 'flex', alignItems: 'center',
                justifyContent: 'space-between', gap: 8, padding: '0 10px',
                background: 'transparent', border: `1px dashed ${colors.borderDim}`,
                borderRadius: 8, color: colors.textMuted, fontSize: 11.5,
                fontWeight: font.weight.semibold, cursor: 'pointer',
              }}
            >
              <span>{showAllTools ? 'Show Fewer Tools' : 'All Tools'}</span>
              {!showAllTools && (
                <span style={{
                  fontVariantNumeric: 'tabular-nums', color: 'var(--brand-primary)', fontWeight: font.weight.bold,
                  background: 'var(--brand-primary-12)', border: '1px solid var(--brand-primary-25)',
                  borderRadius: 999, padding: '1px 7px', fontSize: 10.5,
                }}>+{hiddenTools}</span>
              )}
            </button>
          </div>
        )}
      </nav>

      {/* Company scope is unfiltered — it lists everything this tenant has. */}

      {/* ── Bottom Section (Settings + Collapse) ────────────────────── */}
      <div style={{ borderTop: `1px solid ${colors.border}`, padding: '8px 0', flexShrink: 0 }}>
        {BOTTOM_ITEMS.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: collapsed ? 'center' : 'flex-start',
                gap: 11,
                height: sidebarTokens.itemHeight,
                padding: collapsed ? '0' : '0 12px 0 16px',
                margin: '2px 8px',
                borderRadius: radius.lg,
                fontSize: font.size.md,
                fontWeight: active ? font.weight.semibold : font.weight.medium,
                color: active ? colors.gold : colors.textMuted,
                background: active ? colors.goldDim : 'transparent',
                textDecoration: 'none',
                transition: 'background .15s ease, color .15s ease',
                position: 'relative',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                  e.currentTarget.style.color = colors.text;
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = colors.textMuted;
                }
              }}
            >
              {active && !collapsed && (
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 8,
                    bottom: 8,
                    width: 3,
                    borderRadius: '0 3px 3px 0',
                    background: colors.gold,
                  }}
                />
              )}
              {/* Same rule as the main rail: the resting icon inherits the link
                  color and stays at full opacity. Dimming a neutral only muddies
                  it — the weight change from regular to fill already marks active. */}
              <Icon size={collapsed ? 20 : 18} weight={active ? 'fill' : 'regular'} style={{ flexShrink: 0, opacity: 1 }} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}

        {/* Collapse toggle */}
        <button
          onClick={onToggle}
          title={collapsed ? 'Expand' : 'Collapse'}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: 11,
            width: 'calc(100% - 16px)',
            height: sidebarTokens.itemHeight,
            padding: collapsed ? '0' : '0 12px 0 16px',
            margin: '2px 8px 0',
            borderRadius: radius.lg,
            background: 'none',
            border: 'none',
            color: colors.textDim,
            fontSize: font.size.md,
            fontWeight: font.weight.medium,
            cursor: 'pointer',
            transition: 'background .15s ease, color .15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
            e.currentTarget.style.color = colors.text;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = colors.textDim;
          }}
        >
          {collapsed ? <CaretRight size={18} style={{ flexShrink: 0 }} /> : <><CaretLeft size={18} style={{ flexShrink: 0 }} /><span>Collapse</span></>}
        </button>
      </div>
    </aside>
  );
}
