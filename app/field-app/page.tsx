'use client';
import React, { useState } from 'react';

const GOLD   = '#F59E0B';
const DARK   = '#09111A';
const RAISED = '#0F172A';
const BORDER = '#1E3A5F';
const DIM    = '#CBD5E1';
const TEXT   = '#F8FAFC';
const GREEN  = '#22C55E';
const BLUE   = '#3B82F6';
const PURPLE = '#8B5CF6';

// ── SVG Icons ────────────────────────────────────────────────────────────────
function IconLog() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>;
}
function IconCamera() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>;
}
function IconClock() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
}
function IconCheck() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>;
}
function IconInfo() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>;
}
function IconSearch() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
}
function IconTruck() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>;
}
function IconSparkle() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
}
function IconPhone() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>;
}
function IconWifi() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.55a11 11 0 0114.08 0"/><path d="M1.42 9a16 16 0 0121.16 0"/><path d="M8.53 16.11a6 6 0 016.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>;
}
function IconMonitor() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>;
}
function IconTablet() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>;
}
function IconApple() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>;
}
function IconAndroid() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.523 15.341A6.98 6.98 0 0019 11a6.98 6.98 0 00-1.477-4.341l1.416-1.416a.75.75 0 00-1.06-1.06l-1.406 1.406A6.964 6.964 0 0012 4a6.964 6.964 0 00-4.473 1.589L6.121 4.183a.75.75 0 00-1.06 1.06l1.416 1.416A6.98 6.98 0 005 11a6.98 6.98 0 001.477 4.341L5.06 16.757a.75.75 0 101.06 1.06l1.406-1.406A6.964 6.964 0 0012 18a6.964 6.964 0 004.473-1.589l1.406 1.406a.75.75 0 001.06-1.06l-1.416-1.416zM9.5 9a.5.5 0 110 1 .5.5 0 010-1zm5 0a.5.5 0 110 1 .5.5 0 010-1zM12 6.5a4.5 4.5 0 110 9 4.5 4.5 0 010-9z"/></svg>;
}
function IconArrowLeft() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>;
}
function IconSaguaro() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22V12"/><path d="M12 12C12 8 9 6 9 3"/><path d="M12 12C12 8 15 6 15 3"/><path d="M6 15c0-2 3-3 6-3"/><path d="M18 15c0-2-3-3-6-3"/></svg>;
}

// ── Icon map for FEATURES ─────────────────────────────────────────────────
const FEATURE_ICONS: Record<string, React.ReactNode> = {
  'Daily Logs':       <IconLog />,
  'Site Photos':      <IconCamera />,
  'GPS Clock-In / Out': <IconClock />,
  'Punch List':       <IconCheck />,
  'RFIs':             <IconInfo />,
  'Inspections':      <IconSearch />,
  'Delivery Logs':    <IconTruck />,
  'Sage AI Assistant': <IconSparkle />,
};

