'use client';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { safeJsonParse } from '@/lib/safe-json';
import { useGuardedRouter } from '@/lib/navGuard';

const GOLD   = 'var(--brand-primary)';
const DARK   = 'var(--bg-base)';
const RAISED = 'var(--bg-surface)';
const BORDER = 'var(--border-default)';
const DIM    = 'var(--text-secondary)';
const TEXT   = 'var(--text-primary)';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PaletteItem {
  id: string;
  section: 'recent' | 'records' | 'actions' | 'navigation';
  icon: string;
  label: string;
  description: string;
  shortcut?: string;
  href?: string;
  action?: () => void;
}

// ─── Navigation Items ─────────────────────────────────────────────────────────

const NAV_ITEMS: Omit<PaletteItem, 'section'>[] = [
  { id: 'nav-dashboard',  icon: '🏠', label: 'Dashboard',     description: 'Go to your dashboard',           href: '/app' },
  { id: 'nav-projects',   icon: '🏗️', label: 'Projects',      description: 'All construction projects',       href: '/app/projects' },
  { id: 'nav-documents',  icon: '📁', label: 'Documents',      description: 'AI-generated documents',          href: '/app/documents' },
  { id: 'nav-bids',       icon: '📝', label: 'Bids',           description: 'Bid management & scoring',        href: '/app/bids' },
  { id: 'nav-reports',    icon: '📊', label: 'Reports',         description: 'Financial and project reports',   href: '/app/reports' },
  { id: 'nav-autopilot',  icon: '🤖', label: 'Autopilot',      description: 'Automated CRM alerts & actions',  href: '/app/autopilot' },
  { id: 'nav-intel',      icon: '🧠', label: 'Intelligence',   description: 'Market intelligence, analytics & suggestions', href: '/app/intelligence' },
  { id: 'nav-my-work',    icon: '✅', label: 'My Work',        description: 'Everything assigned to you, in one queue', href: '/app/my-work' },
  { id: 'nav-radio',      icon: '📻', label: 'Radio',          description: 'Push-to-talk field radio',        href: '/app/radio' },
  { id: 'nav-catalog',    icon: '🏷️', label: 'Catalog',        description: 'Materials catalog & best prices', href: '/app/catalog' },
  { id: 'nav-daily-logs', icon: '📋', label: 'Daily Logs',     description: 'Field reports across all projects', href: '/app/daily-logs' },
  { id: 'nav-command',    icon: '🎛️', label: 'Command Center', description: 'Portfolio pulse across every project', href: '/app/command-center' },
  { id: 'nav-schedule',   icon: '📅', label: 'Schedule',       description: 'Cross-project schedule',          href: '/app/schedule' },
  { id: 'nav-invoicing',  icon: '🧾', label: 'Invoicing',      description: 'Invoices & payments',             href: '/app/invoicing' },
];

// ─── Quick Actions ────────────────────────────────────────────────────────────

const ACTION_ITEMS: Omit<PaletteItem, 'section'>[] = [
  { id: 'act-new-project',  icon: '🏗️', label: 'New Project',     description: 'Create a new construction project',    shortcut: 'N', href: '/app/projects/new' },
  { id: 'act-new-pay-app',  icon: '💰', label: 'New Pay App',      description: 'Select a project to create a pay app',   shortcut: 'P', href: '/app/projects' },
  { id: 'act-new-rfi',      icon: '❓', label: 'New RFI',          description: 'Select a project to submit an RFI',    shortcut: 'R', href: '/app/projects' },
  { id: 'act-create-bid',   icon: '📦', label: 'Create Bid Package', description: 'Select a project to start a bid package', shortcut: 'B', href: '/app/projects' },
  { id: 'act-gen-doc',      icon: '📄', label: 'Generate Document', description: 'AI-powered document generation',      shortcut: 'D', href: '/app/documents' },
  { id: 'act-invite-sub',   icon: '🤝', label: 'Invite Subcontractor', description: 'Send a sub portal invite',         shortcut: 'I', href: '/app/sub-portal?tab=invite' },
  { id: 'act-new-log',      icon: '📋', label: 'New Daily Log',   description: "Open today's field log composer",      shortcut: 'L', href: '/app/daily-logs?new=1' },
  { id: 'act-new-punch',    icon: '🔨', label: 'New Punch Item',  description: 'Select a project to add a punch item', href: '/app/projects' },
];

const RECENT_PAGES_KEY = 'cmd_palette_recent';
const MAX_RECENT = 5;

