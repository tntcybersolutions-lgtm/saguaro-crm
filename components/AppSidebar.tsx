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
  DeviceMobile,
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
} from '@phosphor-icons/react';
import { colors, font, radius, shadow, sidebar as sidebarTokens, z } from '../lib/design-tokens';
import { useWhiteLabel } from './WhiteLabelProvider';
import { useEntitlements } from '../lib/hooks/useEntitlements';
import { moduleAccent } from '../lib/module-identity';
import { Pill } from './ui/premium';

/* ── Types ──────────────────────────────────────────────────────────── */
interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: number;
  gate?: string; // gated feature flag; item hidden unless the tenant is entitled
  /* Shown always. Everything else waits behind "Show everything" — see
     CORE_COUNT below for why. */
  core?: boolean;
  accentKey?: string; // module-identity key -> tints the inactive icon + count badge
}
interface NavSection {
  title: string;
  items: NavItem[];
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
    ? { background: '#FFFFFF', padding: 6, borderRadius: 8, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.06)' }
    : {};
  const hasTenantBrand = hasLogo || !!wl.companyName;

  // Plan pill — honest states only: nothing renders until billing answers.
  const planPill = (() => {
    if (!plan) return null;
    if (plan.status === 'past_due') return <Pill tone="red" caps>Past due</Pill>;
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
          {collapsed ? (
            <img src="/logo-badge.png" alt="Saguaro Control Systems" style={{ height: 32, width: 32, objectFit: 'contain', display: 'block' }} />
          ) : (
            <img src="/logo-horizontal.png" alt="Saguaro Control Systems" style={{ height: 30, width: 'auto', objectFit: 'contain', display: 'block' }} />
          )}
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
        color: '#241500', fontSize, fontWeight: 900, letterSpacing: '0.02em',
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
              style={{ maxWidth: 44, maxHeight: 44, width: 'auto', height: 'auto', objectFit: 'contain', display: 'block', ...platedImg }}
            />
          ) : monogram(36, 14)}
        </Link>
      </div>
    );
  }

  /* ── Expanded: full lockup — logo at a real size, name + plan beneath ── */
  return (
    <div style={{ borderBottom: `1px solid ${colors.border}`, flexShrink: 0, padding: '10px 10px 9px' }}>
      <Link
        href="/app/settings#branding"
        title="Company branding — open Settings"
        aria-label={`${wl.companyName || 'Company'} — brand settings`}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: 'block', textDecoration: 'none',
          padding: '12px 12px 11px', borderRadius: 12,
          background: hover ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
          border: `1px solid ${hover ? 'var(--brand-primary-35)' : colors.borderDim}`,
          boxShadow: hover ? '0 6px 18px -10px var(--brand-primary-35), inset 0 1px 0 rgba(255,255,255,0.06)' : 'inset 0 1px 0 rgba(255,255,255,0.04)',
          transition: 'background .15s ease, border-color .15s ease, box-shadow .15s ease',
          overflow: 'hidden',
        }}
      >
        {hasLogo ? (
          <>
            {/* Logo at a proper size — contained, aspect preserved, left-anchored.
                maxHeight was 48, which is what made this unreadable: the cap is
                on HEIGHT with width:auto, so a PORTRAIT logo collapses to a
                sliver. A real 600x1301 tenant logo rendered at 22x48px. Tall
                logos now get real height, and wide lockups still stop at 100%
                width, so both shapes land somewhere sensible. */}
            <img
              src={wl.logoUrl}
              alt={wl.companyName || 'Company logo'}
              onError={() => setImgFailed(true)}
              style={{
                display: 'block', maxWidth: '100%', maxHeight: 96,
                width: 'auto', height: 'auto', objectFit: 'contain', objectPosition: 'left center',
                ...platedImg,
                marginBottom: (wl.companyName || planPill) ? 9 : 0,
              }}
            />
            {(wl.companyName || planPill) && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                {wl.companyName && (
                  <span style={{
                    flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    fontSize: 12, fontWeight: font.weight.bold, color: colors.textMuted, letterSpacing: '0.01em',
                  }}>
                    {wl.companyName}
                  </span>
                )}
                {planPill}
              </span>
            )}
          </>
        ) : (
          /* Typographic lockup — monogram + name + plan. Clean, never a box. */
          <span style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
            {monogram(42, 16)}
            <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
              <span style={{
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                fontSize: 13.5, fontWeight: font.weight.black, color: colors.text, letterSpacing: '-0.01em', lineHeight: 1.2,
              }}>
                {wl.companyName}
              </span>
              {planPill && <span style={{ display: 'flex' }}>{planPill}</span>}
            </span>
          </span>
        )}
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
 * Three rules, the same ones the project tool rail already uses:
 *   1. Core items are always shown.
 *   2. The page you are on is always shown, so the rail never hides where you
 *      are — that is how a nav loses somebody.
 *   3. "Show everything" reveals the rest and is remembered, so a GC who wants
 *      the full rail asks once.
 */
const SHOW_ALL_KEY = 'saguaro.sidebar.showAll';

