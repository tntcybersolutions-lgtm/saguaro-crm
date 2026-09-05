'use client';
/**
 * Saguaro Field — Install Guide
 * Step-by-step PWA installation instructions for iOS, Android, iPad, PC, Mac.
 */
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const GOLD   = '#D4A017';
const RAISED = '#0D1D2E';
const BORDER = '#1E3A5F';
const TEXT   = '#F0F4FF';
const DIM    = '#8BAAC8';
const GREEN  = '#22C55E';
const BLUE   = '#3B82F6';
const PURPLE = '#8B5CF6';

type Platform = 'ios' | 'android' | 'desktop-chrome' | 'desktop-safari' | 'desktop-edge';

const PLATFORM_ICONS: Record<Platform, React.ReactNode> = {
  ios: <svg viewBox="0 0 24 24" fill="currentColor" width={20} height={20}><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>,
  android: <svg viewBox="0 0 24 24" fill="currentColor" width={20} height={20}><path d="M6 18c0 .55.45 1 1 1h1v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h2v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h1c.55 0 1-.45 1-1V8H6v10zM3.5 8C2.67 8 2 8.67 2 9.5v7c0 .83.67 1.5 1.5 1.5S5 17.33 5 16.5v-7C5 8.67 4.33 8 3.5 8zm17 0c-.83 0-1.5.67-1.5 1.5v7c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5v-7c0-.83-.67-1.5-1.5-1.5zm-4.97-5.84l1.3-1.3c.2-.2.2-.51 0-.71-.2-.2-.51-.2-.71 0l-1.48 1.48C13.85 1.23 12.95 1 12 1c-.96 0-1.86.23-2.66.63L7.85.15c-.2-.2-.51-.2-.71 0-.2.2-.2.51 0 .71l1.31 1.31C7.08 3.34 6 5.05 6 7h12c0-1.95-1.08-3.66-2.47-4.84zM10 5H9V4h1v1zm5 0h-1V4h1v1z"/></svg>,
  'desktop-chrome': <svg viewBox="0 0 24 24" fill="currentColor" width={20} height={20}><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>,
  'desktop-safari': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><circle cx={12} cy={12} r={10}/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>,
  'desktop-edge': <svg viewBox="0 0 24 24" fill="currentColor" width={20} height={20}><path d="M21.86 17.86C20.5 18.6 18.96 19 17.33 19c-2.47 0-4.52-.9-5.88-2.47C10.3 15.22 9.6 13.62 9.5 12h12.47c.03.27.03.54.03.82 0 1.76-.4 3.43-1.14 5.04zM12 2C6.48 2 2 6.48 2 12c0 3.35 1.65 6.32 4.18 8.16.88.62 1.84 1.08 2.87 1.35-1.11-1.42-1.76-3.22-1.76-5.14 0-.15.01-.3.02-.44H2.03C2.01 15.63 2 15.32 2 15c0-5.52 4.48-10 10-10 1.16 0 2.28.2 3.32.56-1.05.13-1.91.63-2.5 1.44H21c-.82-2.88-3.1-5.16-6-6z"/></svg>,
};

const PLATFORMS: { id: Platform; label: string; desc: string }[] = [
  { id: 'ios',            label: 'iPhone / iPad',  desc: 'iOS Safari' },
  { id: 'android',        label: 'Android',         desc: 'Chrome / Samsung' },
  { id: 'desktop-chrome', label: 'Windows / Mac',   desc: 'Chrome / Edge' },
  { id: 'desktop-safari', label: 'Mac Safari',      desc: 'Safari 17+' },
  { id: 'desktop-edge',   label: 'Edge / Windows',  desc: 'Microsoft Edge' },
];

const IcoGlobe = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={18} height={18}><circle cx={12} cy={12} r={10}/><line x1={2} y1={12} x2={22} y2={12}/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>;
const IcoShare = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={18} height={18}><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1={12} y1={2} x2={12} y2={15}/></svg>;
const IcoPlus = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={18} height={18}><line x1={12} y1={5} x2={12} y2={19}/><line x1={5} y1={12} x2={19} y2={12}/></svg>;
const IcoCheck = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={18} height={18}><polyline points="20 6 9 17 4 12"/></svg>;
const IcoRocket = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={18} height={18}><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>;
const IcoMenu = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={18} height={18}><circle cx={12} cy={5} r={1}/><circle cx={12} cy={12} r={1}/><circle cx={12} cy={19} r={1}/></svg>;
const IcoDownload = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={18} height={18}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1={12} y1={15} x2={12} y2={3}/></svg>;
const IcoFolder = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={18} height={18}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>;
const IcoApps = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={18} height={18}><rect x={3} y={3} width={7} height={7}/><rect x={14} y={3} width={7} height={7}/><rect x={3} y={14} width={7} height={7}/><rect x={14} y={14} width={7} height={7}/></svg>;