const FEATURES = [
  {
    color: BLUE,
    title: 'Daily Logs',
    desc: 'Submit structured daily logs with weather, crew count, activities, equipment, and delays — all from your phone in under 2 minutes.',
    pills: ['Voice-to-text', 'Auto-date', 'PDF export'],
  },
  {
    color: GOLD,
    title: 'Site Photos',
    desc: 'Capture, tag, and annotate site photos. Organized by project, date, and phase. Syncs to office instantly — even from the basement.',
    pills: ['GPS tagged', 'Annotations', 'Unlimited storage'],
  },
  {
    color: GREEN,
    title: 'GPS Clock-In / Out',
    desc: 'Workers clock in with GPS verification. Foremen see the full crew timeline in real time. Exports directly to payroll.',
    pills: ['GPS verified', 'Real-time map', 'Payroll export'],
  },
  {
    color: PURPLE,
    title: 'Punch List',
    desc: 'Create, assign, and close punch items with photos. Subs get mobile notifications. Everything is tracked with timestamps.',
    pills: ['Photo proof', 'Sub notifications', 'Status tracking'],
  },
  {
    color: '#F97316',
    title: 'RFIs',
    desc: 'Submit and track RFIs right from the field. See due dates, overdue flags, and responses without opening a laptop.',
    pills: ['Overdue alerts', 'Threaded replies', 'Office sync'],
  },
  {
    color: '#06B6D4',
    title: 'Inspections',
    desc: 'Run safety walkthroughs, quality control inspections, and pre-pour checklists from a phone. Sign and timestamp digitally.',
    pills: ['Custom checklists', 'Digital sign-off', 'PDF report'],
  },
  {
    color: '#EF4444',
    title: 'Delivery Logs',
    desc: "Log material deliveries with photos and supplier info. Never lose track of what arrived, what's missing, or what got rejected.",
    pills: ['Photo receipt', 'Supplier info', 'Quantity tracking'],
  },
  {
    color: GOLD,
    title: 'Sage AI Assistant',
    desc: 'Ask Sage anything about the project — specs, schedules, contacts, last inspection results — while standing on the slab. Instant answers.',
    pills: ['Project-aware', 'Voice input', 'Streaming response'],
  },
];

const DEVICES = [
  { Icon: IconApple,   label: 'iPhone',      sub: 'iOS Safari' },
  { Icon: IconAndroid, label: 'Android',      sub: 'Chrome / Samsung' },
  { Icon: IconTablet,  label: 'iPad',         sub: 'Full tablet UI' },
  { Icon: IconMonitor, label: 'Windows PC',   sub: 'Chrome / Edge' },
  { Icon: IconMonitor, label: 'Mac',          sub: 'Safari / Chrome' },
];

const COMPARE = [
  { feature: 'Daily Logs (mobile)',      saguaro: true, procore: true,  buildertrend: false },
  { feature: 'GPS Clock-In',             saguaro: true, procore: true,  buildertrend: false },
  { feature: 'Works 100% Offline',       saguaro: true, procore: false, buildertrend: false },
  { feature: 'No App Store Required',    saguaro: true, procore: false, buildertrend: false },
  { feature: 'AI Field Assistant',       saguaro: true, procore: false, buildertrend: false },
  { feature: 'Included in Base Plan',    saguaro: true, procore: false, buildertrend: false },
  { feature: 'Instant Install (any device)', saguaro: true, procore: false, buildertrend: false },
  { feature: 'Voice-to-text Logs',       saguaro: true, procore: false, buildertrend: false },
];

function hexRgb(hex: string): string {
  const r = parseInt((hex || '#888').slice(1, 3), 16);
  const g = parseInt((hex || '#888').slice(3, 5), 16);
  const b = parseInt((hex || '#888').slice(5, 7), 16);
  return `${r},${g},${b}`;
}

