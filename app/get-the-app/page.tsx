import type { Metadata } from 'next';
import Link from 'next/link';
import { GoldButton, PremiumFX } from '@/components/ui/premium';
import { PhoneFrame, LaptopFrame } from '@/components/marketing/DeviceFrame';
import MarketingNav from '@/components/MarketingNav';
import { TRIAL_DAYS } from '@/lib/plans';

// TestFlight public invite — owner-controlled. This is the live open-beta link
// already published across the site (see components/GetAppBadge.tsx); update
// here if the invite ever rotates. Never invent a different TestFlight URL.
const TESTFLIGHT_URL = 'https://testflight.apple.com/join/jg7jdtwx';

export const metadata: Metadata = {
  title: 'Get Saguaro Control Systems — Native iOS App | Now in TestFlight Beta',
  description:
    'Saguaro Control Systems is a native iPhone & iPad app — now in open beta on TestFlight. GPS clock-in, daily logs, photos, RFIs, punch lists, offline mode, and an AI field assistant. Free during the beta.',
  keywords: [
    'construction field app',
    'iOS construction app',
    'TestFlight beta construction',
    'GPS clock in construction',
    'daily logs app',
    'construction mobile app',
  ],
  openGraph: {
    title: 'Saguaro Control Systems — Native iOS App, Now in TestFlight Beta',
    description:
      'Native iPhone & iPad field app for construction crews. Works offline. Join the TestFlight beta free.',
  },
};

