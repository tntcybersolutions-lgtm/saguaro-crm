'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import { accentForProject } from '@/lib/project-identity';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { isToolVisible, hiddenToolCount, type ToolSignals } from '@/lib/project-tools';
import { moduleAccent } from '@/lib/module-identity';
import { useProject } from '@/lib/hooks/useProjects';
import {
  SquaresFour, Ruler, Calculator, FileText, CalendarBlank, Package, Palette,
  Clipboard, NotePencil, Wallet, ArrowsClockwise, Money, Receipt, Signature,
  ShieldCheck, IdentificationBadge, ClipboardText, Camera, MagnifyingGlass,
  HardHat, CheckCircle, CheckSquare, Timer, Question, Export, ChatCircle,
  Folder, Bank, BookOpen, Users, Globe, Laptop, ArrowsSplit, Plug, Shield,
  WifiHigh, Broadcast, Gear, Robot, ChartBar, Brain, CaretLeft, CaretRight, ArrowLeft, X,
} from '@phosphor-icons/react';

const GOLD = '#F59E0B'; const DARK = '#0a0a0a'; const RAISED = '#141416';
const BORDER = 'rgba(255,255,255,0.12)'; const DIM = '#CBD5E1'; const TEXT = '#FFFFFF';

// ALL sidebar nav items — every module Buildertrend has + more.
// `accent` = module-identity key (lib/module-identity): the item's icon wears
// the module's VIVID chip when active and a vivid-tinted glyph when inactive.
const NAV_SECTIONS = [
  {
    label: 'PROJECT',
    items: [
      { label: 'Overview',        href: '',                   icon: SquaresFour, badge: null },
      { label: 'Takeoff',         href: '/takeoff',           icon: Ruler, badge: null, accent: 'takeoff' },
      { label: 'Estimate',        href: '/estimate',          icon: Calculator, badge: null, accent: 'estimates' },
      { label: 'Proposal',        href: '/proposal',          icon: FileText, badge: null },
    ],
  },
  {
    label: 'EXECUTION',
    items: [
      { label: 'Schedule',              href: '/schedule',          icon: CalendarBlank, badge: null, accent: 'schedule' },
      { label: 'Bid Packages',          href: '/bid-packages',      icon: Package, badge: null, accent: 'bids' },
      { label: 'Selections & Allowances', href: '/selections',      icon: Palette, badge: null },
      { label: 'Contracts',             href: '/contracts',         icon: Clipboard, badge: null, accent: 'contracts' },
      { label: 'PO & Subcontracts',     href: '/purchase-orders',   icon: NotePencil, badge: null },
    ],
  },
  {
    label: 'FINANCIAL',
    items: [
      { label: 'Budget',          href: '/budget',            icon: Wallet, badge: null, accent: 'budget' },
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
    label: 'COMMUNICATION',
    items: [
      { label: 'RFIs',            href: '/rfis',              icon: Question, accent: 'rfis' },
      { label: 'Submittals',      href: '/submittals',        icon: Export, badge: null },
      { label: 'Messages',        href: '/messages',          icon: ChatCircle, badge: null, accent: 'messages' },
    ],
  },
  {
    label: 'DOCUMENTS',
    items: [
      { label: 'Files',           href: '/files',             icon: Folder, badge: null, accent: 'documents' },
      { label: 'Drawings',        href: '/drawings',          icon: Ruler, badge: null, accent: 'drawings' },
      { label: 'Permits',         href: '/permits',           icon: Bank,  badge: null, accent: 'permits' },
      { label: 'Specifications',  href: '/specs',             icon: BookOpen, badge: null, accent: 'specs' },
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
    label: 'LOW VOLTAGE / IT',
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
    label: 'AI',
    items: [
      { label: 'Autopilot Alerts', href: '/autopilot',       icon: Robot  },
      { label: 'Bid Intelligence', href: '/intelligence',    icon: Brain, badge: null },
    ],
  },
];

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const params = useParams();
  const projectId = params['projectId'] as string;
  const base = `/app/projects/${projectId}`;
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  /* Forty-nine modules on every job is why a GC cannot find the three they
     need. Six core tools always show, anything carrying real work shows
     itself, and the rest sit behind "All tools". The preference is per
     browser rather than per project — a GC who wants everything wants it
     everywhere. */
  const [showAllTools, setShowAllTools] = useState(false);
  useEffect(() => {
    try { setShowAllTools(localStorage.getItem('sag_all_tools') === '1'); } catch { /* private mode */ }
  }, []);
  const toggleAllTools = () => {
    setShowAllTools(v => {
      const next = !v;
      try { localStorage.setItem('sag_all_tools', next ? '1' : '0'); } catch { /* private mode */ }
      return next;
    });
  };
  // W-2: the sidebar header reads the same '/api/projects/{id}' SWR cache
  // entry as the overview page — opening a project costs ONE aggregate request.
  const { project } = useProject(projectId || null);
  const proj = project as any;
  const projectName = proj?.name || '';
  const projectNumber = proj?.project_number || '';
  const pctDenom = Number(proj?.contractSumToDate) || Number(proj?.contract_amount) || 1;
  const pctComplete = parseFloat((((Number(proj?.totalBilledToDate) || 0) / pctDenom) * 100).toFixed(1));

  // Close mobile module menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const { ctx } = useProjectContext(projectId || null);
  const signals = (ctx || null) as ToolSignals | null;

  /* Every one of the 46 rail items carried `badge: null`, and this component was
     already loading the project context that holds the counts. So a GC opened a
     job and saw forty tool names with no idea where any work was — the one thing
     Procore's sidebar does that made it legible. The numbers were sitting here
     unused.

     Only counts that mean "there is something here for you" are shown. A zero is
     not rendered: a badge reading 0 is noise, and its absence already says it. */
  const c = (ctx as Record<string, any> | null) || null;
  const n = (v: unknown) => {
    const x = Number(v) || 0;
    return x > 0 ? String(x) : null;
  };
  const railCounts: Record<string, string | null> = {
    '/takeoff':          n(c?.takeoff?.count),
    '/bid-packages':     n(c?.bidPackages?.length),
    '/budget':           n(c?.budget?.lineCount),
    '/pay-apps':         n(c?.money?.payAppCount),
    '/invoices':         n(c?.counts?.invoices),
    '/bills':            n(c?.counts?.bills),
    '/purchase-orders':  n(c?.counts?.purchaseOrders),
    '/rfis':             n(c?.counts?.openRfis),
    '/submittals':       n(c?.counts?.openSubmittals),
    '/schedule':         n(c?.counts?.scheduleTasks),
    '/punch-list':       n(c?.counts?.openPunch),
    '/subs':             n(c?.subs?.length),
    '/directory':        n(c?.contactCount),
    '/crews':            n(c?.subs?.length),
    '/change-orders':    n(c?.money?.pendingCoCount),
  };
  /* The href of the page being viewed — passed to isToolVisible so the nav can
     never hide the row you are standing on, however you got here. */
  const activeHref = React.useMemo(() => {
    const all = NAV_SECTIONS.flatMap(sec => sec.items.map(i => i.href));
    const rel = pathname.startsWith(base) ? pathname.slice(base.length) : pathname;
    return all.find(h => h !== '' && rel.startsWith(h)) ?? (pathname === base ? '' : '');
  }, [pathname, base]);
  const allHrefs = React.useMemo(() => NAV_SECTIONS.flatMap(sec => sec.items.map(i => i.href)), []);
  const hiddenCount = hiddenToolCount(allHrefs, signals, activeHref);

  const isActive = (href: string) => {
    if (href === '') return pathname === base;
    // App-level modules (absolute /app/... hrefs) live outside the project base.
    const full = href.startsWith('/app/') ? href : base + href;
    return pathname.startsWith(full);
  };

  // Shared sidebar contents — rendered by both the desktop <aside> and the
  // mobile slide-over overlay. `isCollapsed` only ever true on desktop; the
  // mobile overlay always renders fully expanded.
  const renderSidebarBody = (isCollapsed: boolean) => (
    <>
      {/* Project header */}
      <div style={{ padding: '14px 12px', borderBottom: `1px solid ${BORDER}` }}>
        {!isCollapsed && (
          <>
            <div style={{ fontSize: 12, fontWeight: 700, color: accentForProject(projectId as string).hex, marginBottom: 2, lineHeight: 1.3 }}>{projectName || '—'}</div>
            <div style={{ fontSize: 10, color: DIM, marginBottom: 8 }}>{projectNumber}</div>
            {/* Progress */}
            <div style={{ height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 2, marginBottom: 3 }}>
              <div style={{ height: '100%', width: `${pctComplete}%`, background: `linear-gradient(90deg,${GOLD},#FBBF24)`, borderRadius: 2 }} />
            </div>
            {/* "billed", not "complete". This is money invoiced against the
                contract sum — it says nothing about how much work is done or
                how far through setup the job is, and calling it "complete"
                put it in direct contradiction with the journey's step count
                a few inches to the right. */}
            <div style={{ fontSize: 10, color: DIM }}>{pctComplete}% billed</div>
          </>
        )}
        <button onClick={() => setCollapsed(!collapsed)} style={{ marginTop: isCollapsed ? 0 : 8, background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 16, padding: 0, display: 'flex' }}>
          {isCollapsed ? <CaretRight size={16} weight="regular" color={DIM} /> : <CaretLeft size={16} weight="regular" color={DIM} />}
        </button>
      </div>

      {/* Nav sections */}
      {NAV_SECTIONS.map(section => {
        const visible = section.items.filter(i => isToolVisible(i.href, signals, activeHref, showAllTools));
        if (visible.length === 0) return null;
        return (
        <div key={section.label} style={{ padding: '8px 0' }}>
          {!isCollapsed && (
            <div style={{ padding: '6px 12px 3px', fontSize: 10, fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
              {section.label}
            </div>
          )}
          {visible.map(item => {
            const active = isActive(item.href);
            const Icon = item.icon;
            const acc = (item as { accent?: string }).accent ? moduleAccent((item as { accent?: string }).accent) : null;
            const vivid = acc ? (acc.vivid ?? acc.hex) : null;
            return (
              <Link
                key={item.href}
                /* Stable handle for Help Mode: "budget", "pay-apps", "rfis" …
                   Five walkthroughs point at links in this rail, and matching
                   them by label meant the arrow hunted for the word "Budget"
                   anywhere on the page. One attribute here anchors all of
                   them. */
                data-tour={`project-nav-${item.href.replace(/^.*\//, '') || 'overview'}`}
                href={item.href.startsWith('/app/') ? `${item.href}?projectId=${projectId}` : base + item.href}
                title={isCollapsed ? item.label : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: isCollapsed ? '8px 16px' : '7px 12px',
                  color: active ? GOLD : DIM,
                  background: active ? 'linear-gradient(180deg, var(--brand-primary-18), var(--brand-primary-12))' : 'transparent',
                  borderLeft: `2px solid ${active ? (vivid || GOLD) : 'transparent'}`,
                  boxShadow: active ? 'inset 0 0 0 1px var(--brand-primary-25)' : 'none',
                  fontSize: 12.5,
                  fontWeight: active ? 700 : 500,
                  textDecoration: 'none',
                  transition: 'background .12s ease, color .12s ease',
                  position: 'relative',
                }}
                onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#FFFFFF'; } }}
                onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = DIM; } }}
              >
                {vivid && active ? (
                  /* vivid module chip — saturated hue UNDER a white glyph, never hue-on-hue */
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, width: 20, height: 20, borderRadius: 6, background: `linear-gradient(150deg, ${vivid}, color-mix(in srgb, ${vivid} 80%, #000000))`, border: `1px solid ${vivid}8C`, boxShadow: `0 0 12px -3px ${vivid}40, inset 0 1px 0 rgba(255,255,255,0.25)` }}>
                    <Icon size={13} weight="fill" color="#F8FAFC" />
                  </span>
                ) : (
                  <span style={{ display: 'inline-flex', flexShrink: 0 }}><Icon size={16} weight="regular" color={vivid || undefined} /></span>
                )}
                {!isCollapsed && <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>}
                {!isCollapsed && ((item as { badge?: string }).badge || railCounts[item.href]) && (
                  <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 8, background: active ? GOLD : '#B85C2A', color: '#1C1C1E' }}>
                    {(item as { badge?: string }).badge || railCounts[item.href]}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
        );
      })}

      {/* Everything not shown above is one click away — nothing was removed. */}
      {!isCollapsed && hiddenCount > 0 && (
        <div style={{ padding: '4px 12px 14px' }}>
          <button
            onClick={toggleAllTools}
            style={{
              width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 8, padding: '0 10px', background: 'transparent',
              border: `1px dashed ${BORDER}`, borderRadius: 8,
              color: DIM, fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = DIM; e.currentTarget.style.background = 'transparent'; }}
          >
            <span>{showAllTools ? 'Show fewer tools' : 'All tools'}</span>
            {!showAllTools && <span style={{ opacity: 0.7 }}>+{hiddenCount}</span>}
          </button>
        </div>
      )}

      {/* Back to projects */}
      <div style={{ padding: '8px 12px', borderTop: `1px solid ${BORDER}`, marginTop: 8 }}>
        <Link href="/app/projects" style={{ display: 'flex', alignItems: 'center', gap: 8, color: DIM, fontSize: 12, fontWeight: 600, textDecoration: 'none', padding: '6px 8px', margin: '-6px -8px', borderRadius: 8, transition: 'background .12s ease, color .12s ease' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#FFFFFF'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = DIM; }}>
          <span style={{ display: 'inline-flex' }}><ArrowLeft size={14} weight="regular" /></span>{!isCollapsed && <span>All Projects</span>}
        </Link>
      </div>
    </>
  );

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 56px)' }}>

      {/* ── Responsive: hide desktop sidebar, expose mobile menu trigger ── */}
      <style>{`
        @media (max-width: 768px) {
          .sidebar-desktop { display: none !important; }
          .project-mobile-bar { display: flex !important; }
        }
      `}</style>

      {/* ── No second desktop rail ───────────────────────────────────────
          This used to render a project rail beside the company rail, so every
          project page carried two navigations at once: about twenty company
          tools that do nothing from inside a job, next to about forty project
          tools. Two columns of links competing is what made the product read
          as scattered, and it is the one thing Procore never does.

          The company rail (components/AppSidebar) now switches to this
          project's tools whenever the URL is inside a project, reading the same
          list from lib/project-nav. One rail, same position, contents that
          match where you are.

          The mobile slide-over below is untouched — on a phone there is only
          ever one rail on screen, so it was never the problem. */}

      {/* ── Page Content ─────────────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0, background: '#0a0a0a' }}>

        {/* Mobile module bar — only shown <=768px (hidden on desktop) */}
        <div className="project-mobile-bar" style={{
          display: 'none',
          alignItems: 'center',
          gap: 10,
          padding: '8px 12px',
          background: '#0a0a0a',
          borderBottom: `1px solid ${BORDER}`,
          position: 'sticky',
          top: 56,
          zIndex: 90,
        }}>
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open project menu"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: RAISED,
              border: `1px solid ${BORDER}`,
              borderRadius: 8,
              color: TEXT,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 700,
              padding: '7px 12px',
            }}
          >
            <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ width: 16, height: 2, background: GOLD, borderRadius: 1 }} />
              <span style={{ width: 16, height: 2, background: GOLD, borderRadius: 1 }} />
              <span style={{ width: 16, height: 2, background: GOLD, borderRadius: 1 }} />
            </span>
            Modules
          </button>
          <div style={{ minWidth: 0, overflow: 'hidden' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: accentForProject(projectId as string).hex, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{projectName || '—'}</div>
            {projectNumber && <div style={{ fontSize: 10, color: DIM }}>{projectNumber}</div>}
          </div>
        </div>

        {children}
      </div>

      {/* ── Project Sidebar (Mobile Slide-over Overlay) ──────────────── */}
      {mobileOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setMobileOpen(false)}
            style={{ position: 'fixed', inset: 0, background: '#0a0a0a', zIndex: 199 }}
          />
          {/* Panel */}
          <aside style={{
            position: 'fixed',
            top: 0,
            left: 0,
            bottom: 0,
            width: 250,
            maxWidth: '82vw',
            background: '#0a0a0a',
            borderRight: `1px solid ${BORDER}`,
            overflowY: 'auto',
            overflowX: 'hidden',
            zIndex: 200,
            scrollbarWidth: 'thin',
          }}>
            {/* Close row */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 10px 0' }}>
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Close project menu"
                style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 24, lineHeight: 1, padding: '2px 6px', display: 'inline-flex' }}
              >
                <X size={24} weight="regular" color={DIM} />
              </button>
            </div>
            {renderSidebarBody(false)}
          </aside>
        </>
      )}
    </div>
  );
}
