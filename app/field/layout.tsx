'use client';
/**
 * Saguaro Field — Mobile PWA Shell
 * Completely separate from the desktop /app/ layout.
 * Optimized for foremen on job sites — big touch targets, offline-first.
 */
import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getQueueCount, replayQueue } from '@/lib/field-db';

const GOLD  = '#D4A017';
const DARK  = '#09111A';
const RAISED = '#0f1d2b';
const BORDER = '#1e3148';
const TEXT   = '#e8edf8';
const DIM    = '#8fa3c0';
const GREEN  = '#22C55E';
const RED    = '#EF4444';

interface NavItem { href: string; label: string; icon: React.ReactNode; }

function HomeIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  );
}
function LogIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
    </svg>
  );
}
function CameraIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>
    </svg>
  );
}
function ClipboardIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M9 12l2 2 4-4"/>
    </svg>
  );
}
function SyncIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
    </svg>
  );
}

const NAV: NavItem[] = [
  { href: '/field',         label: 'Home',    icon: <HomeIcon /> },
  { href: '/field/log',     label: 'Daily Log', icon: <LogIcon /> },
  { href: '/field/photos',  label: 'Photos',  icon: <CameraIcon /> },
  { href: '/field/inspect', label: 'Inspect', icon: <ClipboardIcon /> },
];

export default function FieldLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [online, setOnline] = useState(true);
  const [queueCount, setQueueCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [installEvent, setInstallEvent] = useState<Event | null>(null);
  const [showInstall, setShowInstall] = useState(false);

  // Service worker registration
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(console.error);
      navigator.serviceWorker.addEventListener('message', (e) => {
        if (e.data?.type === 'SYNC_NOW') triggerSync();
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Online/offline detection
  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    setOnline(navigator.onLine);
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, []);

  // Auto-sync when coming back online
  useEffect(() => {
    if (online && queueCount > 0) triggerSync();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  // Refresh queue count periodically
  useEffect(() => {
    refreshQueue();
    const id = setInterval(refreshQueue, 10000);
    return () => clearInterval(id);
  }, []);

  // PWA install prompt
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e);
      setShowInstall(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const refreshQueue = async () => {
    try {
      const count = await getQueueCount();
      setQueueCount(count);
    } catch { /* IndexedDB not available */ }
  };

  const triggerSync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      await replayQueue();
      await refreshQueue();
    } finally {
      setSyncing(false);
    }
  }, [syncing]);

  const handleInstall = async () => {
    if (!installEvent) return;
    // @ts-expect-error: BeforeInstallPromptEvent
    await installEvent.prompt();
    setShowInstall(false);
    setInstallEvent(null);
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100dvh',
      background: DARK,
      color: TEXT,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      maxWidth: 480,
      margin: '0 auto',
      position: 'relative',
    }}>
      {/* Status bar */}
      <div style={{
        background: '#060e17',
        padding: '10px 16px 8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: `1px solid ${BORDER}`,
        position: 'sticky',
        top: 0,
        zIndex: 50,
        paddingTop: 'max(10px, env(safe-area-inset-top))',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-icon.jpg" alt="Saguaro" width={28} height={28} style={{ borderRadius: 6 }} />
          <span style={{ fontWeight: 700, fontSize: 15, color: GOLD, letterSpacing: 0.5 }}>SAGUARO FIELD</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Queue badge */}
          {queueCount > 0 && (
            <button
              onClick={triggerSync}
              disabled={syncing || !online}
              style={{
                background: online ? 'rgba(212,160,23,0.15)' : 'rgba(239,68,68,0.15)',
                border: `1px solid ${online ? 'rgba(212,160,23,0.3)' : 'rgba(239,68,68,0.3)'}`,
                borderRadius: 20,
                padding: '3px 10px',
                color: online ? GOLD : RED,
                fontSize: 12,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                cursor: online ? 'pointer' : 'default',
              }}
            >
              <span style={{ animation: syncing ? 'spin 1s linear infinite' : undefined }}>
                <SyncIcon />
              </span>
              {queueCount} pending
            </button>
          )}

          {/* Online indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: online ? GREEN : RED,
              boxShadow: `0 0 6px ${online ? GREEN : RED}`,
            }} />
            <span style={{ fontSize: 11, color: DIM }}>{online ? 'Live' : 'Offline'}</span>
          </div>
        </div>
      </div>

      {/* Install banner */}
      {showInstall && (
        <div style={{
          background: 'rgba(212,160,23,0.12)',
          borderBottom: `1px solid rgba(212,160,23,0.3)`,
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}>
          <span style={{ fontSize: 13, color: TEXT }}>
            Add Saguaro Field to your home screen for offline access
          </span>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button onClick={() => setShowInstall(false)} style={{ background: 'none', border: 'none', color: DIM, fontSize: 13, cursor: 'pointer' }}>
              Later
            </button>
            <button
              onClick={handleInstall}
              style={{ background: GOLD, border: 'none', borderRadius: 6, padding: '5px 12px', color: '#000', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              Install
            </button>
          </div>
        </div>
      )}

      {/* Offline banner */}
      {!online && (
        <div style={{
          background: 'rgba(239,68,68,0.1)',
          borderBottom: '1px solid rgba(239,68,68,0.25)',
          padding: '8px 16px',
          textAlign: 'center',
          fontSize: 13,
          color: RED,
          fontWeight: 600,
        }}>
          You are offline — changes will sync when reconnected
        </div>
      )}

      {/* Page content */}
      <main style={{ flex: 1, overflowY: 'auto', paddingBottom: 'calc(68px + env(safe-area-inset-bottom))' }}>
        {children}
      </main>

      {/* Bottom nav */}
      <nav style={{
        position: 'fixed',
        bottom: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: 480,
        background: '#060e17',
        borderTop: `1px solid ${BORDER}`,
        display: 'flex',
        paddingBottom: 'env(safe-area-inset-bottom)',
        zIndex: 50,
      }}>
        {NAV.map((item) => {
          const active = item.href === '/field' ? pathname === '/field' : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 3,
                padding: '10px 4px 8px',
                color: active ? GOLD : DIM,
                textDecoration: 'none',
                transition: 'color 0.15s',
              }}
            >
              {item.icon}
              <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, letterSpacing: 0.3 }}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        input, select, textarea, button { font-family: inherit; }
        ::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