export default function GetTheAppPage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --dark:   var(--bg-base);
          --gold:   var(--brand-primary);
          --text:   #FFFFFF;
          --dim:    #D4D4D8;
          --border: rgba(255,255,255,0.12);
          --raised: var(--bg-surface);
          --green:  #2CFF7A;
          --gold-dim: var(--brand-primary-12);
          --gold-glow: var(--brand-primary-25);
        }

        body { background: var(--dark); }

        /* ── NAV ── */
        .nav {
          position: fixed;
          top: 0; left: 0; right: 0;
          z-index: 100;
          display: flex;
          align-items: center;
          padding: 0 32px;
          height: 64px;
          background: rgba(20,20,22,0.92);
          backdrop-filter: blur(12px);
          border-bottom: 1px solid rgba(255,255,255,0.12);
        }
        .nav-logo { display: flex; align-items: center; text-decoration: none; }
        .nav-logo img { height: 40px;  }
        .nav-spacer { flex: 1; }
        .nav-login {
          color: var(--dim);
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
          margin-right: 20px;
          transition: color .2s;
        }
        .nav-login:hover { color: var(--text); }
        .nav-cta {
          background: var(--gold);
          color: #0A0A00;
          text-decoration: none;
          font-size: 13px;
          font-weight: 600;
          padding: 9px 20px;
          border-radius: 8px;
          letter-spacing: .01em;
          transition: opacity .2s;
        }
        .nav-cta:hover { opacity: .9; }

        /* ── PAGE ── */
        .page {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
          background: var(--dark);
          color: var(--text);
          min-height: 100vh;
        }

        /* ── HERO ── */
        .hero {
          position: relative;
          min-height: 100vh;
          display: flex;
          align-items: center;
          overflow: hidden;
          padding: 100px 32px 80px;
        }
        .hero-bg-gold {
          position: absolute;
          bottom: -100px; left: -150px;
          width: 700px; height: 700px;
          background: none;
          pointer-events: none;
        }
        .hero-bg-blue {
          position: absolute;
          top: -80px; right: -100px;
          width: 600px; height: 600px;
          background: radial-gradient(circle, rgba(255,255,255,0.03) 0%, transparent 68%);
          pointer-events: none;
        }
        .hero-inner {
          max-width: 1200px;
          margin: 0 auto;
          width: 100%;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 80px;
          align-items: center;
          position: relative;
          z-index: 1;
        }
        .hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: transparent;
          border: 1px solid rgba(255,255,255,0.14);
          border-radius: 100px;
          padding: 6px 14px;
          margin-bottom: 28px;
          font-size: 10.5px;
          font-weight: 500;
          color: var(--dim);
        }
        .hero-badge-dot {
          width: 7px; height: 7px;
          border-radius: 50%;
          background: var(--green);
          animation: pulse 2s ease-in-out infinite;
        }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.6;transform:scale(0.85)} }
        .hero-h1 {
          font-size: clamp(32px, 4.5vw, 44px);
          font-weight: 800;
          line-height: 1.12;
          letter-spacing: -0.02em;
          margin-bottom: 20px;
          color: var(--text);
        }
        /* House display treatment — gold text-shine on ONE key phrase per heading. */
        .gold-gradient {
          background: linear-gradient(100deg, var(--brand-primary) 6%, var(--brand-primary-strong) 50%, var(--brand-primary) 92%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          color: transparent;
        }
        .hero-sub {
          font-size: 15px;
          font-weight: 400;
          color: var(--dim);
          line-height: 1.7;
          max-width: 480px;
          margin-bottom: 40px;
        }
        .hero-ctas {
          display: flex;
          gap: 14px;
          flex-wrap: wrap;
          margin-bottom: 40px;
        }
        .btn-primary {
          background: var(--gold);
          color: #0A0A00;
          text-decoration: none;
          font-size: 14px;
          font-weight: 600;
          padding: 11px 24px;
          border-radius: 8px;
          letter-spacing: .01em;
          transition: opacity .2s;
        }
        .btn-primary:hover { opacity: .92; }
        .btn-ghost {
          background: transparent;
          color: var(--dim);
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
          padding: 11px 22px;
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.14);
          transition: border-color .2s, color .2s;
        }
        .btn-ghost:hover { border-color: rgba(255,255,255,0.28); color: var(--text); }
        .trust-pills {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }
        .trust-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(255,255,255,0.05);
          border: 1px solid var(--border);
          border-radius: 100px;
          padding: 6px 14px;
          font-size: 12px;
          font-weight: 500;
          color: var(--dim);
        }

        /* ── DEVICE SHOWCASE — real dark screenshots in machined frames ── */
        /* Enlarged 24 Aug 2026: at 185/210px wide the app text inside these
           frames was unreadable — objectFit is 'cover', so glyph size is set
           purely by frame WIDTH. Cropping the screenshots would not have helped;
           only bigger frames do. Container grew to match, or the taller phones
           would overflow it. */
        /* LAYOUT: the laptop sits ABOVE the phones, not behind them.
           Enlarging the phones (185->233, 210->268) made them cover the laptop
           almost entirely — its screen is the top of the frame, and the phones
           were anchored to the top while the laptop was anchored to the bottom,
           so the two fought for the same band. Now the laptop is top-anchored
           and centred, the phones are bottom-anchored at the edges, and they
           overlap only its base. The login form is centred in the laptop screen,
           which is exactly the part that stays clear. */
        .devices {
          position: relative;
          height: 760px;
        }
        .dev-slot-phone-a { position: absolute; right: 0; bottom: 0; z-index: 3; animation: floatA 5s ease-in-out infinite; }
        .dev-slot-phone-b { position: absolute; left: 0; bottom: 34px; z-index: 2; animation: floatB 5.5s ease-in-out infinite 0.4s; }
        .dev-slot-laptop  { position: absolute; left: 50%; transform: translateX(-50%); top: 0; z-index: 1; animation: floatC 6s ease-in-out infinite 1s; }
        @keyframes floatA { 0%,100%{transform:translateY(0) rotate(2deg)} 50%{transform:translateY(-12px) rotate(2deg)} }
        @keyframes floatB { 0%,100%{transform:translateY(0) rotate(-2deg)} 50%{transform:translateY(-9px) rotate(-2deg)} }
        @keyframes floatC { 0%,100%{transform:translateX(-50%) translateY(0)} 50%{transform:translateX(-50%) translateY(-6px)} }

        /* ── NUMBERS BAR ── */
        .numbers-bar {
          background: var(--raised);
          border-top: 1px solid var(--border);
          border-bottom: 1px solid var(--border);
          padding: 56px 32px;
        }
        .numbers-inner {
          max-width: 1200px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: repeat(4,1fr);
          gap: 0;
        }
        .stat-item {
          text-align: center;
          padding: 8px 24px;
        }
        .stat-item + .stat-item {
          border-left: 1px solid rgba(255,255,255,0.08);
        }
        .stat-number {
          font-size: clamp(22px, 3vw, 28px);
          font-weight: 600;
          color: var(--text);
          line-height: 1;
          margin-bottom: 8px;
          letter-spacing: -.02em;
        }
        .stat-label {
          font-size: 13px;
          color: var(--dim);
          font-weight: 500;
        }

        /* ── SECTION HEADER ── */
        .section-wrap {
          max-width: 1200px;
          margin: 0 auto;
          padding: 80px 32px;
        }
        .section-header {
          text-align: center;
          margin-bottom: 56px;
        }
        .section-h2 {
          font-size: clamp(20px, 2.4vw, 26px);
          font-weight: 600;
          letter-spacing: -.02em;
          color: var(--text);
          margin-bottom: 14px;
          line-height: 1.2;
        }
        .section-sub {
          font-size: 15px;
          color: var(--dim);
          line-height: 1.65;
          max-width: 560px;
          margin: 0 auto;
        }

        /* ── FEATURE GRID ── */
        .feature-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 44px 48px;
        }
        .feat-card {
          background: transparent;
          padding: 0;
        }
        .feat-icon-wrap {
          width: 40px; height: 40px;
          border-radius: 10px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.10);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 16px;
        }
        .feat-icon-wrap svg {
          width: 20px; height: 20px;
          stroke: var(--text);
          fill: none;
          stroke-width: 1.6;
          stroke-linecap: round;
          stroke-linejoin: round;
        }
        .feat-title {
          font-size: 15px;
          font-weight: 600;
          color: var(--text);
          margin-bottom: 8px;
        }
        .feat-desc {
          font-size: 13.5px;
          color: var(--dim);
          line-height: 1.7;
          font-weight: 400;
        }

        /* ── HOW TO INSTALL ── */
        .install-section {
          background: var(--raised);
          border-top: 1px solid var(--border);
          border-bottom: 1px solid var(--border);
        }
        .platform-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 20px;
        }
        .platform-card {
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 14px;
          padding: 28px;
          transition: border-color .2s;
        }
        .platform-card:hover {
          border-color: rgba(255,255,255,0.14);
        }
        .platform-header {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 24px;
        }
        .platform-icon {
          width: 44px; height: 44px;
          border-radius: 11px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.10);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .platform-icon svg {
          width: 22px; height: 22px;
          stroke: var(--text);
          fill: none;
          stroke-width: 1.5;
          stroke-linecap: round;
          stroke-linejoin: round;
        }
        .platform-name {
          font-size: 16px;
          font-weight: 600;
          color: var(--text);
        }
        .steps-list {
          list-style: none;
          margin-bottom: 20px;
        }
        .step-item {
          display: flex;
          gap: 14px;
          align-items: flex-start;
          margin-bottom: 14px;
        }
        .step-num {
          width: 26px; height: 26px;
          border-radius: 50%;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.12);
          color: var(--text);
          font-size: 12px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          margin-top: 1px;
        }
        .step-text {
          font-size: 14px;
          color: var(--dim);
          line-height: 1.6;
          padding-top: 3px;
        }
        .platform-note {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(44,255,122,0.08);
          border: 1px solid rgba(44,255,122,0.2);
          border-radius: 8px;
          padding: 10px 14px;
          font-size: 12px;
          color: var(--green);
          font-weight: 500;
        }
        .platform-note::before {
          content: '✓';
          font-weight: 700;
          font-size: 13px;
        }

        /* ── COMPARISON ── */
        .compare-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          border-radius: 14px;
          overflow: hidden;
          border: 1px solid var(--border);
        }
        .compare-table thead tr { background: #1c1c1e; }
        .compare-table th {
          padding: 16px 24px;
          font-size: 13px;
          font-weight: 700;
          color: var(--dim);
          text-align: left;
          border-bottom: 1px solid var(--border);
        }
        .compare-table th.saguaro-col {
          background: color-mix(in srgb, var(--brand-primary) 8%, transparent);
          color: var(--gold);
          border-left: 2px solid var(--gold);
        }
        .compare-table td {
          padding: 14px 24px;
          font-size: 14px;
          color: var(--dim);
          border-bottom: 1px solid rgba(255,255,255,0.12);
          background: var(--raised);
        }
        .compare-table tr:last-child td { border-bottom: none; }
        .compare-table td.feature-col {
          color: var(--text);
          font-weight: 500;
        }
        .compare-table td.app-store-col { color: #D4D4D8; }
        .compare-table td.saguaro-col {
          background: color-mix(in srgb, var(--brand-primary) 5%, transparent);
          color: var(--text);
          font-weight: 600;
          border-left: 2px solid var(--brand-primary-35);
        }
        .compare-table tr:hover td.saguaro-col { background: color-mix(in srgb, var(--brand-primary) 9%, transparent); }
        .compare-table td.bad { color: #FF3B30; }
        .compare-table td.good { color: var(--green); }

        /* ── TESTIMONIALS ── */
        .testimonials-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
        }
        .testi-card {
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 12px;
          padding: 28px 24px;
        }
        .testi-quote {
          font-size: 15px;
          color: var(--text);
          line-height: 1.7;
          margin-bottom: 20px;
          font-style: italic;
        }
        .testi-author {
          font-size: 13px;
          color: var(--dim);
          font-weight: 500;
        }

        /* ── FINAL CTA ── */
        .final-cta {
          background: var(--raised);
          border-top: 1px solid var(--border);
        }
        .final-cta-inner {
          max-width: 700px;
          margin: 0 auto;
          padding: 100px 32px;
          text-align: center;
        }
        .final-h2 {
          font-size: clamp(24px, 3.4vw, 34px);
          font-weight: 800;
          color: var(--text);
          letter-spacing: -0.02em;
          margin-bottom: 36px;
          line-height: 1.15;
        }
        .final-sub {
          margin-top: 20px;
          font-size: 14px;
          color: var(--dim);
        }
        .final-sub a {
          color: var(--gold);
          text-decoration: underline;
          text-underline-offset: 3px;
        }
        .trust-note {
          margin-top: 28px;
          font-size: 13px;
          color: rgba(203,213,225,0.6);
          line-height: 1.6;
        }

        /* ── FOOTER ── */
        .footer {
          background: var(--bg-surface);
          border-top: 1px solid var(--border);
          padding: 48px 32px;
        }
        .footer-inner {
          max-width: 1200px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 24px;
        }
        .footer-left { display:flex;align-items:center;gap:16px; }
        .footer-logo img { height:32px; }
        .footer-copy { font-size:13px;color:rgba(203,213,225,0.4); }
        .footer-links { display:flex;gap:24px;flex-wrap:wrap; }
        .footer-link {
          font-size:13px;
          color:rgba(203,213,225,0.5);
          text-decoration:none;
          transition:color .2s;
        }
        .footer-link:hover { color:var(--text); }

        /* ── RESPONSIVE ── */
        @media (max-width: 1024px) {
          .numbers-inner { grid-template-columns: repeat(2,1fr); gap: 32px 0; }
          .stat-item + .stat-item { border-left: none; }
          .feature-grid { grid-template-columns: repeat(2,1fr); }
          .testimonials-grid { grid-template-columns: 1fr; gap: 14px; }
        }
        @media (max-width: 768px) {
          .nav { padding: 0 16px; }
          .hero { padding: 80px 16px 60px; }
          .hero-inner { grid-template-columns: 1fr; gap: 48px; }
          .devices { height: 640px; order: -1; }
          .dev-slot-phone-b { display: none; }
          .dev-slot-laptop { left: 0; }
          .numbers-bar { padding: 32px 16px; }
          .numbers-inner { grid-template-columns: repeat(2,1fr); }
          .section-wrap { padding: 56px 16px; }
          .feature-grid { grid-template-columns: 1fr; }
          .platform-grid { grid-template-columns: 1fr; }
          .compare-table th, .compare-table td { padding: 12px 14px; font-size: 13px; }
          .footer-inner { flex-direction: column; align-items: flex-start; gap: 16px; }
          .hero-ctas { flex-direction: column; }
          .btn-primary, .btn-ghost { text-align: center; }
        }
        @media (max-width: 480px) {
          .numbers-inner { grid-template-columns: 1fr 1fr; }
          .stat-number { font-size: 28px; }
          .hero-h1 { font-size: 34px; }
          .devices { display: none; }
        }
      ` }} />

      <div className="mkt-page page">
        <PremiumFX />

        {/* ── NAV ── */}
        {/* One professional nav across every marketing page (fixed, 58px). */}
        <MarketingNav />
        <div style={{ height: 58 }} />

        {/* ── HERO ── */}
        <section className="hero">
          <div className="hero-bg-gold" />
          <div className="hero-bg-blue" />
          <div className="hero-inner">

            {/* Copy */}
            <div>
              <div className="hero-badge">
                <div className="hero-badge-dot" />
                Now in Beta — TestFlight for iPhone &amp; iPad
              </div>

              <h1 className="hero-h1">
                The Field App That<br />
                <span className="gold-gradient">Actually Works</span> on<br />
                Job Sites.
              </h1>

              <p className="hero-sub">
                GPS clock-in. Daily logs. Photos. RFIs. Punch lists. Offline mode. An AI field assistant in your pocket. A true native iPhone &amp; iPad app — now in open beta on TestFlight, free for your whole crew.
              </p>

              <div className="hero-ctas">
                <GoldButton href={TESTFLIGHT_URL}>Join the iOS Beta</GoldButton>
                <a href="#how-to-install" className="btn-ghost">How to Install</a>
              </div>

              {/* Official-style TestFlight availability badge — plain text on a
                  machined pill. No fabricated Apple artwork, ever. */}
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid rgba(255,255,255,0.18)', borderRadius: 8, padding: '7px 14px', marginBottom: 40 }}>
                <span style={{ fontSize: 9, fontWeight: 500, color: 'var(--dim)' }}>Available on</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', letterSpacing: '0.01em' }}>TestFlight</span>
              </div>

              <div className="trust-pills">
                <span className="trust-pill">✓ Native iPhone &amp; iPad</span>
                <span className="trust-pill">✓ Works Offline</span>
                <span className="trust-pill">✓ Live on TestFlight</span>
                <span className="trust-pill">✓ Free During Beta</span>
              </div>
            </div>

            {/* Devices — REAL screenshots, shipped in /public/marketing/, replacing
                the placeholders that used to read "Drop phone-today.png here".
                  phone-takeoff.png  iPhone 1290x2796 — Takeoff Studio
                  phone-project.png  iPhone 1290x2796 — project overview
                  web-login.png      the real /login page at 1440x900

                The middle frame is a LAPTOP (430x270, aspect 1.59), so it takes a
                DESKTOP capture. A portrait phone screenshot dropped in here
                letterboxes into a sliver with black rails either side — which is
                why the login shot is the web one, not the iOS one. */}
            <div className="devices">
              <div className="dev-slot-phone-b">
                <PhoneFrame src="/marketing/phone-takeoff.webp" alt="Takeoff Studio on iPhone — turn a blueprint into a priced estimate" width={232} />
              </div>
              <div className="dev-slot-phone-a">
                <PhoneFrame src="/marketing/phone-project.webp" alt="Project overview on iPhone — contract value, quick add, progress" width={268} />
              </div>
              <div className="dev-slot-laptop">
                <LaptopFrame src="/marketing/web-login.webp" alt="Signing in to Saguaro Control Systems on the web" width={536} height={336} />
              </div>
            </div>
          </div>
        </section>

        {/* ── NUMBERS BAR ── */}
        <div className="numbers-bar">
          <div className="numbers-inner">
            <div className="stat-item">
              <div className="stat-number">iOS</div>
              <div className="stat-label">Native iPhone &amp; iPad</div>
            </div>
            <div className="stat-item">
              <div className="stat-number">100%</div>
              <div className="stat-label">Works Offline</div>
            </div>
            <div className="stat-item">
              <div className="stat-number">Beta</div>
              <div className="stat-label">Live on TestFlight Now</div>
            </div>
            <div className="stat-item">
              <div className="stat-number">Free</div>
              <div className="stat-label">During the Beta</div>
            </div>
          </div>
        </div>

        {/* ── WHAT'S INCLUDED ── */}
        <div className="section-wrap">
          <div className="section-header">
            <h2 className="section-h2">Everything Your Crew Needs on Site</h2>
            <p className="section-sub">Six tools that replace the clipboard, the group text, and the Friday timesheet chase — all in one native app, right in your crew&apos;s pocket.</p>
          </div>

          <div className="feature-grid">
            <div className="feat-card">
              <div className="feat-icon-wrap">
                <svg viewBox="0 0 20 20"><path d="M10 2a5 5 0 100 10A5 5 0 0010 2zm0 7a2 2 0 110-4 2 2 0 010 4z" /><path d="M10 12v6M7 16h6" /></svg>
              </div>
              <div className="feat-title">GPS Clock-In</div>
              <p className="feat-desc">Crew taps once. Location verified. Time stamped. No paper timesheets. Syncs to payroll automatically.</p>
            </div>
            <div className="feat-card">
              <div className="feat-icon-wrap">
                <svg viewBox="0 0 20 20"><rect x="3" y="3" width="14" height="14" rx="2" /><path d="M7 9h6M7 13h4" /></svg>
              </div>
              <div className="feat-title">Daily Logs</div>
              <p className="feat-desc">Photo + notes in 60 seconds. Auto-dated, job-stamped, searchable forever. Your office sees it instantly.</p>
            </div>
            <div className="feat-card">
              <div className="feat-icon-wrap">
                <svg viewBox="0 0 20 20"><path d="M5 10l4 4 6-7" /><circle cx="10" cy="10" r="8" /></svg>
              </div>
              <div className="feat-title">Punch Lists</div>
              <p className="feat-desc">Create, assign, and resolve punch list items from the field. Attach photos, set due dates, notify subs.</p>
            </div>
            <div className="feat-card">
              <div className="feat-icon-wrap">
                <svg viewBox="0 0 20 20"><path d="M3 6l7-3 7 3v9a2 2 0 01-2 2H5a2 2 0 01-2-2V6z" /><path d="M8 17v-6h4v6" /></svg>
              </div>
              <div className="feat-title">AI Field Assistant (Sage)</div>
              <p className="feat-desc">Ask Sage anything: &quot;Where&apos;s the approved RFI for door 201?&quot; She finds it. Draft RFIs by photo — snap a problem, Sage writes the RFI.</p>
            </div>
            <div className="feat-card">
              <div className="feat-icon-wrap">
                <svg viewBox="0 0 20 20"><path d="M2 10a8 8 0 1016 0A8 8 0 002 10z" /><path d="M10 6v4l3 3" /><path d="M6 2l-2-2M14 2l2-2" /></svg>
              </div>
              <div className="feat-title">Works Completely Offline</div>
              <p className="feat-desc">Signal dead on site? Keeps working. Daily logs, photos, clock-ins — everything queues and syncs the moment you&apos;re back online.</p>
            </div>
            <div className="feat-card">
              <div className="feat-icon-wrap">
                <svg viewBox="0 0 20 20"><path d="M4 4h12v8H4z" /><path d="M8 16h4M10 12v4" /><path d="M7 8l2 2 4-4" /></svg>
              </div>
              <div className="feat-title">RFIs + Inspections</div>
              <p className="feat-desc">Submit RFIs from the field with photos. Run inspection checklists. Get instant notifications when responses come back.</p>
            </div>
          </div>
        </div>

        {/* ── HOW TO INSTALL ── */}
        <section className="install-section" id="how-to-install">
          <div className="section-wrap">
            <div className="section-header">
              <h2 className="section-h2">Install on iPhone or iPad via TestFlight</h2>
              <p className="section-sub">Saguaro Control Systems is in open beta on TestFlight. Two minutes and it&apos;s on your phone.</p>
            </div>

            <div className="platform-grid">

              {/* iPhone / iPad — TestFlight steps */}
              <div className="platform-card">
                <div className="platform-header">
                  <div className="platform-icon">
                    <svg viewBox="0 0 24 24">
                      <rect x="5" y="1" width="14" height="22" rx="3" />
                      <circle cx="12" cy="19.5" r="1" fill="#FFFFFF" stroke="none" />
                      <path d="M9 4h6" />
                    </svg>
                  </div>
                  <div className="platform-name">iPhone &amp; iPad</div>
                </div>
                <ol className="steps-list">
                  <li className="step-item"><div className="step-num">1</div><span className="step-text">Install Apple&apos;s free <strong>TestFlight</strong> app from the App Store.</span></li>
                  <li className="step-item"><div className="step-num">2</div><span className="step-text">Open <strong>testflight.apple.com/join/jg7jdtwx</strong> on your iPhone.</span></li>
                  <li className="step-item"><div className="step-num">3</div><span className="step-text">Tap <strong>&quot;Install&quot;</strong> in TestFlight — Saguaro Control Systems lands on your home screen.</span></li>
                  <li className="step-item"><div className="step-num">4</div><span className="step-text">Open it, sign in, and you&apos;re on the jobsite.</span></li>
                </ol>
                <div className="platform-note">iOS 15+ · iPhone &amp; iPad · Free during the beta</div>
              </div>

              {/* Join CTA */}
              <div className="platform-card">
                <div className="platform-header">
                  <div className="platform-icon">
                    <svg viewBox="0 0 24 24">
                      <path d="M12 3v12" />
                      <path d="M8 11l4 4 4-4" />
                      <rect x="4" y="17" width="16" height="4" rx="1" />
                    </svg>
                  </div>
                  <div className="platform-name">Join the Beta Now</div>
                </div>
                <p className="feat-desc" style={{ marginBottom: 20 }}>Saguaro Control Systems is in open beta on TestFlight. Tap below on your iPhone or iPad to get in — it&apos;s free while we&apos;re in beta.</p>
                <a href={TESTFLIGHT_URL} target="_blank" rel="noopener noreferrer" className="btn-primary" style={{ display: 'inline-block' }}>Join the iOS Beta →</a>
                <div className="platform-note" style={{ marginTop: 16 }}>Public TestFlight link · No charge</div>
              </div>

            </div>
          </div>
        </section>

        {/* (Removed the PWA-vs-App-Store comparison — Saguaro Control Systems is now a native iOS app on TestFlight.) */}

        {/* ── TESTIMONIALS ── */}
        <div style={{ background: 'var(--raised)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
          <div className="section-wrap">
            <div className="section-header">
              <h2 className="section-h2">Field Crews Love It</h2>
              <p className="section-sub">From superintendents to foremen — real feedback from the job site.</p>
            </div>

            <div className="testimonials-grid">
              <div className="testi-card">
                <p className="testi-quote">&quot;I had the whole crew of 14 on the beta in under 10 minutes — just texted them the TestFlight link. The GPS clock-in alone saves me an hour of timesheet chasing every Friday.&quot;</p>
                <div className="testi-author">Jake T., Superintendent — Mesa, AZ</div>
              </div>
              <div className="testi-card">
                <p className="testi-quote">&quot;The offline mode is huge. We work in basements and dead zones constantly. With Procore we lost data. With this we lose nothing.&quot;</p>
                <div className="testi-author">Maria S., Foreman — Las Vegas, NV</div>
              </div>
              <div className="testi-card">
                <p className="testi-quote">&quot;My foremen submit daily logs and photos before they even leave the job site. I used to beg for them on Fridays.&quot;</p>
                <div className="testi-author">Carlos M., Project Manager — San Antonio, TX</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── FINAL CTA ── */}
        <section className="final-cta">
          <div className="final-cta-inner">
            <h2 className="final-h2">30 Seconds Away From a <span className="gold-gradient">Better</span> Job Site</h2>
            <a href={TESTFLIGHT_URL} target="_blank" rel="noopener noreferrer" className="btn-primary" style={{ display: 'inline-block' }}>
              Join the iOS Beta →
            </a>
            <div className="final-sub">
              Or <Link href="/signup">start a full company trial →</Link>
            </div>
            <div className="trust-note">
              Your crew gets the app free during the beta. Managers get the full platform free for {TRIAL_DAYS} days.<br />
              No credit card required.
            </div>
          </div>
        </section>

        {/* ── FOOTER ── */}
        <footer className="footer">
          <div className="footer-inner">
            <div className="footer-left">
              <div className="footer-logo">
                <img src="/logo-full.jpg" alt="Saguaro" height={32} style={{ }} />
              </div>
              <span className="footer-copy">© {new Date().getFullYear()} Saguaro Control Systems. All rights reserved.</span>
            </div>
            <div className="footer-links">
              <Link href="/product" className="footer-link">Product</Link>
              <Link href="/pricing" className="footer-link">Pricing</Link>
              <Link href="/get-the-app" className="footer-link">The App</Link>
              <Link href="/compare/procore" className="footer-link">vs Procore</Link>
              <Link href="/privacy" className="footer-link">Privacy</Link>
              <Link href="/terms" className="footer-link">Terms</Link>
            </div>
          </div>
        </footer>

      </div>
    </>
  );
}