/* ── Navigation Config ─────────────────────────────────────────────── */
const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard',    href: '/app',              icon: GridFour, core: true },
      { label: 'My Work',      href: '/app/my-work',      icon: Briefcase, accentKey: 'work', core: true },
      { label: 'Projects',     href: '/app/projects',     icon: FolderSimple, core: true },
      { label: 'People & Access', href: '/app/people',    icon: Users, accentKey: 'team' },
      { label: 'Time Clock',   href: '/app/time',         icon: Clock, accentKey: 'time' },
      { label: 'Fleet',        href: '/app/fleet',        icon: Truck, gate: 'fleet' },
    ],
  },
  {
    // Entire section is gated to command_center — hidden unless the tenant is entitled.
    title: 'Franchise Rollout',
    items: [
      { label: 'Command Center',    href: '/app/command-center',            icon: Gauge,        gate: 'command_center' },
      { label: 'Rollout Pipeline',  href: '/app/command-center/rollout',    icon: Kanban,       gate: 'command_center' },
      { label: 'Pre-Site Inspection', href: '/app/command-center/pre-site', icon: MagnifyingGlass, gate: 'command_center' },
      { label: 'KPI Dashboard',     href: '/app/command-center/kpis',       icon: ChartLineUp,  gate: 'command_center' },
      { label: 'Long-Lead Tracker', href: '/app/command-center/long-lead',  icon: Truck,        gate: 'command_center' },
      { label: 'Risk Register',     href: '/app/command-center/risks',      icon: Warning,      gate: 'command_center' },
      { label: 'Milestone Variance',href: '/app/command-center/milestones', icon: Flag,         gate: 'command_center' },
      { label: 'Escalations',       href: '/app/command-center/escalations',icon: Bell,         gate: 'command_center' },
      { label: 'OAC Meetings',      href: '/app/command-center/oac',        icon: Users,        gate: 'command_center' },
      { label: 'Verification Hub',  href: '/app/command-center/verify',     icon: ShieldCheck,  gate: 'command_center' },
      { label: 'Owner Updates',     href: '/app/command-center/owner-updates', icon: Notepad,   gate: 'command_center' },
      { label: 'Stakeholders',      href: '/app/command-center/directory',  icon: AddressBook,  gate: 'command_center' },
      { label: 'Phase Checklists',  href: '/app/command-center/checklists', icon: ListChecks,   gate: 'command_center' },
      { label: 'Vendor Schedule',   href: '/app/command-center/vendors',    icon: CalendarCheck,gate: 'command_center' },
      { label: 'Daily Reports',     href: '/app/command-center/daily-logs', icon: NotePencil,   gate: 'command_center' },
      { label: 'Budget & COs',      href: '/app/command-center/budget',     icon: CurrencyDollar, gate: 'command_center' },
      { label: 'Financials',        href: '/app/command-center/financials', icon: Receipt,      gate: 'command_center' },
      { label: 'QC by Trade',       href: '/app/command-center/qc',         icon: SealCheck,    gate: 'command_center' },
      { label: 'Owner Portals',     href: '/app/command-center/portals',    icon: ShareNetwork, gate: 'command_center' },
    ],
  },
  {
    title: 'Pre-Construction',
    items: [
      { label: 'Bids & Estimates', href: '/app/bids',         icon: CurrencyDollar, core: true },
      { label: 'Takeoff Studio',   href: '/app/takeoff',      icon: Blueprint, accentKey: 'takeoff', core: true },
      { label: 'Catalog',          href: '/app/catalog',      icon: Package, accentKey: 'catalog' },
      { label: 'Signal Studio',    href: '/app/signal-studio', icon: WifiHigh, accentKey: 'signal' },
      { label: 'Intelligence',     href: '/app/intelligence', icon: Brain },
    ],
  },
  {
    title: 'Execution',
    items: [
      { label: 'Documents',   href: '/app/documents',  icon: FileText, accentKey: 'documents', core: true },
      { label: 'Daily Logs',  href: '/app/daily-logs', icon: ClipboardText, accentKey: 'daily' },
      { label: 'Schedule',    href: '/app/schedule',   icon: CalendarBlank, accentKey: 'schedule', core: true },
      { label: 'Field App',   href: '/field',          icon: DeviceMobile },
      { label: 'Saguaro Radio', href: '/app/radio',    icon: Broadcast, accentKey: 'radio' },
    ],
  },
  {
    title: 'Financial',
    items: [
      { label: 'Invoicing',   href: '/app/invoicing',  icon: CreditCard, accentKey: 'invoices', core: true },
      { label: 'Billing',     href: '/app/billing',    icon: CurrencyDollar },
      { label: 'Reports',     href: '/app/reports',    icon: ChartBar },
    ],
  },
  {
    title: 'Tools',
    items: [
      { label: 'Autopilot',   href: '/app/autopilot',   icon: Star },
      { label: 'Compliance',  href: '/app/compliance',  icon: ShieldCheck, accentKey: 'compliance' },
      { label: 'Portals',     href: '/app/portals',     icon: SquaresFour },
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
  const { features } = useEntitlements(); // fail-closed: gated items hidden until entitled
  /* Starts short for everybody, including a first load with no stored answer —
     the short rail is the point, so it must not depend on reading storage. */
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(SHOW_ALL_KEY) === '1') setShowAll(true);
    } catch { /* private window, blocked storage — the short rail is fine */ }
  }, []);

  const toggleShowAll = () => {
    setShowAll((prev) => {
      const next = !prev;
      try { localStorage.setItem(SHOW_ALL_KEY, next ? '1' : '0'); } catch { /* not worth failing over */ }
      return next;
    });
  };
  const width = collapsed ? sidebarTokens.widthCollapsed : sidebarTokens.width;

  const hiddenCount = NAV_SECTIONS.reduce(
    (n, section) =>
      n + section.items.filter(
        (item) =>
          (!item.gate || features[item.gate] === true) &&
          !item.core &&
          !isActive(item.href),
      ).length,
    0,
  );

  function isActive(href: string) {
    if (href === '/app') return pathname === '/app';
    // Command Center index highlights only on its own page, not its sub-routes
    // (Rollout, KPIs, Long-Lead, …), which each own their nav item.
    if (href === '/app/command-center') return pathname === '/app/command-center';
    if (href === '/field') return pathname.startsWith('/field');
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
        // machined rail: vertical gradient + a shadow cast INTO the content and a
        // lit inset hairline — the shell reads as a surface, not a flat strip
        background: `linear-gradient(180deg, ${colors.darkAlt}, #0c0d10)`,
        borderRight: '1px solid rgba(0,0,0,0.55)',
        boxShadow: '14px 0 34px rgba(0,0,0,0.35), inset -1px 0 0 rgba(255,255,255,0.05)',
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
      <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '10px 0' }}>
        {NAV_SECTIONS.map((section, sIdx) => {
          const entitled = section.items.filter((item) => !item.gate || features[item.gate] === true);
          const visibleItems = entitled.filter(
            (item) => showAll || item.core || isActive(item.href),
          );
          // Hide an entire section (title + divider) when the tenant sees none of its items.
          if (visibleItems.length === 0) return null;
          return (
          <div key={section.title} style={{ marginBottom: sIdx === NAV_SECTIONS.length - 1 ? 4 : 14 }}>
            {/* Section Title */}
            {!collapsed && (
              <div
                style={{
                  padding: '0 16px 6px 20px',
                  fontSize: '10px',
                  fontWeight: font.weight.bold,
                  color: colors.textFaint,
                  textTransform: 'uppercase',
                  letterSpacing: 1.4,
                  userSelect: 'none',
                }}
              >
                {section.title}
              </div>
            )}
            {collapsed && sIdx > 0 && (
              <div style={{ height: 1, background: colors.borderDim, margin: '8px 14px' }} />
            )}

            {/* Items */}
            {visibleItems.map((item) => {
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
                      <Icon size={collapsed ? 14 : 13} weight="fill" color="#F8FAFC" />
                    </span>
                  ) : (
                    <Icon
                      size={collapsed ? 20 : 18}
                      weight={active ? 'fill' : 'regular'}
                      style={{ flexShrink: 0, opacity: active ? 1 : 0.85, color: active ? undefined : vivid || undefined }}
                    />
                  )}
                  {!collapsed && <span>{item.label}</span>}
                  {!collapsed && item.badge && (
                    <span
                      style={{
                        marginLeft: 'auto',
                        fontSize: font.size.xs,
                        fontWeight: font.weight.bold,
                        background: active ? colors.gold : accent ? accent.soft : colors.raisedAlt,
                        color: active ? colors.dark : accent ? accent.hex : colors.textMuted,
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
      </nav>

      {/* One control instead of thirty. Sits at the end of the rail, where a
          GC looks after not finding what they came for. */}
      {hiddenCount > 0 || showAll ? (
        <button
          onClick={toggleShowAll}
          title={collapsed ? (showAll ? 'Show less' : 'Show everything') : undefined}
          aria-expanded={showAll}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start',
            gap: 11, width: 'calc(100% - 16px)', height: sidebarTokens.itemHeight,
            padding: collapsed ? 0 : '0 12px 0 16px', margin: '2px 8px 8px',
            borderRadius: radius.lg, background: 'transparent', border: 'none',
            color: colors.textMuted, fontSize: font.size.md, fontWeight: font.weight.medium,
            cursor: 'pointer', whiteSpace: 'nowrap', textAlign: 'left',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = colors.text; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = colors.textMuted; }}
        >
          {showAll
            ? <CaretUp size={collapsed ? 20 : 18} weight="bold" style={{ flexShrink: 0, opacity: 0.85 }} />
            : <DotsThree size={collapsed ? 20 : 18} weight="bold" style={{ flexShrink: 0, opacity: 0.85 }} />}
          {!collapsed && <span>{showAll ? 'Show less' : `Show everything (${hiddenCount})`}</span>}
        </button>
      ) : null}

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
              <Icon size={collapsed ? 20 : 18} weight={active ? 'fill' : 'regular'} style={{ flexShrink: 0, opacity: active ? 1 : 0.85 }} />
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
