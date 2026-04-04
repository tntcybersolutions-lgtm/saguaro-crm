'use client';
/**
 * AppTopBar — Slim header with breadcrumbs, search, notifications, user menu.
 * Sits to the right of the sidebar.
 */
import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  MagnifyingGlass,
  Bell,
  Star,
  CaretRight,
  SignOut,
  UserCircle,
  GearSix,
  List,
} from '@phosphor-icons/react';
import { colors, font, radius, shadow, sidebar as sidebarTokens, z } from '../lib/design-tokens';

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
  const [showUserMenu, setShowUserMenu] = useState(false);
  const sidebarWidth = sidebarCollapsed ? sidebarTokens.widthCollapsed : sidebarTokens.width;

  /* ── Breadcrumbs ─────────────────────────────────────────────────── */
  const segments = pathname.split('/').filter(Boolean);
  const crumbs = segments.map((seg, i) => ({
    label: LABELS[seg] || (seg.length > 20 ? seg.slice(0, 12) + '...' : seg.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())),
    href: '/' + segments.slice(0, i + 1).join('/'),
    isLast: i === segments.length - 1,
  }));

  return (
    <header
      style={{
        position: 'fixed',
        top: 0,
        left: sidebarWidth,
        right: 0,
        height: sidebarTokens.headerHeight,
        background: 'rgba(255,255,255,.97)',
        borderBottom: `1px solid ${colors.border}`,
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        gap: 12,
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
          background: 'none',
          border: 'none',
          color: colors.textMuted,
          cursor: 'pointer',
          padding: 4,
        }}
      >
        <List size={22} />
      </button>

      {/* Breadcrumbs */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {crumbs.map((c, i) => (
          <React.Fragment key={c.href}>
            {i > 0 && <CaretRight size={10} style={{ color: colors.textFaint }} />}
            {c.isLast ? (
              <span style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.text }}>{c.label}</span>
            ) : (
              <Link href={c.href} style={{ fontSize: font.size.md, color: colors.textMuted, textDecoration: 'none', transition: 'color .15s' }}>
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
          padding: '6px 12px',
          background: colors.raised,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.md,
          color: colors.textDim,
          fontSize: font.size.sm,
          fontWeight: font.weight.semibold,
          cursor: 'pointer',
          transition: 'border-color .15s',
          minWidth: 180,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = colors.textDim)}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = colors.border)}
      >
        <MagnifyingGlass size={14} />
        <span>Search...</span>
        <span style={{ marginLeft: 'auto', fontSize: font.size.xs, opacity: 0.5, fontFamily: font.mono }}>⌘K</span>
      </button>

      {/* Sage AI */}
      <button
        onClick={onOpenSage}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 14px',
          background: colors.goldDim,
          border: `1px solid ${colors.goldBorder}`,
          borderRadius: radius.lg,
          color: colors.gold,
          fontSize: font.size.md,
          fontWeight: font.weight.bold,
          cursor: 'pointer',
          transition: 'background .15s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = colors.goldHover)}
        onMouseLeave={(e) => (e.currentTarget.style.background = colors.goldDim)}
      >
        <Star size={14} weight="fill" />
        Sage
      </button>

      {/* Notifications */}
      <button
        onClick={() => window.dispatchEvent(new Event('toggle-notifications'))}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 36,
          height: 36,
          background: 'none',
          border: 'none',
          color: colors.textMuted,
          cursor: 'pointer',
          borderRadius: radius.md,
          transition: 'color .15s, background .15s',
          position: 'relative',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = colors.text;
          e.currentTarget.style.background = colors.raised;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = colors.textMuted;
          e.currentTarget.style.background = 'none';
        }}
      >
        <Bell size={18} />
      </button>

      {/* User avatar + menu */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setShowUserMenu((v) => !v)}
          style={{
            width: 34,
            height: 34,
            borderRadius: radius.full,
            background: `linear-gradient(135deg,${colors.gold},#B85C2A)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: font.size.md,
            fontWeight: font.weight.black,
            color: colors.dark,
            cursor: 'pointer',
            border: 'none',
            transition: 'box-shadow .15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.boxShadow = shadow.glow)}
          onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'none')}
        >
          {userInitials}
        </button>

        {showUserMenu && (
          <>
            <div onClick={() => setShowUserMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: z.dropdown - 1 }} />
            <div
              style={{
                position: 'absolute',
                top: 42,
                right: 0,
                background: colors.white,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.xl,
                minWidth: 180,
                boxShadow: shadow.lg,
                zIndex: z.dropdown,
                overflow: 'hidden',
                padding: '4px 0',
              }}
            >
              <Link
                href="/app/settings"
                onClick={() => setShowUserMenu(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 16px',
                  color: colors.text,
                  fontSize: font.size.md,
                  fontWeight: font.weight.medium,
                  textDecoration: 'none',
                  transition: 'background .1s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,.04)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <GearSix size={16} /> Settings
              </Link>
              <div style={{ height: 1, background: colors.border, margin: '4px 0' }} />
              <button
                onClick={() => { setShowUserMenu(false); onLogout(); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  padding: '10px 16px',
                  background: 'none',
                  border: 'none',
                  color: colors.red,
                  fontSize: font.size.md,
                  fontWeight: font.weight.medium,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background .1s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239,68,68,.06)')}
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
