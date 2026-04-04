'use client';
import React, { useState, useEffect } from 'react';

const GOLD = '#C8960F';
const DARK = '#F8F9FB';
const RAISED = '#ffffff';
const BORDER = '#E2E5EA';
const DIM = '#6B7280';
const TEXT = '#e8edf8';

const LIGHT_OVERRIDES_CSS = `
[data-theme="light"] {
  --bg: #f5f6f8;
  --surface: #ffffff;
  --border: #e2e5ea;
  --text: #1a1d23;
  --dim: #6b7280;
}
`;

const SunIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);

const MoonIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

function resolveInitialTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark';
  const stored = localStorage.getItem('theme');
  if (stored === 'light' || stored === 'dark') return stored;
  if (window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
  return 'dark';
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [mounted, setMounted] = useState(false);

  // Inject light-theme override styles once
  useEffect(() => {
    if (document.getElementById('saguaro-theme-overrides')) return;
    const style = document.createElement('style');
    style.id = 'saguaro-theme-overrides';
    style.textContent = LIGHT_OVERRIDES_CSS;
    document.head.appendChild(style);
  }, []);

  // Resolve theme on mount
  useEffect(() => {
    const resolved = resolveInitialTheme();
    setTheme(resolved);
    document.documentElement.setAttribute('data-theme', resolved);
    setMounted(true);
  }, []);

  const toggle = async () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('theme', next);
    document.documentElement.setAttribute('data-theme', next);

    try {
      await fetch('/api/user-preferences/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: next }),
      });
    } catch {
      // Silently fail — localStorage is the primary source of truth for theme
    }
  };

  if (!mounted) return null;

  return (
    <button
      onClick={toggle}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        border: `1px solid ${BORDER}`,
        background: theme === 'dark' ? RAISED : '#ffffff',
        color: theme === 'dark' ? GOLD : '#C8960F',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        transition: 'background 0.2s, border-color 0.2s',
        padding: 0,
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = GOLD;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = BORDER;
      }}
    >
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
