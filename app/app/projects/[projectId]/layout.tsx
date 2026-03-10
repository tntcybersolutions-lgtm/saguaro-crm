'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import { DEMO_PROJECT } from '../../../../demo-data';

const GOLD = '#D4A017'; const DARK = '#0d1117'; const RAISED = '#1f2c3e';
const BORDER = '#263347'; const DIM = '#8fa3c0'; const TEXT = '#e8edf8';

// ALL sidebar nav items — every module Buildertrend has + more
const NAV_SECTIONS = [
  {
    label: 'PROJECT',
    items: [
      { label: 'Overview',        href: '',                   icon: '◈', badge: null },
      { label: 'Takeoff',         href: '/takeoff',           icon: '📐', badge: null },
      { label: 'Estimate',        href: '/estimate',          icon: '🧮', badge: null },
      { label: 'Proposal',        href: '/proposal',          icon: '📑', badge: null },
    ],
  },
  {
    label: 'EXECUTION',
    items: [
      { label: 'Schedule',              href: '/schedule',          icon: '📅', badge: null },
      { label: 'Bid Packages',          href: '/bid-packages',      icon: '📬', badge: null },
      { label: 'Selections & Allowances', href: '/selections',      icon: '🎨', badge: null },
      { label: 'Contracts',             href: '/contracts',         icon: '📋', badge: null },
      { label: 'PO & Subcontracts',     href: '/purchase-orders',   icon: '📝', badge: null },
    ],
  },
  {
    label: 'FINANCIAL',
    items: [
      { label: 'Budget',          href: '/budget',            icon: '💰', badge: null },
      { label: 'Change Orders',   href: '/change-orders',     icon: '🔄', badge: '2'  },
      { label: 'Pay Applications', href: '/pay-apps',         icon: '💵', badge: null },
      { label: 'Client Invoices', href: '/invoices',          icon: '🧾', badge: null },
      { label: 'Bills',           href: '/bills',             icon: '📄', badge: null },
      { label: 'Lien Waivers',    href: '/lien-waivers',      icon: '🔏', badge: null },
      { label: 'Insurance',       href: '/insurance',         icon: '🛡️',  badge: null },
      { label: 'Certified Payroll', href: '/payroll',         icon: '👷', badge: null },
      { label: 'W-9 Requests',    href: '/w9',                icon: '📝', badge: null },
    ],
  },
  {
    label: 'FIELD',
    items: [
      { label: 'Daily Logs',      href: '/daily-logs',        icon: '📋', badge: null },
      { label: 'Photos',          href: '/photos',            icon: '📷', badge: null },
      { label: 'Inspections',     href: '/inspections',       icon: '🔍', badge: null },
      { label: 'Safety',          href: '/safety',            icon: '🦺', badge: null },
      { label: 'Punch List',      href: '/punch-list',        icon: '✅', badge: null },
      { label: 'To-Dos',          href: '/todos',             icon: '☑️',  badge: null },
      { label: 'Timesheets',      href: '/timesheets',        icon: '⏱️',  badge: null },
    ],
  },
  {
    label: 'COMMUNICATION',
    items: [
      { label: 'RFIs',            href: '/rfis',              icon: '❓', badge: '2'  },
      { label: 'Submittals',      href: '/submittals',        icon: '📤', badge: null },
      { label: 'Messages',        href: '/messages',          icon: '💬', badge: null },
    ],
  },
  {
    label: 'DOCUMENTS',
    items: [
      { label: 'Files',           href: '/files',             icon: '📁', badge: null },
      { label: 'Drawings',        href: '/drawings',          icon: '📐', badge: null },
      { label: 'Permits',         href: '/permits',           icon: '🏛️',  badge: null },
      { label: 'Specifications',  href: '/specs',             icon: '📖', badge: null },
      { label: 'Closeout',        href: '/closeout',          icon: '✅', badge: null },
    ],
  },
  {
    label: 'TEAM',
    items: [
      { label: 'Team',            href: '/team',              icon: '👥', badge: null },
      { label: 'Compliance',      href: '/compliance',        icon: '🛡️',  badge: null },
    ],
  },
  {
    label: 'AI',
    items: [
      { label: 'Autopilot Alerts', href: '/autopilot',       icon: '🤖', badge: '3'  },
      { label: 'Bid Intelligence', href: '/intelligence',    icon: '🧠', badge: null },
    ],
  },
];

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const params = useParams();
  const projectId = params['projectId'] as string;
  const base = `/app/projects/${projectId}`;
  const [collapsed, setCollapsed] = useState(false);

  const isActive = (href: string) => {
    const full = base + href;
    if (href === '') return pathname === base;
    return pathname.startsWith(full);
  };

  const pctComplete = 14.8;

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 56px)' }}>

      {/* ── Mobile sidebar hide ──────────────────────────────────────── */}
      <style>{`
        @media (max-width: 768px) {
          .sidebar-desktop { display: none !important; }
        }
      `}</style>

      {/* ── Project Sidebar ──────────────────────────────────────────── */}
      <aside className="sidebar-desktop" style={{
        width: collapsed ? 56 : 220,
        flexShrink: 0,
        background: '#0a1117',
        borderRight: `1px solid ${BORDER}`,
        position: 'sticky',
        top: 56,
        height: 'calc(100vh - 56px)',
        overflowY: 'auto',
        overflowX: 'hidden',
        transition: 'width .2s',
        scrollbarWidth: 'thin',
      }}>

        {/* Project header */}
        <div style={{ padding: '14px 12px', borderBottom: `1px solid ${BORDER}` }}>
          {!collapsed && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT, marginBottom: 2, lineHeight: 1.3 }}>{DEMO_PROJECT.name}</div>
              <div style={{ fontSize: 10, color: DIM, marginBottom: 8 }}>{DEMO_PROJECT.project_number}</div>
              {/* Progress */}
              <div style={{ height: 3, background: 'rgba(255,255,255,.08)', borderRadius: 2, marginBottom: 3 }}>
                <div style={{ height: '100%', width: `${pctComplete}%`, background: `linear-gradient(90deg,${GOLD},#F0C040)`, borderRadius: 2 }} />
              </div>
              <div style={{ fontSize: 10, color: DIM }}>{pctComplete}% complete</div>
            </>
          )}
          <button onClick={() => setCollapsed(!collapsed)} style={{ marginTop: collapsed ? 0 : 8, background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 16, padding: 0, display: 'block' }}>
            {collapsed ? '→' : '←'}
          </button>
        </div>

        {/* Nav sections */}
        {NAV_SECTIONS.map(section => (
          <div key={section.label} style={{ padding: '8px 0' }}>
            {!collapsed && (
              <div style={{ padding: '4px 12px 2px', fontSize: 9, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase', color: '#4a5f7a' }}>
                {section.label}
              </div>
            )}
            {section.items.map(item => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={base + item.href}
                  title={collapsed ? item.label : undefined}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: collapsed ? '8px 16px' : '7px 12px',
                    color: active ? GOLD : DIM,
                    background: active ? 'rgba(212,160,23,.08)' : 'transparent',
                    borderLeft: `2px solid ${active ? GOLD : 'transparent'}`,
                    fontSize: 12.5,
                    fontWeight: active ? 700 : 500,
                    textDecoration: 'none',
                    transition: 'all .1s',
                    position: 'relative',
                  }}
                >
                  <span style={{ fontSize: 14, flexShrink: 0 }}>{item.icon}</span>
                  {!collapsed && <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>}
                  {!collapsed && item.badge && (
                    <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 8, background: active ? GOLD : '#B85C2A', color: '#0d1117' }}>
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}

        {/* Back to projects */}
        <div style={{ padding: '8px 12px', borderTop: `1px solid ${BORDER}`, marginTop: 8 }}>
          <Link href="/app/projects" style={{ display: 'flex', alignItems: 'center', gap: 8, color: DIM, fontSize: 12, textDecoration: 'none' }}>
            <span>←</span>{!collapsed && <span>All Projects</span>}
          </Link>
        </div>
      </aside>

      {/* ── Page Content ─────────────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0, background: '#0d1117' }}>
        {children}
      </div>
    </div>
  );
}