export default function FieldAppPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div style={{ minHeight: '100vh', background: DARK, color: TEXT, fontFamily: 'system-ui,-apple-system,sans-serif' }}>

      <style>{`
        @media (max-width: 768px) {
          .fa-hero { flex-direction: column !important; text-align: center !important; }
          .fa-hero h1 { text-align: center !important; }
          .fa-cta-row { justify-content: center !important; }
          .fa-features { grid-template-columns: 1fr !important; }
          .fa-compare { overflow-x: auto; }
          .fa-devices { flex-wrap: wrap !important; }
          .fa-nav-links { display: none !important; }
        }
        .fa-card:hover { border-color: rgba(245,158,11,.6) !important; background: rgba(245,158,11,0.06) !important; transform: translateY(-3px); transition: all .2s ease; }
        .fa-cta-primary:hover { opacity: 0.9; transform: translateY(-2px); transition: all .15s ease; }
        .fa-nav-link:hover { color: #F59E0B !important; }
        .fa-back:hover { color: #e8edf8 !important; background: rgba(255,255,255,0.08) !important; }
      `}</style>

      {/* ── Nav ────────────────────────────────────────────────────────── */}
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, height: 58, background: 'rgba(9,17,26,.96)', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12, backdropFilter: 'blur(12px)' }}>

        {/* Back to Home */}
        <a href="/" className="fa-back" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 7, background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORDER}`, color: DIM, fontSize: 13, textDecoration: 'none', transition: 'all .15s', flexShrink: 0 }}>
          <IconArrowLeft />
          <span>Home</span>
        </a>

        {/* Logo */}
        <a href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', flexShrink: 0 }}>
          <img src="/logo-full.jpg" alt="Saguaro Control Systems" style={{ height: 44, width: 'auto', objectFit: 'contain', mixBlendMode: 'screen' as const }} />
        </a>

        {/* Nav links */}
        <div className="fa-nav-links" style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8 }}>
          {[['Features', '#features'], ['Offline', '#offline'], ['Compare', '#compare'], ['Install', '#install'], ['FAQ', '#faq']].map(([l, h]) => (
            <a key={h} href={h} className="fa-nav-link" style={{ padding: '5px 12px', borderRadius: 6, fontSize: 13, color: DIM, textDecoration: 'none', transition: 'color .15s' }}>{l}</a>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        <a href="/field" style={{ padding: '7px 14px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORDER}`, borderRadius: 6, color: 'rgba(255,255,255,0.7)', fontSize: 13, textDecoration: 'none', whiteSpace: 'nowrap' }}>Open Field App</a>
        <a href="/signup" style={{ padding: '7px 16px', background: GOLD, borderRadius: 6, color: '#000', fontSize: 13, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>Free Trial</a>
      </nav>

      <div style={{ paddingTop: 58 }}>

        {/* ── Hero ────────────────────────────────────────────────────── */}
        <section style={{ position: 'relative', overflow: 'hidden', padding: '72px 32px 64px', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 70% 60% at 15% 50%, rgba(245,158,11,0.16) 0%, transparent 60%), radial-gradient(ellipse 50% 50% at 85% 25%, rgba(34,197,94,0.1) 0%, transparent 55%)', pointerEvents: 'none' }} />

          <div className="fa-hero" style={{ display: 'flex', alignItems: 'center', gap: 56, position: 'relative' }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(212,160,23,0.08)', border: '1px solid rgba(212,160,23,0.35)', borderRadius: 24, padding: '5px 14px 5px 10px', marginBottom: 20 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: '50%', background: 'rgba(212,160,23,0.2)', color: GOLD }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: GOLD, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Saguaro Field App</span>
              </div>

              <h1 style={{ fontSize: 'clamp(34px, 5vw, 58px)', fontWeight: 900, letterSpacing: '-0.03em', margin: '0 0 18px', lineHeight: 1.06, textAlign: 'left' }}>
                Construction management<br />
                <span style={{ background: `linear-gradient(135deg, ${GOLD} 0%, #F5D060 50%, #C8960F 100%)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>built for the field</span>
              </h1>

              <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.82)', margin: '0 0 32px', lineHeight: 1.65, maxWidth: 480 }}>
                Give your crew a native-speed app on any device — iPhone, Android, iPad, or desktop. Daily logs, photos, GPS clock-in, punch lists, RFIs, and Sage AI. Works offline. No App Store. Included free with every plan.
              </p>

              <div className="fa-cta-row" style={{ display: 'flex', gap: 12, justifyContent: 'flex-start', flexWrap: 'wrap', marginBottom: 20 }}>
                <a href="/signup" className="fa-cta-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 32px', background: `linear-gradient(135deg,#F59E0B,#EF4444)`, borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 900, textDecoration: 'none', boxShadow: `0 8px 36px rgba(245,158,11,0.5)` }}>
                  Start Free Trial — includes Field App
                </a>
                <a href="/field" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 22px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.28)', borderRadius: 8, color: 'rgba(255,255,255,0.92)', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
                  Open Field App →
                </a>
              </div>

              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                {['iOS & Android', 'Works Offline', 'No App Store', 'Free with any plan'].map(t => (
                  <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'rgba(255,255,255,0.38)' }}>
                    <span style={{ color: GOLD, fontWeight: 700 }}>✓</span><span style={{ color: 'rgba(255,255,255,0.78)' }}>{t}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* Phone mockup */}
            <div style={{ flex: '0 0 280px', maxWidth: 280, position: 'relative' }}>
              <div style={{ position: 'absolute', inset: -24, background: 'radial-gradient(ellipse 80% 60% at 50% 55%, rgba(212,160,23,0.18) 0%, transparent 70%)', pointerEvents: 'none', filter: 'blur(16px)' }} />
              <div style={{ position: 'relative', background: 'linear-gradient(160deg, #141e2e 0%, #0d1520 100%)', border: '2px solid rgba(255,255,255,0.13)', borderRadius: 40, padding: '14px 10px', boxShadow: '0 40px 100px rgba(0,0,0,.7)' }}>
                <div style={{ width: 72, height: 5, background: 'rgba(255,255,255,0.1)', borderRadius: 3, margin: '0 auto 12px' }} />
                <div style={{ background: '#09111A', borderRadius: 28, overflow: 'hidden', padding: '16px 14px' }}>
                  {/* Saguaro Field header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(212,160,23,0.15)', border: '1.5px solid rgba(212,160,23,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: GOLD }}>
                        <IconSaguaro />
                      </div>
                      <div>
                        <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 1.5, color: GOLD }}>SAGUARO</div>
                        <div style={{ fontSize: 7, color: DIM, letterSpacing: 1 }}>FIELD</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 8, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 5, padding: '2px 7px', color: GREEN, fontWeight: 700 }}>● Online</div>
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginBottom: 12 }}>
                    {[
                      { Icon: IconLog,    label: 'Daily Log',  rgb: '59,130,246' },
                      { Icon: IconCamera, label: 'Photos',     rgb: '212,160,23' },
                      { Icon: IconClock,  label: 'Clock In',   rgb: '34,197,94' },
                      { Icon: IconCheck,  label: 'Punch List', rgb: '139,92,246' },
                    ].map(a => (
                      <div key={a.label} style={{ background: `rgba(${a.rgb},.09)`, border: `1px solid rgba(${a.rgb},.25)`, borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 3, color: `rgb(${a.rgb})`, opacity: 0.85 }}><a.Icon /></div>
                        <div style={{ fontSize: 8, fontWeight: 700, color: TEXT }}>{a.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Sage chat bubble */}
                  <div style={{ background: 'rgba(212,160,23,0.07)', border: '1px solid rgba(212,160,23,0.2)', borderRadius: 12, padding: '8px 10px' }}>
                    <div style={{ fontSize: 8, color: GOLD, fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ display: 'inline-flex', color: GOLD }}><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></span>
                      Sage AI
                    </div>
                    <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>&ldquo;Pour on Level 2 is scheduled for Thursday at 6 AM. 3 open RFIs due this week.&rdquo;</div>
                  </div>
                </div>
                <div style={{ width: 60, height: 4, background: 'rgba(255,255,255,0.12)', borderRadius: 2, margin: '12px auto 0' }} />
              </div>
            </div>
          </div>
        </section>

        {/* ── Devices supported ───────────────────────────────────────── */}
        <div style={{ borderTop: '1px solid rgba(245,158,11,0.2)', background: 'rgba(245,158,11,0.04)' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', padding: '18px 32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>Works on every device</span>
              <div className="fa-devices" style={{ display: 'flex', gap: 8 }}>
                {DEVICES.map(d => (
                  <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '5px 12px' }}>
                    <span style={{ color: DIM }}><d.Icon /></span>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: TEXT }}>{d.label}</div>
                      <div style={{ fontSize: 9, color: DIM }}>{d.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Features grid ───────────────────────────────────────────── */}
        <section id="features" style={{ padding: '72px 32px', background: 'linear-gradient(180deg, #09111A 0%, #0a1628 50%, #09111A 100%)' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>Everything In The Field</div>
            <h2 style={{ fontSize: 'clamp(26px, 3vw, 40px)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 12px' }}>Every feature your crew needs, on any device</h2>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.78)', maxWidth: 540, margin: '0 auto' }}>Daily logs to punch lists, GPS time tracking to AI assistance — the full field workflow in one app that installs in seconds.</p>
          </div>

          <div className="fa-features" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            {FEATURES.map(f => (
              <div key={f.title} className="fa-card" style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid rgba(255,255,255,0.1)`, borderLeft: `3px solid rgba(${hexRgb(f.color)},0.7)`, borderRadius: 12, padding: '22px', transition: 'all .2s' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: `rgba(${hexRgb(f.color)},.15)`, border: `1px solid rgba(${hexRgb(f.color)},.4)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: f.color }}>
                    {FEATURE_ICONS[f.title]}
                  </div>
                </div>
                <div style={{ fontWeight: 800, fontSize: 15, color: TEXT, marginBottom: 8 }}>{f.title}</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.78)', lineHeight: 1.65, marginBottom: 14 }}>{f.desc}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {f.pills.map(p => (
                    <span key={p} style={{ fontSize: 9, fontWeight: 700, color: f.color, background: `rgba(${hexRgb(f.color)},.1)`, border: `1px solid rgba(${hexRgb(f.color)},.25)`, borderRadius: 10, padding: '2px 8px', letterSpacing: '0.06em' }}>{p}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          </div>
        </section>

        {/* ── Offline callout ──────────────────────────────────────────── */}
        <section id="offline" style={{ background: 'rgba(34,197,94,0.04)', borderTop: '1px solid rgba(34,197,94,0.12)', borderBottom: '1px solid rgba(34,197,94,0.12)' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 32px', display: 'flex', alignItems: 'center', gap: 40, flexWrap: 'wrap' }}>
            <div style={{ width: 64, height: 64, borderRadius: 20, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: GREEN, flexShrink: 0 }}>
              <IconWifi />
            </div>
            <div style={{ flex: 1, minWidth: 260 }}>
              <h3 style={{ fontSize: 'clamp(20px, 2.5vw, 28px)', fontWeight: 800, margin: '0 0 8px', color: TEXT }}>Designed for no-signal zones</h3>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.82)', margin: 0, lineHeight: 1.65, maxWidth: 520 }}>
                Basements, underground, rural sites, concrete vaults. Saguaro Field queues every action locally using IndexedDB, then syncs the moment signal returns. Your crew never loses a log, photo, or clock punch — no matter where they are.
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {['Daily logs queue offline', 'Photos upload when reconnected', 'Clock punches never lost', 'RFIs sync automatically'].map(t => (
                <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: TEXT }}>
                  <span style={{ color: GREEN, fontWeight: 700, fontSize: 16 }}>✓</span> {t}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Compare ─────────────────────────────────────────────────── */}
        <section id="compare" style={{ padding: '64px 32px', maxWidth: 900, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>How We Compare</div>
            <h2 style={{ fontSize: 'clamp(20px, 2.8vw, 30px)', fontWeight: 700, letterSpacing: '-0.01em', margin: '0 0 8px' }}>Saguaro Field vs Procore vs Buildertrend</h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.78)', margin: 0 }}>Most platforms charge extra for mobile. We include it free.</p>
          </div>

          <div className="fa-compare" style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${BORDER}` }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', background: RAISED }}>
              {['Feature', 'Saguaro', 'Procore', 'Buildertrend'].map((h, i) => (
                <div key={h} style={{ padding: '14px 16px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: i === 1 ? GOLD : DIM, borderRight: i < 3 ? `1px solid ${BORDER}` : 'none', textAlign: i > 0 ? 'center' : 'left' }}>{h}</div>
              ))}
            </div>
            {COMPARE.map((row, i) => (
              <div key={row.feature} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent', borderTop: `1px solid ${BORDER}` }}>
                <div style={{ padding: '12px 16px', fontSize: 13, color: TEXT, borderRight: `1px solid ${BORDER}` }}>{row.feature}</div>
                {[row.saguaro, row.procore, row.buildertrend].map((v, j) => (
                  <div key={j} style={{ padding: '12px 16px', textAlign: 'center', borderRight: j < 2 ? `1px solid ${BORDER}` : 'none' }}>
                    {v
                      ? <span style={{ color: j === 0 ? GREEN : 'rgba(34,197,94,0.6)', fontSize: 16, fontWeight: 700 }}>✓</span>
                      : <span style={{ color: 'rgba(255,255,255,0.18)', fontSize: 16 }}>–</span>
                    }
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>

        {/* ── Install steps ───────────────────────────────────────────── */}
        <section id="install" style={{ background: 'linear-gradient(180deg, #0a1628 0%, #0d1f3c 50%, #0a1628 100%)', borderTop: '1px solid rgba(30,58,95,0.8)', borderBottom: '1px solid rgba(30,58,95,0.8)' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', padding: '64px 32px' }}>
            <div style={{ textAlign: 'center', marginBottom: 40 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>Install in 30 Seconds</div>
              <h2 style={{ fontSize: 'clamp(20px, 2.8vw, 30px)', fontWeight: 700, letterSpacing: '-0.01em', margin: '0 0 8px' }}>No App Store. No download. Just tap and go.</h2>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.78)', maxWidth: 480, margin: '0 auto' }}>Saguaro Field is a Progressive Web App. It installs directly from your browser and runs exactly like a native app — full screen, offline, with home screen icon.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
              {[
                { platform: 'iPhone / iPad', Icon: IconApple,   steps: ['Open Safari', 'Tap Share ↑', 'Add to Home Screen'], color: BLUE },
                { platform: 'Android',       Icon: IconAndroid, steps: ['Open Chrome', 'Tap menu ⋮', 'Install App'], color: GREEN },
                { platform: 'Chrome / Edge', Icon: IconMonitor, steps: ['Open Chrome', 'Click ⊕ in address bar', 'Click Install'], color: GOLD },
                { platform: 'Mac Safari',    Icon: IconMonitor, steps: ['Open Safari 17+', 'File menu', 'Add to Dock…'], color: PURPLE },
              ].map(p => (
                <div key={p.platform} style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '20px' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: `rgba(${hexRgb(p.color)},.12)`, border: `1px solid rgba(${hexRgb(p.color)},.25)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: p.color, marginBottom: 10 }}>
                    <p.Icon />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 12 }}>{p.platform}</div>
                  {p.steps.map((s, i) => (
                    <div key={s} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                      <div style={{ width: 18, height: 18, borderRadius: 5, background: `rgba(${hexRgb(p.color)},.15)`, border: `1px solid rgba(${hexRgb(p.color)},.3)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: p.color, flexShrink: 0 }}>{i + 1}</div>
                      <div style={{ fontSize: 12, color: DIM }}>{s}</div>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <div style={{ textAlign: 'center', marginTop: 28 }}>
              <a href="/field/install" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 24px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: 'rgba(255,255,255,0.7)', fontSize: 13, textDecoration: 'none' }}>
                Full step-by-step install guide →
              </a>
            </div>
          </div>
        </section>

        {/* ── FAQ ─────────────────────────────────────────────────────── */}
        <section id="faq" style={{ padding: '64px 32px', maxWidth: 720, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <h2 style={{ fontSize: 'clamp(20px, 2.8vw, 30px)', fontWeight: 700, letterSpacing: '-0.01em', margin: '0 0 8px' }}>Common questions</h2>
          </div>

          {[
            { q: 'Does the field app cost extra?', a: 'No. Saguaro Field is included at no additional cost with every plan — Starter, Pro, and Enterprise. Your whole crew can install and use it immediately.' },
            { q: 'How does it work without signal?', a: "Saguaro Field uses IndexedDB — your device's local database — to store all actions offline. When you reconnect, everything syncs automatically. You never lose a daily log, photo, or clock punch." },
            { q: 'Do my workers need to create accounts?', a: "Field workers log in using their Saguaro account (the same one used in the office). No separate app account is needed. Permissions are managed by the admin." },
            { q: "What's the difference between a PWA and a regular app?", a: "A Progressive Web App installs directly from the browser with no App Store download needed. It looks and behaves exactly like a native app — full screen, home screen icon, works offline — but updates automatically and works on every platform from one codebase." },
            { q: 'Can supervisors see the whole crew?', a: 'Yes. The clock-in screen shows GPS-verified status for every crew member on your project in real time. Foremen can see who is on site, when they clocked in, and where from.' },
            { q: "Does it work on older phones?", a: 'Saguaro Field works on any device with a modern browser — Chrome 80+, Safari 14+, Firefox 78+. That covers virtually every iPhone and Android device from the past 4 years.' },
          ].map((faq, i) => (
            <div key={i} style={{ borderBottom: `1px solid ${BORDER}` }}>
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                style={{ width: '100%', background: 'none', border: 'none', color: TEXT, fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: '18px 0', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                {faq.q}
                <span style={{ fontSize: 18, color: GOLD, flexShrink: 0, transform: openFaq === i ? 'rotate(45deg)' : 'none', transition: 'transform .2s', display: 'inline-block' }}>+</span>
              </button>
              {openFaq === i && (
                <p style={{ margin: '0 0 18px', fontSize: 13.5, color: 'rgba(255,255,255,0.85)', lineHeight: 1.65 }}>{faq.a}</p>
              )}
            </div>
          ))}
        </section>

        {/* ── CTA ─────────────────────────────────────────────────────── */}
        <section style={{ padding: '64px 32px', textAlign: 'center', maxWidth: 660, margin: '0 auto' }}>
          <div style={{ width: 64, height: 64, borderRadius: 20, background: 'rgba(212,160,23,0.12)', border: '1px solid rgba(212,160,23,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: GOLD, margin: '0 auto 20px' }}>
            <IconPhone />
          </div>
          <h2 style={{ fontSize: 'clamp(24px, 3vw, 36px)', fontWeight: 700, letterSpacing: '-0.01em', margin: '0 0 12px', lineHeight: 1.1 }}>
            Put your office in every foreman&apos;s pocket
          </h2>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.78)', margin: '0 0 28px', lineHeight: 1.6 }}>
            Start your 30-day free trial. Saguaro Field is included. Your crew can install it on any device in 30 seconds.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
            <a href="/signup" style={{ padding: '14px 36px', background: `linear-gradient(135deg,#F59E0B,#EF4444)`, borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 900, textDecoration: 'none', boxShadow: `0 8px 36px rgba(245,158,11,0.5)` }}>
              Start Free Trial →
            </a>
            <a href="/field" style={{ padding: '13px 24px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: 'rgba(255,255,255,0.88)', fontSize: 14, textDecoration: 'none' }}>
              Open Field App
            </a>
          </div>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            {['No credit card', '30-day free trial', 'Cancel anytime', 'Whole crew included'].map(t => (
              <span key={t} style={{ fontSize: 12, color: DIM, display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ color: GREEN }}>✓</span>{t}
              </span>
            ))}
          </div>
        </section>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <footer style={{ borderTop: `1px solid ${BORDER}`, padding: '32px 24px', background: 'rgba(9,17,26,.8)', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 24, flexWrap: 'wrap', marginBottom: 20 }}>
            {[['Home', '/'], ['Features', '/#features'], ['Pricing', '/pricing'], ['Compare Procore', '/compare/procore'], ['Open Field App', '/field'], ['Install Guide', '/field/install']].map(([l, h]) => (
              <a key={h} href={h} style={{ fontSize: 12, color: DIM, textDecoration: 'none' }}>{l}</a>
            ))}
          </div>
          <div style={{ fontSize: 12, color: '#4a5f7a' }}>© {new Date().getFullYear()} Saguaro Control Systems. All rights reserved.</div>
        </footer>

      </div>
    </div>
  );
}
