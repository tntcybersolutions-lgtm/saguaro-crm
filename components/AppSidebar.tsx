'use client';
/**
 * AppSidebar — Procore-style persistent left sidebar.
 * Collapsible, grouped navigation with icons, badges, and active states.
 */
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  FolderSimple,
  GridFour,
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
  HardHat,
  Users,
} from '@phosphor-icons/react';
import { colors, font, radius, shadow, sidebar as sidebarTokens, z } from '../lib/design-tokens';

/* ── Types ──────────────────────────────────────────────────────────── */
interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: number;
}
interface NavSection {
  title: string;
  items: NavItem[];
}

/* ── Navigation Config ─────────────────────────────────────────────── */
const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard',    href: '/app',              icon: GridFour },
      { label: 'Projects',     href: '/app/projects',     icon: FolderSimple },
    ],
  },
  {
    title: 'Pre-Construction',
    items: [
      { label: 'Bids & Estimates', href: '/app/bids',         icon: CurrencyDollar },
      { label: 'AI Takeoff',       href: '/app/takeoff',      icon: Blueprint },
      { label: 'Intelligence',     href: '/app/intelligence', icon: Brain },
    ],
  },
  {
    title: 'Execution',
    items: [
      { label: 'Documents',   href: '/app/documents',  icon: FileText },
      { label: 'Daily Logs',  href: '/app/daily-logs', icon: ClipboardText },
      { label: 'Schedule',    href: '/app/schedule',   icon: CalendarBlank },
      { label: 'Field App',   href: '/field',          icon: DeviceMobile },
    ],
  },
  {
    title: 'Financial',
    items: [
      { label: 'Invoicing',   href: '/app/invoicing',  icon: CreditCard },
      { label: 'Billing',     href: '/app/billing',    icon: CurrencyDollar },
      { label: 'Reports',     href: '/app/reports',    icon: ChartBar },
    ],
  },
  {
    title: 'Tools',
    items: [
      { label: 'Autopilot',   href: '/app/autopilot',   icon: Star },
      { label: 'Compliance',  href: '/app/compliance',  icon: ShieldCheck },
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
  const width = collapsed ? sidebarTokens.widthCollapsed : sidebarTokens.width;

  function isActive(href: string) {
    if (href === '/app') return pathname === '/app';
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
        background: colors.sidebarBg,
        borderRight: `1px solid ${colors.sidebarBorder}`,
        display: 'flex',
        flexDirection: 'column',
        zIndex: z.sidebar,
        transition: 'width .2s ease',
        overflow: 'hidden',
      }}
    >
      {/* ── Logo + Brand ───────────────────────────────────────────── */}
      <div
        style={{
          height: sidebarTokens.headerHeight,
          display: 'flex',
          alignItems: 'center',
          padding: collapsed ? '0 16px' : '0 16px',
          gap: 10,
          borderBottom: `1px solid ${colors.sidebarBorder}`,
          flexShrink: 0,
        }}
      >
        <Link href="/app" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', overflow: 'hidden' }}>
          <img
            src="/logo-full.jpg"
            alt="Saguaro"
            style={{
              height: 32,
              width: 32,
              objectFit: 'contain',
              borderRadius: radius.sm,
              flexShrink: 0,
            }}
          />
          {!collapsed && (
            <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15, whiteSpace: 'nowrap' }}>
              <span style={{
                fontWeight: font.weight.black,
                fontSize: font.size.lg,
                letterSpacing: 1.2,
                background: `linear-gradient(90deg,${colors.gold},${colors.goldLight})`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>
                SAGUARO
              </span>
              <span style={{ fontSize: font.size.xs, color: colors.sidebarDim, fontWeight: font.weight.semibold, letterSpacing: 0.5 }}>
                Control Systems
              </span>
            </span>
          )}
        </Link>
      </div>

      {/* ── Navigation Sections ─────────────────────────────────────── */}
      <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '8px 0' }}>
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} style={{ marginBottom: 4 }}>
            {/* Section Title */}
            {!collapsed && (
              <div
                style={{
                  padding: '12px 16px 4px',
                  fontSize: font.size.xs,
                  fontWeight: font.weight.bold,
                  color: colors.sidebarDim,
                  textTransform: 'uppercase',
                  letterSpacing: 1.2,
                  userSelect: 'none',
                }}
              >
                {section.title}
              </div>
            )}
            {collapsed && <div style={{ height: 8 }} />}

            {/* Items */}
            {section.items.map((item) => {
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
                    gap: 10,
                    height: sidebarTokens.itemHeight,
                    padding: collapsed ? '0 20px' : '0 12px 0 16px',
                    margin: collapsed ? '1px 8px' : '1px 8px',
                    borderRadius: radius.md,
                    fontSize: font.size.md,
                    fontWeight: active ? font.weight.bold : font.weight.medium,
                    color: active ? colors.gold : colors.textMuted,
                    background: active ? colors.goldDim : 'transparent',
                    textDecoration: 'none',
                    transition: 'all .15s ease',
                    position: 'relative',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                  }}
                  onMouseEnter={(e) => {
                    if (!active) {
                      e.currentTarget.style.background = 'rgba(255,255,255,.06)';
                      e.currentTarget.style.color = colors.sidebarText;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active) {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = colors.textMuted;
                    }
                  }}
                >
                  {/* Active indicator bar */}
                  {active && (
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 6,
                        bottom: 6,
                        width: 3,
                        borderRadius: '0 2px 2px 0',
                        background: colors.gold,
                      }}
                    />
                  )}
                  <Icon
                    size={collapsed ? 20 : 18}
                    weight={active ? 'fill' : 'regular'}
                    style={{ flexShrink: 0, opacity: active ? 1 : 0.7 }}
                  />
                  {!collapsed && <span>{item.label}</span>}
                  {!collapsed && item.badge && (
                    <span
                      style={{
                        marginLeft: 'auto',
                        fontSize: font.size.xs,
                        fontWeight: font.weight.bold,
                        background: colors.gold,
                        color: colors.dark,
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
        ))}
      </nav>

      {/* ── Bottom Section (Settings + Collapse) ────────────────────── */}
      <div style={{ borderTop: `1px solid ${colors.sidebarBorder}`, padding: '8px 0', flexShrink: 0 }}>
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
                gap: 10,
                height: sidebarTokens.itemHeight,
                padding: collapsed ? '0 20px' : '0 12px 0 16px',
                margin: '1px 8px',
                borderRadius: radius.md,
                fontSize: font.size.md,
                fontWeight: active ? font.weight.bold : font.weight.medium,
                color: active ? colors.gold : colors.textMuted,
                background: active ? colors.goldDim : 'transparent',
                textDecoration: 'none',
                transition: 'all .15s ease',
                whiteSpace: 'nowrap',
              }}
            >
              <Icon size={collapsed ? 20 : 18} weight={active ? 'fill' : 'regular'} style={{ flexShrink: 0 }} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}

        {/* Collapse toggle */}
        <button
          onClick={onToggle}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: 10,
            width: '100%',
            height: sidebarTokens.itemHeight,
            padding: collapsed ? '0' : '0 12px 0 16px',
            margin: 0,
            background: 'none',
            border: 'none',
            color: colors.sidebarDim,
            fontSize: font.size.sm,
            fontWeight: font.weight.medium,
            cursor: 'pointer',
            transition: 'color .15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = colors.text)}
          onMouseLeave={(e) => (e.currentTarget.style.color = colors.sidebarDim)}
        >
          {collapsed ? <CaretRight size={16} /> : <><CaretLeft size={16} /><span>Collapse</span></>}
        </button>
      </div>
    </aside>
  );
}
