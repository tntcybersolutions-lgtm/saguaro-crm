'use client';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const GOLD   = '#D4A017';
const DARK   = '#0d1117';
const RAISED = '#1f2c3e';
const BORDER = '#263347';
const DIM    = '#8fa3c0';
const TEXT   = '#e8edf8';

interface PaletteAction {
  id: string;
  icon: string;
  label: string;
  description: string;
  shortcut?: string;
  href?: string;
  action?: () => void;
}

const BASE_ACTIONS: PaletteAction[] = [
  {
    id: 'new-project',
    icon: '🏗️',
    label: 'New Project',
    description: 'Create a new construction project',
    shortcut: 'N',
    href: '/app/projects/new',
  },
  {
    id: 'create-bid',
    icon: '📝',
    label: 'Create Bid Package',
    description: 'Start a new bid package wizard',
    shortcut: 'B',
    href: '/app/bids/new',
  },
  {
    id: 'generate-doc',
    icon: '📄',
    label: 'Generate Document',
    description: 'AI-powered document generation',
    shortcut: 'D',
    href: '/app/documents',
  },
  {
    id: 'view-pay-apps',
    icon: '💰',
    label: 'View Pay Apps',
    description: 'Review pending payment applications',
    shortcut: 'P',
    href: '/app/projects',
  },
  {
    id: 'score-bid',
    icon: '🎯',
    label: 'Score a Bid',
    description: 'AI bid scoring and recommendation',
    shortcut: 'S',
    // action injected at render time
  },
  {
    id: 'invite-sub',
    icon: '🤝',
    label: 'Invite Subcontractor',
    description: 'Send subcontractor portal invite',
    shortcut: 'I',
    href: '/app/subs/invite',
  },
  {
    id: 'autopilot',
    icon: '🤖',
    label: 'Autopilot Alerts',
    description: 'View automated CRM alerts',
    href: '/app/autopilot',
  },
  {
    id: 'reports',
    icon: '📊',
    label: 'Reports',
    description: 'Financial and project reports',
    href: '/app/reports',
  },
  {
    id: 'intelligence',
    icon: '🧠',
    label: 'Market Intelligence',
    description: 'Bid market and competitor analysis',
    href: '/app/intelligence',
  },
];

interface Props {
  onScoreBid?: () => void;
}

export default function CommandPalette({ onScoreBid }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Build actions with injected score-bid handler
  const actions: PaletteAction[] = BASE_ACTIONS.map(a =>
    a.id === 'score-bid' ? { ...a, action: () => { setOpen(false); onScoreBid?.(); } } : a
  );

  // Filter by query
  const filtered = query.trim()
    ? actions.filter(a =>
        a.label.toLowerCase().includes(query.toLowerCase()) ||
        a.description.toLowerCase().includes(query.toLowerCase())
      )
    : actions;

  // Clamp focused index whenever filter changes
  useEffect(() => {
    setFocused(prev => Math.min(prev, Math.max(filtered.length - 1, 0)));
  }, [filtered.length]);

  // Global ⌘K / Ctrl+K listener + custom 'open-command-palette' event
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      }
    }
    function onCustomOpen() {
      setOpen(true);
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('open-command-palette', onCustomOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('open-command-palette', onCustomOpen);
    };
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setFocused(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const select = useCallback((item: PaletteAction) => {
    setOpen(false);
    if (item.action) {
      item.action();
    } else if (item.href) {
      router.push(item.href);
    }
  }, [router]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocused(f => Math.min(f + 1, filtered.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setFocused(f => Math.max(f - 1, 0)); }
    if (e.key === 'Enter')     { if (filtered[focused]) select(filtered[focused]); }
  }

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,.68)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '12vh',
      }}
      onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}
    >
      <div
        style={{
          width: '100%', maxWidth: 600,
          background: RAISED,
          border: `1px solid ${BORDER}`,
          borderRadius: 14,
          boxShadow: '0 32px 80px rgba(0,0,0,.7)',
          overflow: 'hidden',
        }}
        onKeyDown={onKeyDown}
      >
        {/* Search input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: `1px solid ${BORDER}` }}>
          <span style={{ fontSize: 18, flexShrink: 0, opacity: .7 }}>🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setFocused(0); }}
            placeholder="Search projects, create bid, generate document..."
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: TEXT, fontSize: 15, fontWeight: 500,
            }}
          />
          <span style={{ fontSize: 11, color: DIM, flexShrink: 0 }}>ESC to close</span>
        </div>

        {/* Results */}
        <div style={{ maxHeight: 380, overflowY: 'auto' }}>
          {filtered.length === 0 && (
            <div style={{ padding: '20px 18px', color: DIM, fontSize: 13, textAlign: 'center' }}>
              No actions match "{query}"
            </div>
          )}

          {filtered.map((item, i) => {
            const isFocused = i === focused;
            return (
              <div
                key={item.id}
                onMouseEnter={() => setFocused(i)}
                onClick={() => select(item)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '12px 18px',
                  cursor: 'pointer',
                  borderLeft: isFocused ? `3px solid ${GOLD}` : '3px solid transparent',
                  background: isFocused ? 'rgba(212,160,23,.07)' : 'transparent',
                  borderBottom: `1px solid ${i < filtered.length - 1 ? BORDER : 'transparent'}`,
                  transition: 'background .1s, border-left-color .1s',
                }}
              >
                <span style={{ fontSize: 20, flexShrink: 0 }}>{item.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: isFocused ? TEXT : TEXT, marginBottom: 2 }}>{item.label}</div>
                  <div style={{ fontSize: 12, color: DIM, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.description}</div>
                </div>
                {item.shortcut && (
                  <div style={{
                    flexShrink: 0, fontSize: 10, fontWeight: 700,
                    padding: '3px 7px', borderRadius: 5,
                    background: isFocused ? `rgba(212,160,23,.2)` : 'rgba(255,255,255,.05)',
                    border: `1px solid ${isFocused ? 'rgba(212,160,23,.4)' : BORDER}`,
                    color: isFocused ? GOLD : DIM,
                    letterSpacing: .5,
                  }}>
                    {item.shortcut}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ padding: '8px 18px', borderTop: `1px solid ${BORDER}`, display: 'flex', gap: 16, fontSize: 11, color: DIM }}>
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>ESC close</span>
          <span style={{ marginLeft: 'auto' }}>⌘K to toggle</span>
        </div>
      </div>
    </div>
  );
}