const STEPS: Record<Platform, { icon: React.ReactNode; title: string; body: string }[]> = {
  ios: [
    { icon: IcoGlobe,    title: 'Open in Safari', body: 'Make sure you are using Safari on your iPhone or iPad. Chrome and other browsers on iOS cannot install PWA apps.' },
    { icon: IcoShare,    title: 'Tap the Share button', body: 'At the bottom of the screen, tap the Share icon (box with an arrow pointing up).' },
    { icon: IcoPlus,     title: 'Add to Home Screen', body: 'Scroll down in the share sheet and tap "Add to Home Screen".' },
    { icon: IcoCheck,    title: 'Tap Add', body: 'Confirm by tapping "Add" in the top right. Saguaro Field will appear on your home screen like a native app.' },
    { icon: IcoRocket,   title: 'Launch & enjoy', body: 'Open the app from your home screen. It runs full-screen with no browser bar — just like a native app.' },
  ],
  android: [
    { icon: IcoGlobe,    title: 'Open in Chrome', body: 'Open saguarocontrol.net/field in Chrome on your Android device.' },
    { icon: IcoMenu,     title: 'Tap the menu', body: 'Tap the three-dot menu in the top right corner of Chrome.' },
    { icon: IcoDownload, title: 'Install app', body: 'Tap "Add to Home screen" or "Install app" — you may see a banner at the bottom too.' },
    { icon: IcoCheck,    title: 'Confirm install', body: 'Tap "Install" in the confirmation dialog.' },
    { icon: IcoRocket,   title: 'Launch & enjoy', body: 'Find Saguaro Field on your home screen or app drawer. It runs offline too!' },
  ],
  'desktop-chrome': [
    { icon: IcoGlobe,    title: 'Open in Chrome', body: 'Visit saguarocontrol.net/field in Google Chrome on your Windows PC or Mac.' },
    { icon: IcoDownload, title: 'Look for the install icon', body: 'In the address bar on the right side, you\'ll see a computer with a download arrow icon. Click it.' },
    { icon: IcoCheck,    title: 'Click Install', body: 'Click "Install" in the dialog that appears.' },
    { icon: IcoRocket,   title: 'Open the app', body: 'Saguaro Field opens in its own window. Find it in your taskbar, Start menu, or Applications folder.' },
  ],
  'desktop-safari': [
    { icon: IcoGlobe,    title: 'Open Safari 17+', body: 'Visit saguarocontrol.net/field in Safari on macOS Sonoma (14) or later.' },
    { icon: IcoFolder,   title: 'Open File menu', body: 'Click "File" in the menu bar at the top of your screen.' },
    { icon: IcoDownload, title: 'Add to Dock', body: 'Click "Add to Dock…" from the File menu.' },
    { icon: IcoCheck,    title: 'Confirm', body: 'Click "Add" to add Saguaro Field to your Dock.' },
    { icon: IcoRocket,   title: 'Launch from Dock', body: 'Click the Saguaro icon in your Dock to open the app in standalone mode.' },
  ],
  'desktop-edge': [
    { icon: IcoGlobe,    title: 'Open in Edge', body: 'Visit saguarocontrol.net/field in Microsoft Edge.' },
    { icon: IcoApps,     title: 'Open the menu', body: 'Click the three-dot menu in the top right corner.' },
    { icon: IcoDownload, title: 'Find Apps', body: 'Hover over "Apps" then click "Install this site as an app".' },
    { icon: IcoCheck,    title: 'Click Install', body: 'Click "Install" in the dialog.' },
    { icon: IcoRocket,   title: 'Launch', body: 'Find Saguaro Field in your Start menu or taskbar pinned apps.' },
  ],
};

const PLATFORM_COLORS: Record<Platform, string> = {
  ios: BLUE,
  android: GREEN,
  'desktop-chrome': GOLD,
  'desktop-safari': BLUE,
  'desktop-edge': PURPLE,
};

