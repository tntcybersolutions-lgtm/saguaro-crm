'use client';
/**
 * Saguaro Field — Install Guide
 * Step-by-step PWA installation instructions for iOS, Android, iPad, PC, Mac.
 */
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const GOLD   = '#D4A017';
const RAISED = '#0f1d2b';
const BORDER = '#1e3148';
const TEXT   = '#e8edf8';
const DIM    = '#8fa3c0';
const GREEN  = '#22C55E';
const BLUE   = '#3B82F6';
const PURPLE = '#8B5CF6';

type Platform = 'ios' | 'android' | 'desktop-chrome' | 'desktop-safari' | 'desktop-edge';

const PLATFORMS: { id: Platform; label: string; icon: string; desc: string }[] = [
  { id: 'ios',            label: 'iPhone / iPad',  icon: '🍎', desc: 'iOS Safari' },
  { id: 'android',        label: 'Android',         icon: '🤖', desc: 'Chrome / Samsung' },
  { id: 'desktop-chrome', label: 'Windows / Mac',   icon: '💻', desc: 'Chrome / Edge' },
  { id: 'desktop-safari', label: 'Mac Safari',      icon: '🖥', desc: 'Safari 17+' },
  { id: 'desktop-edge',   label: 'Edge / Windows',  icon: '🪟', desc: 'Microsoft Edge' },
];

const STEPS: Record<Platform, { icon: string; title: string; body: string }[]> = {
  ios: [
    { icon: '🌐', title: 'Open in Safari', body: 'Make sure you are using Safari on your iPhone or iPad. Chrome and other browsers on iOS cannot install PWA apps.' },
    { icon: '↑', title: 'Tap the Share button', body: 'At the bottom of the screen, tap the Share icon (box with an arrow pointing up).' },
    { icon: '➕', title: 'Add to Home Screen', body: 'Scroll down in the share sheet and tap "Add to Home Screen".' },
    { icon: '✅', title: 'Tap Add', body: 'Confirm by tapping "Add" in the top right. Saguaro Field will appear on your home screen like a native app.' },
    { icon: '🚀', title: 'Launch & enjoy', body: 'Open the app from your home screen. It runs full-screen with no browser bar — just like a native app.' },
  ],
  android: [
    { icon: '🌐', title: 'Open in Chrome', body: 'Open saguarocontrol.net/field in Chrome on your Android device.' },
    { icon: '⋮', title: 'Tap the menu', body: 'Tap the three-dot menu (⋮) in the top right corner of Chrome.' },
    { icon: '📲', title: 'Install app', body: 'Tap "Add to Home screen" or "Install app" — you may see a banner at the bottom too.' },
    { icon: '✅', title: 'Confirm install', body: 'Tap "Install" in the confirmation dialog.' },
    { icon: '🚀', title: 'Launch & enjoy', body: 'Find Saguaro Field on your home screen or app drawer. It runs offline too!' },
  ],
  'desktop-chrome': [
    { icon: '🌐', title: 'Open in Chrome', body: 'Visit saguarocontrol.net/field in Google Chrome on your Windows PC or Mac.' },
    { icon: '📥', title: 'Look for the install icon', body: 'In the address bar on the right side, you\'ll see a computer with a download arrow icon (⊕). Click it.' },
    { icon: '✅', title: 'Click Install', body: 'Click "Install" in the dialog that appears.' },
    { icon: '🚀', title: 'Open the app', body: 'Saguaro Field opens in its own window. Find it in your taskbar, Start menu, or Applications folder.' },
  ],
  'desktop-safari': [
    { icon: '🌐', title: 'Open Safari 17+', body: 'Visit saguarocontrol.net/field in Safari on macOS Sonoma (14) or later.' },
    { icon: '📂', title: 'Open File menu', body: 'Click "File" in the menu bar at the top of your screen.' },
    { icon: '📲', title: 'Add to Dock', body: 'Click "Add to Dock…" from the File menu.' },
    { icon: '✅', title: 'Confirm', body: 'Click "Add" to add Saguaro Field to your Dock.' },
    { icon: '🚀', title: 'Launch from Dock', body: 'Click the Saguaro icon in your Dock to open the app in standalone mode.' },
  ],
  'desktop-edge': [
    { icon: '🌐', title: 'Open in Edge', body: 'Visit saguarocontrol.net/field in Microsoft Edge.' },
    { icon: '⋯', title: 'Open the menu', body: 'Click the three-dot menu (…) in the top right corner.' },
    { icon: '📲', title: 'Find Apps', body: 'Hover over "Apps" then click "Install this site as an app".' },
    { icon: '✅', title: 'Click Install', body: 'Click "Install" in the dialog.' },
    { icon: '🚀', title: 'Launch', body: 'Find Saguaro Field in your Start menu or taskbar pinned apps.' },
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
      <button onClick={() => router.back()} style={backBtn}>← Back</button>

      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 52, marginBottom: 8 }}>📲</div>
        <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 900, color: TEXT }}>Install Saguaro Field</h1>
        <p style={{ margin: 0, fontSize: 14, color: DIM }}>Works like a native app — no App Store required</p>
      </div>

      {isStandalone && (
        <div style={{ background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.3)', borderRadius: 14, padding: '14px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 24 }}>✅</span>
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
            <span style={{ fontSize: 20 }}>{p.icon}</span>
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
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `rgba(${hexRgb(color)}, .15)`, border: `1px solid rgba(${hexRgb(color)}, .3)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 18 }}>{step.icon}</span>
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
        {[
          ['⚡', 'Lightning fast', 'Opens instantly from home screen — no browser loading'],
          ['📶', 'Works offline', 'Log work, take photos, and clock in even without service'],
          ['🔔', 'Full screen', 'No browser bars — feels like a native app'],
          ['💾', 'Auto-sync', 'Queued actions sync automatically when you reconnect'],
          ['🆓', 'Free forever', 'No App Store needed — nothing to download or update'],
        ].map(([icon, title, desc]) => (
          <div key={title as string} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 10 }}>
            <span style={{ fontSize: 20, lineHeight: 1 }}>{icon}</span>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: TEXT }}>{title as string}</p>
              <p style={{ margin: '1px 0 0', fontSize: 12, color: DIM }}>{desc as string}</p>
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

const backBtn: React.CSSProperties = { background: 'none', border: 'none', color: DIM, fontSize: 14, cursor: 'pointer', padding: '0 0 12px', display: 'block' };

function hexRgb(hex: string): string {
  const r = parseInt((hex || '#888').slice(1, 3), 16);
  const g = parseInt((hex || '#888').slice(3, 5), 16);
  const b = parseInt((hex || '#888').slice(5, 7), 16);
  return `${r},${g},${b}`;
}
