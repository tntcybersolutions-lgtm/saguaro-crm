'use client';
/**
 * AppTopBar — the flat top bar (owner approved 2026-10-10).
 *
 * One solid row with a hairline under it:
 *
 *   phone    [‹ Parent]  Page title ……………………  (✦)  (CD)
 *   desktop  [‹ Parent]  Job picker | Page title …  Search  Help  (✦ Sage)  🔔  (CD)
 *
 * Back (Chad, 2026-10-11: "a back button easy for users to go back to prior
 * screen") is a lit pill that names where it goes and takes you to the screen
 * you were actually on before (lib/navHistory). On the first screen of a tab
 * — a link opened fresh, a reload — it goes up to the parent screen instead,
 * and on a tab's own page with nothing before it there is no Back. It goes
 * through the unsaved-changes gate like every other way out. The title takes
 * the rest of the row. Sage and the account are 32px round buttons with a
 * 44px hit area.
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
}: {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onOpenSage: () => void;
  onOpenCommandPalette: () => void;
  onLogout: () => void;
  userInitials: string;
  /** The company on the signed-in profile — Home's title, as in the approved mock. */
  companyName?: string | null;
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

  /* ── Back: the screen you were on, else the parent screen ───────────── */
  const [prevPath, setPrevPath] = useState<string | null>(null);
  useEffect(() => { setPrevPath(recordVisit(pathname)); }, [pathname]);
  const jobName = (id: string) =>
    projectNames[id] ||
    (crumbProjects as Array<{ id?: string; name?: string }>).find((x) => x?.id === id)?.name ||
    'Job';
  const screenName = (path: string): string => {
    if (path === '/app' || path === '/app/') return 'Home';
    const job = path.match(/^\/app\/projects\/([^/]+)(?:\/overview)?\/?$/);
    if (job && UUID_RE.test(job[1])) return jobName(job[1]);
    return resolveTopBar(path, { projectNames, companyName: null }).title || 'Back';
  };
  const backTo = prevPath
    ? { label: screenName(prevPath), go: () => router.back() }
    : back
      ? { label: back.label, go: () => router.push(back.href) }
      : null;
  /* The pill never shrinks, so it is never cut to "‹ F": a long name shows as
     its short form ("Maple Ridge — Phase 2" → "Maple Ridge") or as "Back".
     The full name stays in the tooltip and the accessible name. On a phone it
     is the arrow alone (globals.css). */
  const backShort = (() => {
    if (!backTo) return '';
    const s = backTo.label.split(/\s+[—–-]\s+/)[0].trim();
    return s.length > 0 && s.length <= 22 ? s : 'Back';
  })();

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

      {backTo && (
        <button
          type="button"
          className="sag-tb-back"
          onClick={backTo.go}
          aria-label={`Back to ${backTo.label}`}
          title={`Back to ${backTo.label}`}
        >
          <CaretLeft size={18} weight="bold" aria-hidden />
          <span className="sag-tb-back-label">{backShort}</span>
        </button>
      )}

      {/* The job you are in — same place on every desktop screen, and switching
          keeps you on the screen you are looking at. */}
      <div className="sag-topbar-desktop" style={{ display: 'contents' }}>
        <HeaderProjectPicker />
        <span aria-hidden style={{ width: 1, height: 18, background: 'var(--sg-border)', margin: '0 4px', flexShrink: 0 }} />
      </div>

      {/* The page you are on. Takes the rest of the row. */}
      <span className="sag-tb-title sag-crumb-last">{title}</span>

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
            fontSize: font.size.xs,
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
