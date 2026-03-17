'use client';
/**
 * Saguaro Field — Mobile Shell
 * Supports both PWA and Capacitor native (iOS/Android).
 * Bottom nav: Home · Punch · Log · Photos · More
 */
import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getQueueCount, getDeadLetterCount, replayQueue, purgeExpired } from '@/lib/field-db';
import {
  isNative,
  isIOS,
  isAndroid,
  hideSplash,
  setStatusBarDark,
  onNetworkChange,
  getNetworkStatus,
  onAndroidBack,
  onAppResume,
  hapticLight,
  hapticSelection,
  setupPushListeners,
  registerForPush,
} from '@/lib/native';

const GOLD   = '#D4A017';
const DARK   = '#07101C';
const BORDER = '#1E3A5F';
const TEXT   = '#F0F4FF';
const DIM    = '#8BAAC8';
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
  const router = useRouter();
  const [online, setOnline] = useState(true);
  const [queueCount, setQueueCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [deadCount, setDeadCount] = useState(0);
  const [installEvent, setInstallEvent] = useState<Event | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [isIosWeb, setIsIosWeb] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [pushMsg, setPushMsg] = useState<{ title: string; body: string } | null>(null);
  const native = isNative();

  // ── Capacitor + PWA boot ───────────────────────────────────────
  useEffect(() => {
    // 1. Status bar: dark content on dark bg
    setStatusBarDark().catch(() => {});

    // 2. Hide splash after layout is ready
    const splashTimer = setTimeout(() => hideSplash().catch(() => {}), 300);

    // 3. Service worker (PWA / web only)
    if (!native && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
      navigator.serviceWorker.addEventListener('message', (e) => {
        if (e.data?.type === 'SYNC_NOW') triggerSync();
      });
    }

    // 4. Purge stale offline queue items
    purgeExpired().catch(() => {});

    return () => clearTimeout(splashTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Push notifications (native) ───────────────────────────────
  useEffect(() => {
    if (!native) return;
    // Register for push and wire foreground banner
    registerForPush().catch(() => {});
    const cleanup = setupPushListeners({
      onMessage: (title, body) => {
        setPushMsg({ title, body });
        setTimeout(() => setPushMsg(null), 5000);
      },
      onTap: (data) => {
        // Navigate based on push data
        if (data?.route) router.push(String(data.route));
      },
    });
    return cleanup;
  }, [native, router]);

  // ── Network detection ─────────────────────────────────────────
  useEffect(() => {
    // Initial state
    getNetworkStatus().then((s) => setOnline(s.connected)).catch(() => {});

    // Listen for changes (native uses @capacitor/network, web uses window events)
    const cleanup = onNetworkChange(setOnline);
    return cleanup;
  }, []);

  useEffect(() => {
    if (online && queueCount > 0) triggerSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  // ── Queue polling ──────────────────────────────────────────────
  useEffect(() => {
    refreshQueue();
    const id = setInterval(refreshQueue, 8000);
    return () => clearInterval(id);
  }, []);

  // ── Sync on app resume (native) ───────────────────────────────
  useEffect(() => {
    const cleanup = onAppResume(() => {
      refreshQueue();
      if (online) triggerSync();
    });
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  // ── Android back button ───────────────────────────────────────
  useEffect(() => {
    const cleanup = onAndroidBack(() => {
      if (pathname === '/field') {
        // Let Android handle app minimize on root
        return;
      }
      router.back();
    });
    return cleanup;
  }, [pathname, router]);

  // ── PWA install prompts (web only) ────────────────────────────
  useEffect(() => {
    if (native) return;
    const ua = navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua);
    setIsIosWeb(ios);
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window.navigator as any).standalone === true;
    setIsStandalone(standalone);
    if (ios && !standalone) {
      const dismissed = sessionStorage.getItem('sag_install_dismissed');
      if (!dismissed) setTimeout(() => setShowInstall(true), 3000);
    }
  }, [native]);

  useEffect(() => {
    if (native) return;
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e);
      setShowInstall(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [native]);

  const refreshQueue = async () => {
    try {
      setQueueCount(await getQueueCount());
      setDeadCount(await getDeadLetterCount());
    } catch { /* no IndexedDB */ }
  };

  const triggerSync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try { await replayQueue(); await refreshQueue(); } finally { setSyncing(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncing]);

  const handleInstall = async () => {
    if (!installEvent) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (installEvent as any).prompt();
    setShowInstall(false);
    setInstallEvent(null);
  };

  const dismissInstall = () => {
    setShowInstall(false);
    sessionStorage.setItem('sag_install_dismissed', '1');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: DARK, color: TEXT, fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', maxWidth: 480, margin: '0 auto' }}>

      {/* ── Status bar ── */}
      <div style={{ background: '#060C15', padding: '10px 16px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${BORDER}`, position: 'sticky', top: 0, zIndex: 50, paddingTop: `max(${native && isIOS() ? '44px' : '10px'}, env(safe-area-inset-top))` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-96x96.png" alt="Saguaro" width={30} height={30} style={{ borderRadius: 8, border: '1px solid rgba(212,160,23,.2)' }} />
          <div style={{ lineHeight: 1.1 }}>
            <span style={{ fontWeight: 900, fontSize: 14, color: GOLD, letterSpacing: 1 }}>SAGUARO</span>
            <span style={{ fontWeight: 400, fontSize: 10, color: DIM, display: 'block', letterSpacing: 2, textTransform: 'uppercase' }}>Field</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Native badge */}
          {native && (
            <span style={{ background: 'rgba(212,160,23,.1)', border: '1px solid rgba(212,160,23,.25)', borderRadius: 20, padding: '2px 8px', fontSize: 10, fontWeight: 700, color: GOLD, letterSpacing: 0.5 }}>
              {isIOS() ? 'iOS' : 'Android'}
            </span>
          )}
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

      {/* ── Inline push notification banner (native foreground) ── */}
      {pushMsg && (
        <div style={{ background: 'rgba(212,160,23,.12)', borderBottom: '1px solid rgba(212,160,23,.3)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>🔔</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: GOLD }}>{pushMsg.title}</p>
            <p style={{ margin: 0, fontSize: 12, color: DIM }}>{pushMsg.body}</p>
          </div>
          <button onClick={() => setPushMsg(null)} style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* ── PWA install modal — web only ── */}
      {showInstall && !isStandalone && !native && (
        <>
          <div onClick={dismissInstall} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 200 }} />
          <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 480, background: '#0F1E30', borderRadius: '20px 20px 0 0', border: '1px solid rgba(212,160,23,.22)', borderBottom: 'none', paddingBottom: 'calc(20px + env(safe-area-inset-bottom))', zIndex: 201, boxShadow: '0 -10px 48px rgba(0,0,0,0.7)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}>
              <div style={{ width: 38, height: 4, borderRadius: 2, background: 'rgba(255,255,255,.14)' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 24px 0' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/icon-192x192.png" alt="Saguaro Field" width={72} height={72} style={{ borderRadius: 18, border: '2px solid rgba(212,160,23,.45)', boxShadow: '0 4px 24px rgba(212,160,23,.28)' }} />
              <h2 style={{ margin: '12px 0 4px', fontSize: 22, fontWeight: 900, color: TEXT, letterSpacing: -0.5, textAlign: 'center' }}>Install Saguaro Field</h2>
              <p style={{ margin: 0, fontSize: 14, color: DIM, textAlign: 'center', lineHeight: 1.4 }}>
                Your crew&apos;s field app — home screen access,<br />instant launch, works without signal.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, padding: '14px 24px', justifyContent: 'center', flexWrap: 'wrap' }}>
              {['Works offline', 'GPS clock-in', 'Instant photos'].map((b) => (
                <span key={b} style={{ background: 'rgba(212,160,23,.12)', border: '1px solid rgba(212,160,23,.28)', borderRadius: 20, padding: '4px 13px', fontSize: 12, fontWeight: 700, color: GOLD }}>{b}</span>
              ))}
            </div>
            <div style={{ height: 1, background: 'rgba(255,255,255,.07)', margin: '0 24px' }} />
            {isIosWeb ? (
              <div style={{ padding: '16px 24px 0' }}>
                <p style={{ margin: '0 0 14px', fontSize: 13, color: DIM, textAlign: 'center', fontWeight: 600 }}>3 steps in Safari — 15 seconds</p>
                {[
                  { Icon: <ShareIcon />, label: 'Tap the Share button', sub: 'Bottom of Safari — box with arrow icon' },
                  { Icon: <HomeAddIcon />, label: 'Tap "Add to Home Screen"', sub: 'Scroll down in the share sheet' },
                  { Icon: <CheckIcon />, label: 'Tap "Add" — you\'re done', sub: 'App icon appears on your home screen' },
                ].map((step, i) => (
                  <div key={i} style={{ display: 'flex', gap: 14, marginBottom: 16, alignItems: 'center' }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(212,160,23,.13)', border: '1.5px solid rgba(212,160,23,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: GOLD }}>{step.Icon}</div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{step.label}</div>
                      <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>{step.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '20px 24px 0' }}>
                <button onClick={handleInstall} style={{ width: '100%', background: 'linear-gradient(135deg, #D4A017 0%, #EF8C1A 100%)', border: 'none', borderRadius: 14, padding: '16px', color: '#000', fontSize: 17, fontWeight: 900, cursor: 'pointer', boxShadow: '0 6px 28px rgba(212,160,23,.5)' }}>
                  Install App
                </button>
                <p style={{ margin: '9px 0 0', textAlign: 'center', fontSize: 12, color: DIM }}>Takes 2 seconds · Works like a native app</p>
              </div>
            )}
            <div style={{ padding: '14px 24px 0', textAlign: 'center' }}>
              <button onClick={dismissInstall} style={{ background: 'none', border: 'none', color: DIM, fontSize: 14, cursor: 'pointer', padding: '8px 20px' }}>Not now</button>
            </div>
          </div>
        </>
      )}

      {/* ── Offline banner ── */}
      {!online && (
        <div style={{ background: 'rgba(239,68,68,.1)', borderBottom: '1px solid rgba(239,68,68,.2)', padding: '7px 16px', textAlign: 'center', fontSize: 13, color: RED, fontWeight: 600 }}>
          Offline — changes will sync when reconnected
        </div>
      )}

      {/* ── Dead-letter alert ── */}
      {deadCount > 0 && (
        <div style={{ background: 'rgba(245,158,11,.1)', borderBottom: '1px solid rgba(245,158,11,.3)', padding: '7px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: GOLD }}>
          <span style={{ fontWeight: 700 }}>⚠ {deadCount} item{deadCount > 1 ? 's' : ''} failed to sync after 5 attempts</span>
          <span style={{ color: DIM, fontSize: 11 }}>Contact support</span>
        </div>
      )}

      <main style={{ flex: 1, overflowY: 'auto', paddingBottom: `calc(${native && isAndroid() ? '72px' : '64px'} + env(safe-area-inset-bottom))` }}>
        {children}
      </main>

      {/* ── Bottom nav ── */}
      <nav style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 480, background: '#060C15', borderTop: `1px solid ${BORDER}`, display: 'flex', paddingBottom: 'env(safe-area-inset-bottom)', zIndex: 50 }}>
        {NAV.map(({ href, label, Icon }) => {
          const active = href === '/field' ? pathname === '/field' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={() => { hapticSelection().catch(() => {}); }}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '10px 4px 8px', color: active ? GOLD : DIM, textDecoration: 'none', position: 'relative', minHeight: 54 }}
            >
              {active && <span style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 28, height: 2.5, background: GOLD, borderRadius: '0 0 3px 3px' }} />}
              <Icon active={active} />
              <span style={{ fontSize: 11, fontWeight: active ? 800 : 500, letterSpacing: 0.1 }}>{label}</span>
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

// ── Icons ────────────────────────────────────────────────────────────────────

function ShareIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>;
}
function HomeAddIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><line x1="12" y1="12" x2="12" y2="18"/><line x1="9" y1="15" x2="15" y2="15"/></svg>;
}
function CheckIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
}
function HomeIcon({ active }: { active: boolean }) {
  return <svg width="25" height="25" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>{!active&&<polyline points="9 22 9 12 15 12 15 22"/>}</svg>;
}
function PunchIcon({ active }: { active: boolean }) {
  return <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" fill={active ? 'currentColor' : 'none'}/><line x1="12" y1="8" x2="12" y2="12" stroke={active?'#060C15':'currentColor'} strokeWidth="2.5"/><line x1="12" y1="16" x2="12.01" y2="16" stroke={active?'#060C15':'currentColor'} strokeWidth="3"/></svg>;
}
function LogIcon({ active }: { active: boolean }) {
  return <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" fill={active?'currentColor':'none'}/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13" stroke={active?'#060C15':'currentColor'}/><line x1="16" y1="17" x2="8" y2="17" stroke={active?'#060C15':'currentColor'}/></svg>;
}
function CameraIcon({ active }: { active: boolean }) {
  return <svg width="25" height="25" viewBox="0 0 24 24" fill={active?'currentColor':'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4" fill={active?'#060C15':'none'}/></svg>;
}
function GridIcon({ active }: { active: boolean }) {
  return <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" fill={active?'currentColor':'none'}/><rect x="14" y="3" width="7" height="7" fill={active?'currentColor':'none'}/><rect x="3" y="14" width="7" height="7" fill={active?'currentColor':'none'}/><rect x="14" y="14" width="7" height="7" fill={active?'currentColor':'none'}/></svg>;
}

