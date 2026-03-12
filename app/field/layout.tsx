'use client';
/**
 * Saguaro Field — Mobile PWA Shell
 * Bottom nav: Home · Punch · Log · Photos · More
 */
import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getQueueCount, replayQueue } from '@/lib/field-db';

const GOLD   = '#D4A017';
const DARK   = '#09111A';
const BORDER = '#1e3148';
const TEXT   = '#e8edf8';
const DIM    = '#8fa3c0';
const GREEN  = '#22C55E';
const RED    = '#EF4444';

const NAV = [
  { href: '/field',         label: 'Home',   Icon: HomeIcon },
  { href: '/field/punch',   label: 'Punch',  Icon: PunchIcon },
  { href: '/field/log',     label: 'Log',    Icon: LogIcon },
  { href: '/field/photos',  label: 'Photos', Icon: CameraIcon },
  { href: '/field/more',    label: 'More',   Icon: GridIcon },
];

export default function FieldLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [online, setOnline] = useState(true);
  const [queueCount, setQueueCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [installEvent, setInstallEvent] = useState<Event | null>(null);
  const [showInstall, setShowInstall] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
      navigator.serviceWorker.addEventListener('message', (e) => {
        if (e.data?.type === 'SYNC_NOW') triggerSync();
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    setOnline(navigator.onLine);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);

  useEffect(() => {
    if (online && queueCount > 0) triggerSync();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  useEffect(() => {
    refreshQueue();
    const id = setInterval(refreshQueue, 8000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); setInstallEvent(e); setShowInstall(true); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const refreshQueue = async () => {
    try { setQueueCount(await getQueueCount()); } catch { /* no IndexedDB */ }
  };

  const triggerSync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try { await replayQueue(); await refreshQueue(); } finally { setSyncing(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncing]);

  const handleInstall = async () => {
    if (!installEvent) return;
    // @ts-expect-error: BeforeInstallPromptEvent
    await installEvent.prompt();
    setShowInstall(false);
    setInstallEvent(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: DARK, color: TEXT, fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', maxWidth: 480, margin: '0 auto' }}>
      {/* Status bar */}
      <div style={{ background: '#060e17', padding: '10px 16px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${BORDER}`, position: 'sticky', top: 0, zIndex: 50, paddingTop: 'max(10px,env(safe-area-inset-top))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-icon.jpg" alt="Saguaro" width={28} height={28} style={{ borderRadius: 6 }} />
          <span style={{ fontWeight: 800, fontSize: 14, color: GOLD, letterSpacing: 0.8 }}>SAGUARO FIELD</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {queueCount > 0 && (
            <button
              onClick={triggerSync}
              disabled={syncing || !online}
              style={{ background: online ? 'rgba(212,160,23,.15)' : 'rgba(239,68,68,.15)', border: `1px solid ${online ? 'rgba(212,160,23,.35)' : 'rgba(239,68,68,.35)'}`, borderRadius: 20, padding: '3px 10px', color: online ? GOLD : RED, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, cursor: online ? 'pointer' : 'default' }}
            >
              <span style={{ display: 'inline-block', animation: syncing ? 'spin 1s linear infinite' : undefined }}>↻</span>
              {queueCount} queued
            </button>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: online ? GREEN : RED, boxShadow: `0 0 5px ${online ? GREEN : RED}` }} />
            <span style={{ fontSize: 11, color: DIM }}>{online ? 'Live' : 'Offline'}</span>
          </div>
        </div>
      </div>

      {/* Install prompt */}
      {showInstall && (
        <div style={{ background: 'rgba(212,160,23,.1)', borderBottom: `1px solid rgba(212,160,23,.25)`, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontSize: 13, color: TEXT }}>Add Saguaro Field to home screen</span>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button onClick={() => setShowInstall(false)} style={{ background: 'none', border: 'none', color: DIM, fontSize: 13, cursor: 'pointer' }}>Later</button>
            <button onClick={handleInstall} style={{ background: GOLD, border: 'none', borderRadius: 6, padding: '5px 12px', color: '#000', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>Install</button>
          </div>
        </div>
      )}

      {/* Offline banner */}
      {!online && (
        <div style={{ background: 'rgba(239,68,68,.1)', borderBottom: '1px solid rgba(239,68,68,.2)', padding: '7px 16px', textAlign: 'center', fontSize: 13, color: RED, fontWeight: 600 }}>
          Offline — changes will sync when reconnected
        </div>
      )}

      <main style={{ flex: 1, overflowY: 'auto', paddingBottom: 'calc(64px + env(safe-area-inset-bottom))' }}>
        {children}
      </main>

      {/* Bottom nav */}
      <nav style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 480, background: '#060e17', borderTop: `1px solid ${BORDER}`, display: 'flex', paddingBottom: 'env(safe-area-inset-bottom)', zIndex: 50 }}>
        {NAV.map(({ href, label, Icon }) => {
          const active = href === '/field' ? pathname === '/field' : pathname.startsWith(href);
          return (
            <Link key={href} href={href} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '9px 4px 7px', color: active ? GOLD : DIM, textDecoration: 'none' }}>
              <Icon active={active} />
              <span style={{ fontSize: 9.5, fontWeight: active ? 700 : 500, letterSpacing: 0.2 }}>{label}</span>
            </Link>
          );
        })}
      </nav>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        input, select, textarea, button { font-family: inherit; }
        ::-webkit-scrollbar { display: none; }
        textarea { resize: vertical; }
      `}</style>
    </div>
  );
}

// Nav icons
function HomeIcon({ active }: { active: boolean }) {
  return <svg width="23" height="23" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>{!active&&<polyline points="9 22 9 12 15 12 15 22"/>}</svg>;
}
function PunchIcon({ active }: { active: boolean }) {
  return <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" fill={active ? 'currentColor' : 'none'}/><line x1="12" y1="8" x2="12" y2="12" stroke={active?'#060e17':'currentColor'} strokeWidth="2.5"/><line x1="12" y1="16" x2="12.01" y2="16" stroke={active?'#060e17':'currentColor'} strokeWidth="3"/></svg>;
}
function LogIcon({ active }: { active: boolean }) {
  return <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" fill={active?'currentColor':'none'}/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13" stroke={active?'#060e17':'currentColor'}/><line x1="16" y1="17" x2="8" y2="17" stroke={active?'#060e17':'currentColor'}/></svg>;
}
function CameraIcon({ active }: { active: boolean }) {
  return <svg width="23" height="23" viewBox="0 0 24 24" fill={active?'currentColor':'none'} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4" fill={active?'#060e17':'none'}/></svg>;
}
function GridIcon({ active }: { active: boolean }) {
  return <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" fill={active?'currentColor':'none'}/><rect x="14" y="3" width="7" height="7" fill={active?'currentColor':'none'}/><rect x="3" y="14" width="7" height="7" fill={active?'currentColor':'none'}/><rect x="14" y="14" width="7" height="7" fill={active?'currentColor':'none'}/></svg>;
}