function detectPlatform(): Platform {
  if (typeof window === 'undefined') return 'android';
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (/android/i.test(ua)) return 'android';
  if (/edg\//i.test(ua)) return 'desktop-edge';
  if (/safari/i.test(ua) && !/chrome/i.test(ua)) return 'desktop-safari';
  return 'desktop-chrome';
}

export default function InstallPage() {
  const router = useRouter();
  const [platform, setPlatform] = useState<Platform>('android');
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
    const standalone = window.matchMedia('(display-mode: standalone)').matches ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window.navigator as any).standalone === true;
    setIsStandalone(standalone);
  }, []);

  const steps = STEPS[platform];
  const color = PLATFORM_COLORS[platform];

  return (
    <div style={{ padding: '18px 16px 32px' }}>
      <button onClick={() => router.back()} style={backBtn}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}><line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/></svg></button>

      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ marginBottom: 8, color: GOLD, display: 'flex', justifyContent: 'center' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={52} height={52}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1={12} y1={15} x2={12} y2={3}/></svg></div>
        <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 900, color: TEXT }}>Install Saguaro Field</h1>
        <p style={{ margin: 0, fontSize: 14, color: DIM }}>Works like a native app — no App Store required</p>
      </div>

      {isStandalone && (
        <div style={{ background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.3)', borderRadius: 14, padding: '14px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: GREEN, display: 'flex' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={24} height={24}><polyline points="20 6 9 17 4 12"/></svg></span>
          <div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: GREEN }}>Already installed!</p>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: DIM }}>You are running Saguaro Field as an installed app.</p>
          </div>
        </div>
      )}

      {/* Platform selector */}
      <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8 }}>Select your device</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 24 }}>
        {PLATFORMS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPlatform(p.id)}
            style={{
              background: platform === p.id ? `rgba(${hexRgb(PLATFORM_COLORS[p.id])}, .12)` : RAISED,
              border: `2px solid ${platform === p.id ? PLATFORM_COLORS[p.id] : BORDER}`,
              borderRadius: 12,
              padding: '12px 10px',
              color: platform === p.id ? PLATFORM_COLORS[p.id] : DIM,
              fontSize: 13,
              fontWeight: platform === p.id ? 700 : 400,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              textAlign: 'left',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center' }}>{PLATFORM_ICONS[p.id]}</span>
            <div>
              <div style={{ fontWeight: platform === p.id ? 700 : 600, fontSize: 13 }}>{p.label}</div>
              <div style={{ fontSize: 11, opacity: 0.7, marginTop: 1 }}>{p.desc}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Steps */}
      <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8 }}>Installation steps</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {steps.map((step, i) => (
          <div
            key={i}
            style={{
              background: RAISED,
              border: `1px solid ${BORDER}`,
              borderRadius: 14,
              padding: '14px 16px',
              display: 'flex',
              gap: 14,
              alignItems: 'flex-start',
            }}
          >
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `rgba(${hexRgb(color)}, .15)`, border: `1px solid rgba(${hexRgb(color)}, .3)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color }}>
              {step.icon}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color, background: `rgba(${hexRgb(color)}, .15)`, borderRadius: 4, padding: '1px 6px' }}>STEP {i + 1}</span>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: TEXT }}>{step.title}</p>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: DIM, lineHeight: 1.5 }}>{step.body}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Benefits */}
      <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '16px', marginTop: 20 }}>
        <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8 }}>Why install?</p>
        {([
          [<svg key="fast" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>, 'Lightning fast', 'Opens instantly from home screen — no browser loading'],
          [<svg key="offline" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><path d="M1.05 12A11 11 0 0 1 23 12"/><path d="M5 12a7 7 0 0 1 14 0"/><path d="M9 12a3 3 0 0 1 6 0"/><line x1={12} y1={12} x2={12.01} y2={12}/></svg>, 'Works offline', 'Log work, take photos, and clock in even without service'],
          [<svg key="fullscreen" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><rect x={5} y={2} width={14} height={20} rx={2} ry={2}/><line x1={12} y1={18} x2={12.01} y2={18}/></svg>, 'Full screen', 'No browser bars — feels like a native app'],
          [<svg key="sync" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>, 'Auto-sync', 'Queued actions sync automatically when you reconnect'],
          [<svg key="free" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1={12} y1={15} x2={12} y2={3}/></svg>, 'Free forever', 'No App Store needed — nothing to download or update'],
        ] as [React.ReactNode, string, string][]).map(([icon, title, desc]) => (
          <div key={title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 10 }}>
            <span style={{ color: GOLD, display: 'flex', flexShrink: 0, marginTop: 1 }}>{icon}</span>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: TEXT }}>{title}</p>
              <p style={{ margin: '1px 0 0', fontSize: 12, color: DIM }}>{desc}</p>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => router.push('/field')}
        style={{ width: '100%', background: GOLD, border: 'none', borderRadius: 14, padding: '16px', color: '#000', fontSize: 16, fontWeight: 800, cursor: 'pointer', marginTop: 20 }}
      >
        Go to Saguaro Field →
      </button>
    </div>
  );
}

const backBtn: React.CSSProperties = { background: 'none', border: 'none', color: DIM, cursor: 'pointer', padding: '8px', marginLeft: -8, display: 'flex', alignItems: 'center', marginBottom: 4 };

function hexRgb(hex: string): string {
  const r = parseInt((hex || '#888').slice(1, 3), 16);
  const g = parseInt((hex || '#888').slice(3, 5), 16);
  const b = parseInt((hex || '#888').slice(5, 7), 16);
  return `${r},${g},${b}`;
}
