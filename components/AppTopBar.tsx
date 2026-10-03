'use client';
/**
 * AppTopBar — Slim header with breadcrumbs, search, notifications, user menu.
 * Sits to the right of the sidebar.
 */
import React, { useState, useEffect } from 'react';
import { HelpModeButton } from '@/components/HelpMode';
import HeaderProjectPicker from '@/components/HeaderProjectPicker';
import { useProjects } from '@/lib/hooks/useProjects';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useGuardedRouter } from '@/lib/navGuard';
import {
  MagnifyingGlass,
  Bell,
  Star,
  CaretRight,
  ArrowLeft,
  SignOut,
  UserCircle,
  GearSix,
  List,
} from '@phosphor-icons/react';
import { font, radius, sidebar as sidebarTokens, z } from '../lib/design-tokens';

/* ── Breadcrumb Labels ─────────────────────────────────────────────── */
const LABELS: Record<string, string> = {
  app: 'Home',
  projects: 'Projects',
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
};

export default function AppTopBar({
  sidebarCollapsed,
  onToggleSidebar,
  onOpenSage,
  onOpenCommandPalette,
  onLogout,
  userInitials,
}: {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onOpenSage: () => void;
  onOpenCommandPalette: () => void;
  onLogout: () => void;
  userInitials: string;
}) {
  const pathname = usePathname();
  const router = useGuardedRouter();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const sidebarWidth = sidebarCollapsed ? sidebarTokens.widthCollapsed : sidebarTokens.width;

  /* ── Breadcrumbs ─────────────────────────────────────────────────── */
  const segments = pathname.split('/').filter(Boolean);
  // Resolve a project UUID in the path (/app/projects/<uuid>/...) to its real name
  // so the crumb reads e.g. "Martin Residence" instead of a truncated UUID.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const projIdx = segments.indexOf('projects');
  const projId = projIdx >= 0 && segments[projIdx + 1] && UUID_RE.test(segments[projIdx + 1]) ? segments[projIdx + 1] : null;
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const { projects: crumbProjects } = useProjects();
  useEffect(() => {
    if (!projId || projectNames[projId]) return;
    const p = (crumbProjects as any[]).find((x: any) => x?.id === projId);
    if (p) {
      setProjectNames((prev) => ({ ...prev, [projId]: p.name || p.project_name || p.title || 'Project' }));
      return;
    }
    /**
     * Not in the shell's list — fetch it.
     *
     * useProjects caps at fifteen, so the sixteenth job fell through to the
     * literal word "Project". The crumb whose entire job is telling you which
     * job you are in was telling you nothing, which is exactly the complaint.
     */
    let cancelled = false;
    fetch(`/api/projects/${projId}?fields=id,name`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        const rec = d.project ?? d;
        const nm = rec?.name || rec?.project_name || rec?.title;
        if (nm) setProjectNames((prev) => ({ ...prev, [projId]: nm }));
      })
      .catch(() => { /* the crumb keeps its fallback; navigation still works */ });
    return () => { cancelled = true; };
  }, [projId, crumbProjects]); // eslint-disable-line react-hooks/exhaustive-deps
  const allCrumbs = segments.map((seg, i) => ({
    seg,
    label:
      LABELS[seg] ||
      (UUID_RE.test(seg)
        ? projectNames[seg] || 'Project'
        : seg.length > 20
        ? seg.slice(0, 12) + '…'
        : seg.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())),
    href: '/' + segments.slice(0, i + 1).join('/'),
    isLast: i === segments.length - 1,
  }));

  /**
   * The picker owns the project; the breadcrumb owns the tool.
   *
   * With both showing the job, its name appeared three times across one header
   * — in the back button, in the picker, and in the crumb — and on a long name
   * that pushed the actual page you were on off the edge. Procore's header
   * never repeats it: the selector says which job, the trail says which tool.
   * So the project crumb, and the "Projects" crumb above it, are dropped while
   * you are inside a project, because the picker is already saying both.
   */
  const insideProject = Boolean(projId);
  const crumbs = insideProject
    ? allCrumbs.filter((c, i) => !UUID_RE.test(c.seg) && !(c.seg === 'projects' && i > 0))
    : allCrumbs;

  return (
    <header
      style={{
        position: 'fixed',
        top: 0,
        left: sidebarWidth,
        right: 0,
        /* The iOS app draws under the status bar (viewport-fit=cover); the
           inset is 0 everywhere else. */
        height: `calc(${sidebarTokens.headerHeight}px + env(safe-area-inset-top, 0px))`,
        paddingTop: 'env(safe-area-inset-top, 0px)',
        boxSizing: 'border-box',
        background: 'rgba(0,0,0,0.72)',
        borderBottom: '1px solid rgba(255,255,255,0.12)',
        backdropFilter: 'blur(16px) saturate(140%)',
        WebkitBackdropFilter: 'blur(16px) saturate(140%)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: 10,
        zIndex: z.topbar,
        transition: 'left .2s ease',
      }}
    >
      {/* Mobile hamburger (hidden on desktop via media query) */}
      <button
        onClick={onToggleSidebar}
        className="mobile-hamburger-topbar"
        style={{
          display: 'none',
          alignItems: 'center',
          justifyContent: 'center',
          width: 36,
          height: 36,
          background: 'none',
          border: 'none',
          color: '#D7DEE8',
          cursor: 'pointer',
          borderRadius: radius.xl,
          transition: 'color .15s, background .15s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = '#FFFFFF';
          e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = '#D7DEE8';
          e.currentTarget.style.background = 'none';
        }}
      >
        <List size={20} />
      </button>

      {/* Back button — on every app page, navigates up to the parent (hierarchical),
          falling back to browser history. Hidden at the app root where there's no parent. */}
      {crumbs.length > 1 && (
        <button
          onClick={() => { const parent = crumbs[crumbs.length - 2]; if (parent) router.push(parent.href); else router.back(); }}
          aria-label={`Back to ${crumbs[crumbs.length - 2]?.label || 'previous page'}`}
          title="Back"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            height: 34, padding: '0 12px 0 10px', marginRight: 4,
            background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: radius.xl,
            color: '#FFFFFF', cursor: 'pointer', fontSize: font.size.sm, fontWeight: font.weight.medium,
            transition: 'background .15s, border-color .15s', flexShrink: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'var(--brand-primary)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
        >
          {/* Name the destination. "Back" alone makes you click to find out
              where you land — and on a project sub-page there are three
              plausible answers. Procore names it; so do we. Truncated so a
              long project name cannot push the breadcrumbs off screen. */}
          <ArrowLeft size={16} weight="bold" />
          <span style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {crumbs[crumbs.length - 2]?.label || 'Back'}
          </span>
        </button>
      )}

      {/* The job you are in — same place on every screen, and switching keeps
          you on the screen you are looking at. */}
      <HeaderProjectPicker />

      <span aria-hidden style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.12)', margin: '0 4px', flexShrink: 0 }} />

      {/* Breadcrumbs */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, overflow: 'hidden' }}>
        {crumbs.map((c, i) => (
          <React.Fragment key={c.href}>
            {i > 0 && <CaretRight size={11} weight="bold" style={{ color: '#7A8597' }} />}
            {c.isLast ? (
              <span style={{ fontSize: font.size.lg, fontWeight: font.weight.semibold, color: '#FFFFFF', letterSpacing: '-0.01em' }}>{c.label}</span>
            ) : (
              <Link
                href={c.href}
                style={{ fontSize: font.size.lg, color: '#D7DEE8', textDecoration: 'none', transition: 'color .15s' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#FFFFFF')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#D7DEE8')}
              >
                {c.label}
              </Link>
            )}
          </React.Fragment>
        ))}
      </nav>

      <div style={{ flex: 1 }} />

      {/* Search button (⌘K) */}
      <button
        onClick={onOpenCommandPalette}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          height: 36,
          padding: '0 10px 0 12px',
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: radius.xl,
          color: '#D7DEE8',
          fontSize: font.size.md,
          fontWeight: font.weight.medium,
          cursor: 'pointer',
          transition: 'border-color .15s, background .15s',
          minWidth: 220,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-strong)';
          e.currentTarget.style.background = 'rgba(255,255,255,0.07)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
          e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
        }}
      >
        <MagnifyingGlass size={15} style={{ color: '#A9B4C4' }} />
        <span>Search</span>
        <kbd
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            height: 20,
            padding: '0 6px',
            fontSize: font.size.xs,
            fontWeight: font.weight.semibold,
            fontFamily: font.mono,
            color: '#D7DEE8',
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: radius.md,
          }}
        >
          ⌘K
        </kbd>
      </button>

      {/* Help Mode — sits before Sage: the arrows are the answer to "where is
          the button", Sage is the answer to "what should I do". */}
      <HelpModeButton />

      {/* Sage AI */}
      <button
        onClick={onOpenSage}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          height: 36,
          padding: '0 14px',
          background: 'linear-gradient(180deg, var(--brand-primary-strong), var(--brand-primary) 60%, var(--brand-primary-hover))',
          border: 'none',
          borderRadius: radius.xl,
          color: 'var(--on-brand)',
          fontSize: font.size.md,
          fontWeight: font.weight.bold,
          letterSpacing: '0.01em',
          cursor: 'pointer',
          boxShadow: '0 2px 10px var(--brand-primary-25), inset 0 1px 0 rgba(255,255,255,0.35)',
          transition: 'box-shadow .15s, filter .15s, transform .12s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = '0 4px 16px var(--brand-primary-35), inset 0 1px 0 rgba(255,255,255,0.35)';
          e.currentTarget.style.filter = 'brightness(1.04)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = '0 2px 10px var(--brand-primary-25), inset 0 1px 0 rgba(255,255,255,0.35)';
          e.currentTarget.style.filter = 'none';
        }}
      >
        <Star size={15} weight="fill" />
        Sage
      </button>

      {/* Notifications */}
      <button
        onClick={() => router.push('/app/notifications')}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 36,
          height: 36,
          background: 'none',
          border: 'none',
          color: '#D7DEE8',
          cursor: 'pointer',
          borderRadius: radius.xl,
          transition: 'color .15s, background .15s',
          position: 'relative',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = '#FFFFFF';
          e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = '#D7DEE8';
          e.currentTarget.style.background = 'none';
        }}
      >
        <Bell size={18} />
      </button>

      {/* User avatar + menu */}
      <div style={{ position: 'relative', marginLeft: 2 }}>
        <button
          onClick={() => setShowUserMenu((v) => !v)}
          style={{
            width: 34,
            height: 34,
            borderRadius: radius.full,
            background: 'linear-gradient(135deg, var(--brand-primary-strong), var(--brand-primary))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: font.size.md,
            fontWeight: font.weight.bold,
            color: 'var(--on-brand)',
            cursor: 'pointer',
            border: 'none',
            boxShadow: showUserMenu ? '0 0 0 2px var(--brand-primary-35)' : 'none',
            transition: 'box-shadow .15s',
          }}
          onMouseEnter={(e) => {
            if (!showUserMenu) e.currentTarget.style.boxShadow = '0 0 0 2px var(--brand-primary-35)';
          }}
          onMouseLeave={(e) => {
            if (!showUserMenu) e.currentTarget.style.boxShadow = 'none';
          }}
        >
          {userInitials}
        </button>

        {showUserMenu && (
          <>
            <div onClick={() => setShowUserMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: z.dropdown - 1 }} />
            <div
              style={{
                position: 'absolute',
                top: 44,
                right: 0,
                background: 'rgba(22,24,29,0.94)',
                backdropFilter: 'blur(20px) saturate(150%)',
                WebkitBackdropFilter: 'blur(20px) saturate(150%)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: radius['2xl'],
                minWidth: 196,
                boxShadow: 'var(--shadow-lg)',
                zIndex: z.dropdown,
                overflow: 'hidden',
                padding: 6,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px 10px',
                }}
              >
                <UserCircle size={28} weight="fill" style={{ color: '#A9B4C4', flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '11.5px', fontWeight: font.weight.bold, color: '#A9B4C4', lineHeight: 1.4 }}>
                    Signed In As
                  </div>
                  <div style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: '#FFFFFF', lineHeight: 1.3 }}>
                    {userInitials}
                  </div>
                </div>
              </div>
              <div style={{ height: 1, background: 'var(--border-default)', margin: '2px 0 6px' }} />
              <Link
                href="/app/settings"
                onClick={() => setShowUserMenu(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 10px',
                  borderRadius: radius.lg,
                  color: '#FFFFFF',
                  fontSize: font.size.md,
                  fontWeight: font.weight.medium,
                  textDecoration: 'none',
                  transition: 'background .1s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <GearSix size={16} style={{ color: '#D7DEE8' }} /> Settings
              </Link>
              <button
                onClick={() => { setShowUserMenu(false); onLogout(); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  padding: '9px 10px',
                  marginTop: 2,
                  borderRadius: radius.lg,
                  background: 'none',
                  border: 'none',
                  color: '#FF4D5E',
                  fontSize: font.size.md,
                  fontWeight: font.weight.medium,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background .1s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,77,94,0.10)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <SignOut size={16} /> Sign Out
              </button>
            </div>
          </>
        )}
      </div>

      {/* Responsive styles */}
      <style>{`
        @media (max-width: 768px) {
          .mobile-hamburger-topbar { display: flex !important; }
        }
      `}</style>
    </header>
  );
}
