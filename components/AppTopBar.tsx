'use client';
/**
 * AppTopBar — the flat top bar (owner approved 2026-10-10).
 *
 * One solid row with a hairline under it:
 *
 *   phone    [‹]  Page title …………………………………  (✦)  (CD)
 *            (inside a job the title has the job under it — tap to switch)
 *   desktop  ⌂ Home / [Job ▾] / Parent / Page title …  Search  Photos  Help  (✦ Sage)  🔔  (CD)
 *
 * Desktop is a trail, Procore's way (Chad, 17 Oct 2026: "give users a way to
 * exit out of the project they are working in to get back to home page
 * easy"): Home is always the first crumb, one click from anywhere, inside a
 * job or not; the job picker is the second; then the screen's parent (when it
 * is not the job itself) and the screen. The old "‹ Back" pill sat beside the
 * picker and, inside a job, named the same job the picker named — two
 * controls, one meaning, and "Back" read as browser back. The parent crumb
 * replaces it on desktop; it still steps through history when the screen
 * before WAS that parent (lib/navHistory), so a list keeps its scroll.
 *
 * Phone keeps the 44px arrow (up one level, named in its aria-label); Home is
 * the first tab in the tab bar, always on screen. Both go through the
 * unsaved-changes gate like every other way out.
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
  CaretLeft,
  House,
  SignOut,
  UserCircle,
  GearSix,
  List,
  Sparkle,
  Camera,
} from '@phosphor-icons/react';
import { font, radius, sidebar as sidebarTokens, z } from '../lib/design-tokens';
import { resolveTopBar, UUID_RE } from '@/lib/topbar-crumbs';
import { recordVisit } from '@/lib/navHistory';
import { openQuickMedia } from '@/components/media/QuickMedia';

export default function AppTopBar({
  sidebarCollapsed,
  onToggleSidebar,
  onOpenSage,
  onOpenCommandPalette,
  onLogout,
  userInitials,
  companyName,
  userId,
}: {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onOpenSage: () => void;
  onOpenCommandPalette: () => void;
  onLogout: () => void;
  userInitials: string;
  /** The company on the signed-in profile — Home's title, as in the approved mock. */
  companyName?: string | null;
  /** The signed-in user — the job picker keeps each person's recent jobs apart. */
  userId?: string | null;
}) {
  const pathname = usePathname();
  const router = useGuardedRouter();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const sidebarWidth = sidebarCollapsed ? sidebarTokens.widthCollapsed : sidebarTokens.width;

  /* ── The job a /app/projects/<uuid>/… path is about, by name ───────── */
  const segments = pathname.split('/').filter(Boolean);
  const projIdx = segments.indexOf('projects');
  const projId = projIdx >= 0 && segments[projIdx + 1] && UUID_RE.test(segments[projIdx + 1]) ? segments[projIdx + 1] : null;
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const { projects: crumbProjects } = useProjects();
  useEffect(() => {
    if (!projId || projectNames[projId]) return;
    const p = (crumbProjects as Array<{ id?: string; name?: string; project_name?: string; title?: string }>).find((x) => x?.id === projId);
    if (p) {
      setProjectNames((prev) => ({ ...prev, [projId]: p.name || p.project_name || p.title || 'Job' }));
      return;
    }
    /* Not in the shell's list (it holds fifteen) — ask for this one by id, so
       the back link names the job instead of saying "Job". */
    let cancelled = false;
    fetch(`/api/projects/${projId}?fields=id,name`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        const rec = d.project ?? d;
        const nm = rec?.name || rec?.project_name || rec?.title;
        if (nm) setProjectNames((prev) => ({ ...prev, [projId]: nm }));
      })
      .catch(() => { /* the back link keeps its fallback label; navigation still works */ });
    return () => { cancelled = true; };
  }, [projId, crumbProjects]); // eslint-disable-line react-hooks/exhaustive-deps

  const { back, title } = resolveTopBar(pathname, { projectNames, companyName: companyName || null });

  /* ── Back: always this screen's real parent ─────────────────────────────
     The label and the destination come from the path (lib/topbar-crumbs), so
     they can never name an unrelated screen visited earlier ("‹ Vlans" on a
     job's overview, "‹ Dashboard Setup" on Documents). When the screen you
     came from IS that parent, Back steps through the browser's history so the
     list keeps its scroll and filters; otherwise it opens the parent. */
  const [prevPath, setPrevPath] = useState<string | null>(null);
  useEffect(() => { setPrevPath(recordVisit(pathname)); }, [pathname]);
  const samePage = (a: string, b: string) => {
    const n = (p: string) => p.split('?')[0].replace(/\/+$/, '').replace(/^(\/app\/projects\/[^/]+)\/overview$/, '$1');
    return n(a) === n(b);
  };
  const backTo = back
    ? { label: back.label, go: () => (prevPath && samePage(prevPath, back.href) ? router.back() : router.push(back.href)) }
    : null;
  /* The desktop trail: Home / [Job ▾] / Parent / Title. The parent crumb is
     left out when it IS a crumb already — the job (the picker names it) or
     Jobs (the picker's own list). */
  const atHome = segments.length === 1 && segments[0] === 'app';
  const parentCrumb = backTo && back && back.href !== '/app/projects' && !(projId && back.href === `/app/projects/${projId}/overview`)
    ? backTo
    : null;
  const hasTail = !!parentCrumb || (!atHome && !!title);

  // Close the account menu on navigation and on Escape.
  useEffect(() => { setShowUserMenu(false); }, [pathname]);
  useEffect(() => {
    if (!showUserMenu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowUserMenu(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showUserMenu]);

  return (
    <header
      className="sag-topbar"
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
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px 0 16px',
        gap: 8,
        zIndex: z.topbar,
        transition: 'left .2s ease',
      }}
    >
      {/* Menu — only where there is neither a sidebar nor a tab bar (exactly
          768px wide); the phone has More in its tab bar. */}
      <button
        type="button"
        onClick={onToggleSidebar}
        className="mobile-hamburger-topbar sag-tb-icon"
        aria-label="Menu"
        style={{ display: 'none' }}
      >
        <List size={20} />
      </button>

      {/* Phone: up one level, the arrow alone (its name is the aria-label).
          Desktop uses the trail below instead. */}
      {backTo && (
        <button
          type="button"
          className="sag-tb-back"
          onClick={backTo.go}
          aria-label={`Back to ${backTo.label}`}
          title={`Back to ${backTo.label}`}
        >
          <CaretLeft size={18} weight="bold" aria-hidden />
        </button>
      )}

      {/* Desktop trail. Home is always the first crumb — out of any job in one
          click; the job picker is the second, and switching keeps you on the
          screen you are looking at. */}
      <nav className="sag-topbar-desktop sag-crumbs" aria-label="Breadcrumb" style={{ display: 'flex' }}>
        <Link
          href="/app"
          className="sag-crumb-home"
          aria-current={atHome ? 'page' : undefined}
          title={companyName ? `Home — ${companyName}` : 'Home'}
        >
          <House size={16} weight={atHome ? 'fill' : 'bold'} aria-hidden />
          <span>Home</span>
        </Link>
        <span className="sag-crumb-sep" aria-hidden>/</span>
        <HeaderProjectPicker userId={userId} />
        {hasTail && (projId
          ? <span className="sag-crumb-sep" aria-hidden>/</span>
          : <span className="sag-crumb-div" aria-hidden />)}
        {parentCrumb && (
          <>
            <button
              type="button"
              className="sag-crumb-prev"
              onClick={parentCrumb.go}
              title={`Back to ${parentCrumb.label}`}
            >
              {parentCrumb.label}
            </button>
            {title && <span className="sag-crumb-sep" aria-hidden>/</span>}
          </>
        )}
      </nav>

      {/* The page you are on. Takes the rest of the row. On desktop Home's
          title is the Home crumb itself, so it is not said twice. */}
      <span className="sag-tb-title sag-crumb-last" aria-current={atHome ? undefined : 'page'}>
        {atHome ? <span className="sag-tb-phone-only">{title}</span>
          : projId ? (
            <>
              <span className="sag-topbar-desktop">{title}</span>
              {/* Phone: the screen, and under it the job — tap to switch jobs. */}
              <span className="sag-tb-phone-only sag-tb-jobtitle"><HeaderProjectPicker userId={userId} variant="title" title={title || undefined} /></span>
            </>
          )
          : title}
      </span>

      {/* Search (⌘K) */}
      <button
        type="button"
        onClick={onOpenCommandPalette}
        className="sag-topbar-desktop sag-tb-search"
        aria-label="Search everything (Ctrl or Cmd + K)"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          height: 36,
          padding: '0 8px 0 11px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: 10,
          color: 'var(--sg-text-2)',
          fontSize: font.size.md,
          fontWeight: font.weight.medium,
          cursor: 'pointer',
          minWidth: 0,
          flexShrink: 0,
        }}
      >
        <MagnifyingGlass size={15} />
        <span className="sg-nav-label">Search</span>
        <kbd
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            height: 20,
            padding: '0 6px',
            fontSize: font.size.sm,
            fontWeight: font.weight.semibold,
            fontFamily: font.mono,
            color: 'var(--sg-text-3)',
            border: '1px solid var(--sg-border)',
            borderRadius: radius.md,
          }}
        >
          ⌘K
        </kbd>
      </button>

      {/* Photos & video to any job, from any screen (the phone has the camera tab). */}
      <button type="button" onClick={() => openQuickMedia()} className="sag-topbar-desktop sag-tb-photo" aria-label="Photos and video — take or upload to any job">
        <Camera size={16} weight="fill" aria-hidden />
        <span>Photos</span>
      </button>

      {/* Help Mode — the arrows are the answer to "where is the button". */}
      <div className="sag-topbar-desktop" style={{ display: 'contents' }}><HelpModeButton /></div>

      {/* Sage — on a phone this opens the Sage chat; on desktop the AI Expert panel. */}
      <button
        type="button"
        className="sag-tb-icon sag-tb-sage"
        aria-label="Ask Sage"
        title="Ask Sage"
        onClick={() => { if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) window.dispatchEvent(new Event('saguaro:open-chat')); else onOpenSage(); }}
      >
        <span className="sag-tb-dot">
          <Sparkle size={15} weight="fill" aria-hidden />
          <span className="sag-tb-sage-label">Sage</span>
        </span>
      </button>

      {/* Notifications */}
      <button
        type="button"
        onClick={() => router.push('/app/notifications')}
        className="sag-topbar-desktop sag-tb-icon"
        aria-label="Notifications"
        title="Notifications"
      >
        <Bell size={18} />
      </button>

      {/* Account */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <button
          type="button"
          className="sag-tb-icon sag-tb-avatar"
          onClick={() => setShowUserMenu((v) => !v)}
          aria-label="Account"
          aria-haspopup="menu"
          aria-expanded={showUserMenu}
        >
          <span className="sag-tb-dot">{userInitials}</span>
        </button>

        {showUserMenu && (
          <>
            <div onClick={() => setShowUserMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: z.dropdown - 1 }} />
            <div
              role="menu"
              style={{
                position: 'absolute',
                top: 46,
                right: 0,
                background: 'var(--c-raised)',
                border: '1px solid var(--sg-border-strong)',
                borderRadius: radius['2xl'],
                minWidth: 200,
                boxShadow: 'var(--shadow-lg)',
                zIndex: z.dropdown,
                overflow: 'hidden',
                padding: 6,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px 10px' }}>
                <UserCircle size={28} weight="fill" style={{ color: 'var(--sg-text-3)', flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '12px', fontWeight: font.weight.bold, color: 'var(--sg-text-3)', lineHeight: 1.4 }}>Signed In As</div>
                  <div style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: 'var(--sg-text)', lineHeight: 1.3 }}>{userInitials}</div>
                </div>
              </div>
              <div style={{ height: 1, background: 'var(--sg-border)', margin: '2px 0 6px' }} />
              <Link
                href="/app/settings"
                role="menuitem"
                onClick={() => setShowUserMenu(false)}
                className="sag-tb-menuitem"
                style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, padding: '0 10px', borderRadius: radius.lg, color: 'var(--sg-text)', fontSize: font.size.md, fontWeight: font.weight.medium, textDecoration: 'none' }}
              >
                <GearSix size={16} style={{ color: 'var(--sg-text-2)' }} /> Settings
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={() => { setShowUserMenu(false); onLogout(); }}
                className="sag-tb-menuitem"
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 44, padding: '0 10px', marginTop: 2, borderRadius: radius.lg, background: 'none', border: 'none', color: 'var(--status-overdue)', fontSize: font.size.md, fontWeight: font.weight.medium, cursor: 'pointer', textAlign: 'left' }}
              >
                <SignOut size={16} /> Sign Out
              </button>
            </div>
          </>
        )}
      </div>

      {/* At exactly 768px there is no sidebar and no tab bar — the menu button is the way in. */}
      <style dangerouslySetInnerHTML={{ __html: TOPBAR_CSS }} />
    </header>
  );
}

const TOPBAR_CSS = `
@media (min-width: 768px) and (max-width: 768px) {
  .sag-topbar .mobile-hamburger-topbar { display: inline-grid !important; }
}
.sag-tb-menuitem:hover { background: rgba(255,255,255,0.05); }
`;