interface Props {
  onScoreBid?: () => void;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CommandPalette({ onScoreBid }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(0);
  const [recentPages, setRecentPages] = useState<PaletteItem[]>([]);
  // Records — the palette used to list only navigation and quick actions, so
  // typing a company or job name found nothing. Projects and leads load once
  // per open (two small list calls) and match the same fuzzy filter.
  const [records, setRecords] = useState<PaletteItem[]>([]);
  useEffect(() => {
    if (!open || records.length) return;
    let alive = true;
    (async () => {
      const out: PaletteItem[] = [];
      try {
        const r = await fetch('/api/projects?limit=200&fields=id,name,project_number', { credentials: 'include' });
        const j = await r.json().catch(() => ({}));
        const rows: Array<{ id: string; name?: string; project_number?: string }> = j?.projects || [];
        for (const p of rows) if (p?.id && p.name) out.push({ id: `proj-${p.id}`, section: 'records', icon: '\u{1F3D7}️', label: p.name, description: p.project_number ? `Job ${p.project_number}` : 'Job', href: `/app/projects/${p.id}/overview` });
      } catch { /* list unavailable — the palette still works without records */ }
      try {
        const r = await fetch('/api/leads', { credentials: 'include' });
        const j = await r.json().catch(() => ({}));
        const rows: Array<{ id: string; company_name?: string; company?: string; contact_name?: string; stage?: string }> = j?.leads || [];
        for (const l of rows) { const name = l?.company_name || l?.company; if (l?.id && name) out.push({ id: `lead-${l.id}`, section: 'records', icon: '\u{1F4C8}', label: name, description: ['Lead', l.contact_name, l.stage].filter(Boolean).join(' · '), href: `/app/leads/${l.id}` }); }
      } catch { /* same */ }
      if (alive) setRecords(out);
    })();
    return () => { alive = false; };
  }, [open, records.length]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useGuardedRouter();

  // Load recent pages from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_PAGES_KEY);
      if (stored) setRecentPages(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  // Build full item list with injected handlers
  const allItems: PaletteItem[] = [
    ...recentPages.map(p => ({ ...p, section: 'recent' as const })),
    ...(query.trim() ? records : []),
    ...ACTION_ITEMS.map(a => ({
      ...a,
      section: 'actions' as const,
      action: a.id === 'act-score-bid' && onScoreBid
        ? () => { setOpen(false); onScoreBid(); }
        : a.action,
    })),
    ...NAV_ITEMS.map(n => ({ ...n, section: 'navigation' as const })),
  ];

  // Fuzzy filter
  function fuzzyMatch(text: string, q: string): boolean {
    const tl = text.toLowerCase();
    const ql = q.toLowerCase();
    let ti = 0;
    for (let i = 0; i < ql.length; i++) {
      ti = tl.indexOf(ql[i], ti);
      if (ti === -1) return false;
      ti++;
    }
    return true;
  }

  const filtered = query.trim()
    ? allItems.filter(a => fuzzyMatch(a.label + ' ' + a.description, query))
    : allItems;

  // Clamp focus
  useEffect(() => {
    setFocused(prev => Math.min(prev, Math.max(filtered.length - 1, 0)));
  }, [filtered.length]);

  // Global keyboard shortcuts: Cmd+K (palette), Cmd+N (new project), Cmd+Shift+P (project switch), Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      // Cmd+K — toggle command palette
      if (mod && e.key === 'k') { e.preventDefault(); setOpen(o => !o); return; }
      // Cmd+N — new project
      if (mod && e.key === 'n' && !e.shiftKey) { e.preventDefault(); router.push('/app/projects/new'); return; }
      // Cmd+Shift+P — project switcher (opens palette with "project" pre-filled)
      if (mod && e.shiftKey && e.key === 'P') { e.preventDefault(); setQuery('project'); setOpen(true); return; }
      // Escape — close any open modal/panel/drawer
      if (e.key === 'Escape' && !open) {
        // Dispatch a global close event for modals/drawers to listen to
        window.dispatchEvent(new CustomEvent('saguaro:close-all'));
        return;
      }
    }
    function onCustomOpen() { setOpen(true); }
    window.addEventListener('keydown', onKey);
    window.addEventListener('open-command-palette', onCustomOpen);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('open-command-palette', onCustomOpen); };
  }, [open, router]);

  // Auto-focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setFocused(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // Scroll focused item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${focused}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [focused]);

  const saveToRecent = useCallback((item: PaletteItem) => {
    if (!item.href) return;
    const entry: PaletteItem = { ...item, section: 'recent', id: 'recent-' + item.id };
    try {
      const prev: PaletteItem[] = safeJsonParse<PaletteItem[]>(localStorage.getItem(RECENT_PAGES_KEY), []);
      const deduped = prev.filter(p => p.href !== item.href);
      const next = [entry, ...deduped].slice(0, MAX_RECENT);
      localStorage.setItem(RECENT_PAGES_KEY, JSON.stringify(next));
      setRecentPages(next);
    } catch { /* ignore */ }
  }, []);

  const select = useCallback((item: PaletteItem) => {
    setOpen(false);
    saveToRecent(item);
    if (item.action) {
      item.action();
    } else if (item.href) {
      router.push(item.href);
    }
  }, [router, saveToRecent]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocused(f => Math.min(f + 1, filtered.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setFocused(f => Math.max(f - 1, 0)); }
    if (e.key === 'Enter')     { if (filtered[focused]) select(filtered[focused]); }
  }

  if (!open) return null;

  // Group filtered items by section for display
  const sections: { key: PaletteItem['section']; label: string; items: { item: PaletteItem; idx: number }[] }[] = [];
  let globalIdx = 0;
  for (const sectionKey of ['recent', 'records', 'actions', 'navigation'] as const) {
    const sectionLabel = sectionKey === 'recent' ? 'Recent Pages' : sectionKey === 'records' ? 'Jobs & Leads' : sectionKey === 'actions' ? 'Quick Actions' : 'Navigation';
    const items = filtered
      .map((item, i) => ({ item, idx: i }))
      .filter(({ item }) => item.section === sectionKey);
    if (items.length > 0) {
      sections.push({ key: sectionKey, label: sectionLabel, items });
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,.72)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh' }}
      onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div
        style={{ width: '100%', maxWidth: 620, background: 'linear-gradient(180deg, var(--c-raised) 0%, var(--c-card) 100%)', border: `1px solid ${BORDER}`, borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg), 0 32px 80px rgba(0,0,0,.55)', overflow: 'hidden', margin: '0 16px' }}
        onKeyDown={onKeyDown}>

        {/* Search Input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: `1px solid ${BORDER}` }}>
          <span style={{ fontSize: 18, flexShrink: 0, opacity: 0.6 }}>🔍</span>
          <input
            data-no-guard=""
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setFocused(0); }}
            placeholder="Search actions, navigate, create…"
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: TEXT, fontSize: 15, fontWeight: 500 }}
          />
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <kbd style={{ fontSize: 10, padding: '2px 6px', background: 'rgba(255,255,255,0.08)', border: `1px solid ${BORDER}`, borderRadius: 4, color: DIM }}>⌘K</kbd>
            <span style={{ fontSize: 11, color: DIM }}>to toggle</span>
          </div>
        </div>

        {/* Results */}
        <div ref={listRef} style={{ maxHeight: 420, overflowY: 'auto' }}>
          {filtered.length === 0 && (
            <div style={{ padding: '24px 18px', color: DIM, fontSize: 13, textAlign: 'center' }}>
              No results for "{query}"
            </div>
          )}

          {query.trim() === '' ? (
            // Grouped sections when no query
            sections.map(section => (
              <div key={section.key}>
                <div style={{ padding: '8px 18px 4px', fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)' }}>{section.label}</div>
                {section.items.map(({ item, idx }) => (
                  <ItemRow key={item.id} item={item} idx={idx} isFocused={idx === focused} onMouseEnter={() => setFocused(idx)} onClick={() => select(item)} />
                ))}
              </div>
            ))
          ) : (
            // Flat list when searching
            filtered.map((item, idx) => (
              <ItemRow key={item.id} item={item} idx={idx} isFocused={idx === focused} onMouseEnter={() => setFocused(idx)} onClick={() => select(item)} />
            ))
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '8px 18px', borderTop: `1px solid ${BORDER}`, display: 'flex', gap: 16, fontSize: 11, color: DIM, alignItems: 'center' }}>
          <span><kbd style={{ fontSize: 9, padding: '1px 5px', background: 'rgba(255,255,255,0.08)', border: `1px solid ${BORDER}`, borderRadius: 3 }}>↑↓</kbd> navigate</span>
          <span><kbd style={{ fontSize: 9, padding: '1px 5px', background: 'rgba(255,255,255,0.08)', border: `1px solid ${BORDER}`, borderRadius: 3 }}>↵</kbd> select</span>
          <span><kbd style={{ fontSize: 9, padding: '1px 5px', background: 'rgba(255,255,255,0.08)', border: `1px solid ${BORDER}`, borderRadius: 3 }}>Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}

// ─── Item Row ─────────────────────────────────────────────────────────────────

function ItemRow({
  item, idx, isFocused, onMouseEnter, onClick,
}: {
  item: PaletteItem; idx: number; isFocused: boolean;
  onMouseEnter: () => void; onClick: () => void;
}) {
  return (
    <div
      data-idx={idx}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '11px 18px',
        cursor: 'pointer',
        borderLeft: isFocused ? `3px solid ${GOLD}` : '3px solid transparent',
        background: isFocused ? 'rgba(255,255,255,0.06)' : 'transparent',
        transition: 'background .1s, border-left-color .1s',
      }}>
      <span style={{ fontSize: 19, flexShrink: 0 }}>{item.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: TEXT, marginBottom: 1 }}>{item.label}</div>
        <div style={{ fontSize: 11, color: DIM, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.description}</div>
      </div>
      {item.shortcut && (
        <kbd style={{
          flexShrink: 0, fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 5,
          background: isFocused ? 'var(--brand-primary-18)' : 'rgba(255,255,255,0.08)',
          border: `1px solid ${isFocused ? 'var(--brand-primary-35)' : 'var(--border-default)'}`,
          color: isFocused ? GOLD : DIM, letterSpacing: 0.5,
        }}>
          {item.shortcut}
        </kbd>
      )}
      {item.section === 'recent' && (
        <span style={{ fontSize: 10, color: DIM, flexShrink: 0 }}>Recent</span>
      )}
    </div>
  );
}
