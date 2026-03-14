import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Get the App — Saguaro Field | No App Store Required',
  description:
    'Install Saguaro Field on iPhone, Android, iPad, Mac, or Windows in 30 seconds. No App Store. GPS clock-in, daily logs, offline mode, AI field assistant — free for your whole crew.',
  keywords: [
    'construction field app',
    'PWA construction',
    'no app store field app',
    'GPS clock in construction',
    'daily logs app',
    'construction mobile app',
  ],
  openGraph: {
    title: 'Saguaro Field — Install in 30 Seconds, No App Store',
    description:
      'Free field app for construction crews. Works offline. Installs instantly. No IT required.',
  },
};

export default function GetTheAppPage() {
  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --dark:   #0d1117;
          --gold:   #F59E0B;
          --text:   #F8FAFC;
          --dim:    #CBD5E1;
          --border: #1E3A5F;
          --raised: #0F172A;
          --green:  #22c55e;
          --gold-dim: rgba(245,158,11,0.12);
          --gold-glow: rgba(245,158,11,0.25);
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
          background: rgba(13,17,23,0.92);
          backdrop-filter: blur(12px);
          border-bottom: 1px solid rgba(30,58,95,0.6);
        }
        .nav-logo { display: flex; align-items: center; text-decoration: none; }
        .nav-logo img { height: 40px; mix-blend-mode: screen; }
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
          color: #0d1117;
          text-decoration: none;
          font-size: 13px;
          font-weight: 700;
          padding: 9px 20px;
          border-radius: 8px;
          letter-spacing: .02em;
          transition: opacity .2s, transform .15s;
        }
        .nav-cta:hover { opacity: .9; transform: translateY(-1px); }

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
          background: radial-gradient(circle, rgba(245,158,11,0.18) 0%, transparent 65%);
          pointer-events: none;
        }
        .hero-bg-blue {
          position: absolute;
          top: -80px; right: -100px;
          width: 600px; height: 600px;
          background: radial-gradient(circle, rgba(30,58,95,0.5) 0%, transparent 65%);
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
          background: rgba(34,197,94,0.12);
          border: 1px solid rgba(34,197,94,0.35);
          border-radius: 100px;
          padding: 6px 16px;
          margin-bottom: 28px;
          font-size: 11px;
          font-weight: 700;
          color: var(--green);
          letter-spacing: .08em;
          text-transform: uppercase;
        }
        .hero-badge-dot {
          width: 7px; height: 7px;
          border-radius: 50%;
          background: var(--green);
          animation: pulse 2s ease-in-out infinite;
        }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.6;transform:scale(0.85)} }
        .hero-h1 {
          font-size: clamp(38px, 5vw, 64px);
          font-weight: 800;
          line-height: 1.05;
          letter-spacing: -.025em;
          margin-bottom: 24px;
          color: var(--text);
        }
        .hero-h1 .gold-gradient {
          background: linear-gradient(135deg, #F59E0B 0%, #FCD34D 50%, #F59E0B 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .hero-sub {
          font-size: 17px;
          font-weight: 400;
          color: var(--dim);
          line-height: 1.75;
          max-width: 480px;
          margin-bottom: 44px;
        }
        .hero-ctas {
          display: flex;
          gap: 14px;
          flex-wrap: wrap;
          margin-bottom: 40px;
        }
        .btn-primary {
          background: var(--gold);
          color: #0d1117;
          text-decoration: none;
          font-size: 15px;
          font-weight: 700;
          padding: 14px 28px;
          border-radius: 10px;
          letter-spacing: .01em;
          transition: opacity .2s, transform .15s, box-shadow .2s;
          box-shadow: 0 4px 20px rgba(245,158,11,0.35);
        }
        .btn-primary:hover { opacity: .92; transform: translateY(-2px); box-shadow: 0 8px 30px rgba(245,158,11,0.45); }
        .btn-ghost {
          background: transparent;
          color: var(--text);
          text-decoration: none;
          font-size: 15px;
          font-weight: 600;
          padding: 14px 28px;
          border-radius: 10px;
          border: 1px solid var(--border);
          transition: border-color .2s, background .2s;
        }
        .btn-ghost:hover { border-color: var(--gold); background: rgba(245,158,11,0.06); }
        .trust-pills {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }
        .trust-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(15,23,42,0.8);
          border: 1px solid var(--border);
          border-radius: 100px;
          padding: 6px 14px;
          font-size: 12px;
          font-weight: 500;
          color: var(--dim);
        }

        /* ── DEVICE SHOWCASE ── */
        .devices {
          position: relative;
          height: 520px;
        }

        /* Phone */
        .dev-phone {
          position: absolute;
          right: 20px; top: 0;
          width: 168px; height: 360px;
          background: linear-gradient(160deg, #1a2840 0%, #0f1a2e 100%);
          border-radius: 38px;
          border: 2px solid rgba(255,255,255,0.12);
          box-shadow: 0 32px 72px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.07), 0 0 0 1px rgba(0,0,0,0.3);
          overflow: hidden;
          animation: floatPhone 5s ease-in-out infinite;
        }
        @keyframes floatPhone { 0%,100%{transform:translateY(0) rotate(3deg)} 50%{transform:translateY(-14px) rotate(3deg)} }
        .dev-phone::before {
          content:'';
          position:absolute;
          top:11px; left:50%;
          transform:translateX(-50%);
          width:52px; height:6px;
          background:#080f1a;
          border-radius:10px;
          z-index:10;
        }
        .dev-phone-screen {
          position:absolute;
          top:26px; left:6px; right:6px; bottom:6px;
          background: #080f1a;
          border-radius:32px;
          overflow:hidden;
          display:flex;
          flex-direction:column;
        }
        .ps-bar {
          padding: 10px 14px 6px;
          display:flex;
          justify-content:space-between;
          align-items:center;
          flex-shrink:0;
        }
        .ps-time { font-size:9px;font-weight:700;color:rgba(248,250,252,0.9); }
        .ps-header {
          background: linear-gradient(135deg, rgba(245,158,11,0.2), rgba(245,158,11,0.08));
          border-bottom: 1px solid rgba(245,158,11,0.2);
          padding: 10px 12px;
          flex-shrink:0;
        }
        .ps-label { font-size:8px;color:rgba(245,158,11,0.7);text-transform:uppercase;letter-spacing:.07em;margin-bottom:3px; }
        .ps-big { font-size:20px;font-weight:800;color:#FCD34D;line-height:1; }
        .ps-small { font-size:7.5px;color:rgba(248,250,252,0.4);margin-top:2px; }
        .ps-body { padding:10px 12px;flex:1;overflow:hidden; }
        .ps-section { font-size:8px;color:rgba(248,250,252,0.35);text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px; }
        .ps-row {
          display:flex;align-items:center;gap:8px;
          padding:6px 8px;border-radius:8px;
          background:rgba(255,255,255,0.04);
          margin-bottom:5px;
        }
        .ps-dot { width:7px;height:7px;border-radius:50%;flex-shrink:0; }
        .ps-row-text { flex:1; }
        .ps-row-name { font-size:8px;color:rgba(248,250,252,0.75); }
        .ps-row-sub { font-size:6.5px;color:rgba(248,250,252,0.3);margin-top:1px; }
        .ps-badge { padding:2px 6px;border-radius:4px;font-size:6.5px;font-weight:600; }
        .ps-badge-green { background:rgba(34,197,94,0.15);color:#22c55e; }
        .ps-badge-amber { background:rgba(245,158,11,0.15);color:#F59E0B; }
        .ps-nav {
          position:absolute;bottom:0;left:0;right:0;
          height:42px;
          background:rgba(8,15,26,0.96);
          border-top:1px solid rgba(255,255,255,0.06);
          display:flex;align-items:center;justify-content:space-around;
        }
        .ps-nav-i { width:16px;height:16px;stroke:rgba(255,255,255,0.25);fill:none;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round; }
        .ps-nav-i.act { stroke:var(--gold); }

        /* Tablet */
        .dev-tablet {
          position:absolute;
          left:0; top:60px;
          width:268px; height:370px;
          background: linear-gradient(160deg, #1a2840 0%, #0f1a2e 100%);
          border-radius:20px;
          border:2px solid rgba(255,255,255,0.12);
          box-shadow: 0 32px 72px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.07);
          overflow:hidden;
          animation: floatTablet 5.5s ease-in-out infinite 0.4s;
        }
        @keyframes floatTablet { 0%,100%{transform:translateY(0) rotate(-2deg)} 50%{transform:translateY(-10px) rotate(-2deg)} }
        .dev-tablet-screen {
          position:absolute;
          top:8px;left:14px;right:14px;bottom:8px;
          background:#080f1a;
          border-radius:14px;
          overflow:hidden;
        }
        .ts-header {
          padding:10px 12px 8px;
          border-bottom:1px solid rgba(255,255,255,0.05);
          display:flex;align-items:center;justify-content:space-between;
        }
        .ts-logo { font-size:11px;font-weight:800;color:var(--gold);letter-spacing:.06em; }
        .ts-dots { display:flex;gap:4px; }
        .ts-dot { width:5px;height:5px;border-radius:50%; }
        .ts-body { padding:10px 12px; }
        .ts-greeting { font-size:8px;color:rgba(248,250,252,0.35);margin-bottom:1px; }
        .ts-title { font-size:11px;font-weight:700;color:var(--text);margin-bottom:10px; }
        .ts-grid { display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:9px; }
        .ts-card { border-radius:8px;padding:8px 9px; }
        .ts-card.c-gold { background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.25); }
        .ts-card.c-green { background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.2); }
        .ts-card.c-blue { background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.2); }
        .ts-card.c-purple { background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.2); }
        .ts-card-n { font-size:14px;font-weight:800;line-height:1;margin-bottom:2px; }
        .c-gold .ts-card-n { color:#FCD34D; }
        .c-green .ts-card-n { color:#22c55e; }
        .c-blue .ts-card-n { color:#60a5fa; }
        .c-purple .ts-card-n { color:#a78bfa; }
        .ts-card-l { font-size:7px;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:.06em; }
        .ts-bars-label { font-size:7px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px; }
        .ts-bars { display:flex;align-items:flex-end;gap:4px;height:36px; }
        .ts-bar { flex:1;border-radius:3px 3px 0 0; }
        .ts-row { display:flex;align-items:center;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.04);font-size:8px; }
        .ts-row-name { color:rgba(255,255,255,0.6); }
        .ts-bge { padding:2px 6px;border-radius:4px;font-size:7px;font-weight:600; }
        .bg-gn { background:rgba(34,197,94,0.15);color:#22c55e; }
        .bg-am { background:rgba(245,158,11,0.15);color:#F59E0B; }
        .bg-bl { background:rgba(59,130,246,0.15);color:#60a5fa; }

        /* Laptop */
        .dev-laptop {
          position:absolute;
          bottom:0; left:10px; right:0;
          height:160px;
          animation: floatLaptop 6s ease-in-out infinite 1s;
        }
        @keyframes floatLaptop { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
        .dev-laptop-body {
          height:112px;
          background:linear-gradient(160deg,#1a2840,#0f1a2e);
          border-radius:10px 10px 0 0;
          border:2px solid rgba(255,255,255,0.12);
          border-bottom:none;
          padding:7px;
        }
        .dev-laptop-screen {
          width:100%;height:100%;
          background:#080f1a;
          border-radius:5px;
          overflow:hidden;
          display:flex;
        }
        .ls-sidebar {
          width:30%;
          background:rgba(245,158,11,0.04);
          border-right:1px solid rgba(255,255,255,0.05);
          padding:6px 4px;
        }
        .ls-logo { font-size:7px;font-weight:800;color:var(--gold);padding:0 3px;margin-bottom:7px; }
        .ls-item { padding:3px 5px;border-radius:4px;font-size:6px;color:rgba(255,255,255,0.3);margin-bottom:1px;display:flex;align-items:center;gap:3px; }
        .ls-item.act { background:rgba(245,158,11,0.15);color:var(--gold); }
        .ls-dot { width:5px;height:5px;border-radius:50%;background:currentColor;opacity:.5; }
        .ls-main { flex:1;padding:7px 8px; }
        .ls-top { display:flex;justify-content:space-between;align-items:center;margin-bottom:5px; }
        .ls-title { font-size:8px;font-weight:700;color:var(--text); }
        .ls-badge { padding:2px 5px;border-radius:4px;font-size:5.5px;background:rgba(34,197,94,0.15);color:#22c55e; }
        .ls-cards { display:grid;grid-template-columns:1fr 1fr;gap:3px;margin-bottom:4px; }
        .ls-card { border-radius:4px;padding:5px 6px; }
        .ls-card.lc1 { background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.2); }
        .ls-card.lc2 { background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.18); }
        .ls-card.lc3 { background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.18); }
        .ls-card.lc4 { background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.18); }
        .ls-card-n { font-size:9px;font-weight:800;line-height:1; }
        .lc1 .ls-card-n { color:#FCD34D; }
        .lc2 .ls-card-n { color:#22c55e; }
        .lc3 .ls-card-n { color:#60a5fa; }
        .lc4 .ls-card-n { color:#a78bfa; }
        .ls-card-l { font-size:5px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:.05em;margin-top:1px; }
        .ls-row { display:flex;gap:4px;padding:2.5px 0;border-bottom:1px solid rgba(255,255,255,0.04); }
        .ls-td { font-size:5.5px;color:rgba(255,255,255,0.35);flex:1; }
        .ls-td.bold { color:rgba(255,255,255,0.7); }
        .dev-laptop-hinge {
          height:10px;
          background:linear-gradient(160deg,#1a2840,#0f1a2e);
          border-left:2px solid rgba(255,255,255,0.1);
          border-right:2px solid rgba(255,255,255,0.1);
          border-bottom:2px solid rgba(255,255,255,0.08);
          border-radius:0 0 6px 6px;
          width:108%; margin-left:-4%;
        }
        .dev-laptop-base {
          height:7px;
          background:#090f1b;
          width:52%;
          margin:0 auto;
          border-radius:0 0 6px 6px;
          border:1px solid rgba(255,255,255,0.06);
          border-top:none;
        }

        /* ── NUMBERS BAR ── */
        .numbers-bar {
          background: var(--raised);
          border-top: 1px solid var(--border);
          border-bottom: 1px solid var(--border);
          padding: 40px 32px;
        }
        .numbers-inner {
          max-width: 1200px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: repeat(4,1fr);
          gap: 16px;
        }
        .stat-item {
          text-align: center;
          padding: 24px 16px;
          border-radius: 12px;
          background: rgba(255,255,255,0.02);
          border: 1px solid var(--border);
        }
        .stat-number {
          font-size: clamp(32px, 4vw, 48px);
          font-weight: 800;
          color: var(--gold);
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
          font-size: clamp(28px, 3.5vw, 44px);
          font-weight: 800;
          letter-spacing: -.02em;
          color: var(--text);
          margin-bottom: 14px;
          line-height: 1.1;
        }
        .section-sub {
          font-size: 17px;
          color: var(--dim);
          line-height: 1.65;
          max-width: 560px;
          margin: 0 auto;
        }

        /* ── FEATURE GRID ── */
        .feature-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1px;
          background: var(--border);
          border: 1px solid var(--border);
          border-radius: 16px;
          overflow: hidden;
        }
        .feat-card {
          background: var(--raised);
          padding: 32px 28px;
          transition: background .2s;
        }
        .feat-card:hover { background: #131d2e; }
        .feat-icon-wrap {
          width: 44px; height: 44px;
          border-radius: 11px;
          background: var(--gold-dim);
          border: 1px solid rgba(245,158,11,0.25);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 16px;
        }
        .feat-icon-wrap svg {
          width: 20px; height: 20px;
          stroke: var(--gold);
          fill: none;
          stroke-width: 1.6;
          stroke-linecap: round;
          stroke-linejoin: round;
        }
        .feat-title {
          font-size: 16px;
          font-weight: 700;
          color: var(--text);
          margin-bottom: 8px;
        }
        .feat-desc {
          font-size: 14px;
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
          background: var(--dark);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 28px;
          transition: border-color .2s, box-shadow .2s;
        }
        .platform-card:hover {
          border-color: rgba(245,158,11,0.4);
          box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        }
        .platform-header {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 24px;
        }
        .platform-icon {
          width: 48px; height: 48px;
          border-radius: 12px;
          background: var(--gold-dim);
          border: 1px solid rgba(245,158,11,0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .platform-icon svg {
          width: 24px; height: 24px;
          stroke: var(--gold);
          fill: none;
          stroke-width: 1.5;
          stroke-linecap: round;
          stroke-linejoin: round;
        }
        .platform-name {
          font-size: 17px;
          font-weight: 700;
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
          background: var(--gold-dim);
          border: 1px solid rgba(245,158,11,0.3);
          color: var(--gold);
          font-size: 12px;
          font-weight: 700;
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
          background: rgba(34,197,94,0.08);
          border: 1px solid rgba(34,197,94,0.2);
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
        .compare-table thead tr { background: #0a1520; }
        .compare-table th {
          padding: 16px 24px;
          font-size: 13px;
          font-weight: 700;
          color: var(--dim);
          text-align: left;
          border-bottom: 1px solid var(--border);
          letter-spacing: .03em;
          text-transform: uppercase;
        }
        .compare-table th.saguaro-col {
          background: rgba(245,158,11,0.08);
          color: var(--gold);
          border-left: 2px solid var(--gold);
        }
        .compare-table td {
          padding: 14px 24px;
          font-size: 14px;
          color: var(--dim);
          border-bottom: 1px solid rgba(30,58,95,0.5);
          background: var(--raised);
        }
        .compare-table tr:last-child td { border-bottom: none; }
        .compare-table td.feature-col {
          color: var(--text);
          font-weight: 500;
        }
        .compare-table td.app-store-col { color: #94a3b8; }
        .compare-table td.saguaro-col {
          background: rgba(245,158,11,0.05);
          color: var(--text);
          font-weight: 600;
          border-left: 2px solid rgba(245,158,11,0.3);
        }
        .compare-table tr:hover td.saguaro-col { background: rgba(245,158,11,0.09); }
        .compare-table td.bad { color: #f87171; }
        .compare-table td.good { color: var(--green); }

        /* ── TESTIMONIALS ── */
        .testimonials-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
        }
        .testi-card {
          background: var(--raised);
          border: 1px solid var(--border);
          border-left: 3px solid var(--green);
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
          font-weight: 600;
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
          font-size: clamp(28px, 4vw, 48px);
          font-weight: 800;
          color: var(--text);
          letter-spacing: -.025em;
          margin-bottom: 36px;
          line-height: 1.1;
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
          background: #080d13;
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
        .footer-logo img { height:32px;mix-blend-mode:screen; }
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
          .numbers-inner { grid-template-columns: repeat(2,1fr); }
          .feature-grid { grid-template-columns: repeat(2,1fr); }
          .testimonials-grid { grid-template-columns: 1fr; gap: 14px; }
        }
        @media (max-width: 768px) {
          .nav { padding: 0 16px; }
          .hero { padding: 80px 16px 60px; }
          .hero-inner { grid-template-columns: 1fr; gap: 48px; }
          .devices { height: 340px; order: -1; }
          .dev-phone { right: 10px; top: 0; width: 136px; height: 292px; }
          .dev-tablet { width: 215px; height: 295px; top: 40px; }
          .dev-laptop { height: 130px; }
          .dev-laptop-body { height: 90px; }
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
      `}</style>

      <div className="page">

        {/* ── NAV ── */}
        <nav className="nav">
          <a href="/" className="nav-logo">
            <img src="/logo-full.jpg" alt="Saguaro" height={40} style={{ mixBlendMode: 'screen' }} />
          </a>
          <div className="nav-spacer" />
          <a href="/login" className="nav-login">Log In</a>
          <a href="/signup" className="nav-cta">Start Free Trial</a>
        </nav>

        {/* ── HERO ── */}
        <section className="hero">
          <div className="hero-bg-gold" />
          <div className="hero-bg-blue" />
          <div className="hero-inner">

            {/* Copy */}
            <div>
              <div className="hero-badge">
                <div className="hero-badge-dot" />
                LIVE IN 30 SECONDS — NO APP STORE REQUIRED
              </div>

              <h1 className="hero-h1">
                The Field App That<br />
                <span className="gold-gradient">Actually Works on</span><br />
                Job Sites.
              </h1>

              <p className="hero-sub">
                GPS clock-in. Daily logs. Photos. RFIs. Punch lists. Offline mode. AI field assistant. Works on every phone, tablet, and laptop — no App Store, no IT department, no extra cost.
              </p>

              <div className="hero-ctas">
                <a href="/app" className="btn-primary">Install Now — It&apos;s Free</a>
                <a href="#how-to-install" className="btn-ghost">See How It Works</a>
              </div>

              <div className="trust-pills">
                <span className="trust-pill">✓ iOS · Android · iPad · Desktop</span>
                <span className="trust-pill">✓ Works Offline</span>
                <span className="trust-pill">✓ No App Store</span>
                <span className="trust-pill">✓ Free Forever</span>
              </div>
            </div>

            {/* Devices */}
            <div className="devices">

              {/* TABLET */}
              <div className="dev-tablet">
                <div className="dev-tablet-screen">
                  <div className="ts-header">
                    <span className="ts-logo">SAGUARO</span>
                    <div className="ts-dots">
                      <div className="ts-dot" style={{ background: '#f87171' }} />
                      <div className="ts-dot" style={{ background: '#fbbf24' }} />
                      <div className="ts-dot" style={{ background: '#22c55e' }} />
                    </div>
                  </div>
                  <div className="ts-body">
                    <div className="ts-greeting">Good morning, Jake</div>
                    <div className="ts-title">Field Dashboard</div>
                    <div className="ts-grid">
                      <div className="ts-card c-gold"><div className="ts-card-n">14</div><div className="ts-card-l">Crew Clocked In</div></div>
                      <div className="ts-card c-green"><div className="ts-card-n">100%</div><div className="ts-card-l">Logs Submitted</div></div>
                      <div className="ts-card c-blue"><div className="ts-card-n">3</div><div className="ts-card-l">Open RFIs</div></div>
                      <div className="ts-card c-purple"><div className="ts-card-n">7</div><div className="ts-card-l">Punch Items</div></div>
                    </div>
                    <div className="ts-bars-label">Daily Logs — This Week</div>
                    <div className="ts-bars" style={{ marginBottom: '8px' }}>
                      <div className="ts-bar" style={{ height:'60%', background:'rgba(245,158,11,0.6)', borderRadius:'3px 3px 0 0' }} />
                      <div className="ts-bar" style={{ height:'90%', background:'rgba(245,158,11,0.7)', borderRadius:'3px 3px 0 0' }} />
                      <div className="ts-bar" style={{ height:'75%', background:'rgba(245,158,11,0.6)', borderRadius:'3px 3px 0 0' }} />
                      <div className="ts-bar" style={{ height:'100%', background:'rgba(34,197,94,0.7)', borderRadius:'3px 3px 0 0' }} />
                      <div className="ts-bar" style={{ height:'85%', background:'rgba(34,197,94,0.6)', borderRadius:'3px 3px 0 0' }} />
                    </div>
                    <div className="ts-row"><span className="ts-row-name">Mesa Commerce — Phase 2</span><span className="ts-bge bg-gn">On Track</span></div>
                    <div className="ts-row"><span className="ts-row-name">Chandler Industrial</span><span className="ts-bge bg-am">Log Due</span></div>
                    <div className="ts-row"><span className="ts-row-name">Scottsdale Medical</span><span className="ts-bge bg-bl">RFI Pending</span></div>
                  </div>
                </div>
              </div>

              {/* PHONE */}
              <div className="dev-phone">
                <div className="dev-phone-screen">
                  <div className="ps-bar">
                    <span className="ps-time">9:41</span>
                    <span style={{ fontSize:'8px', color:'rgba(255,255,255,0.5)' }}>●●●</span>
                  </div>
                  <div className="ps-header">
                    <div className="ps-label">GPS Clock-In</div>
                    <div className="ps-big">Clocked In</div>
                    <div className="ps-small">7:02 AM · Mesa Commerce Center</div>
                  </div>
                  <div className="ps-body">
                    <div className="ps-section">Today&apos;s Crew</div>
                    <div className="ps-row">
                      <div className="ps-dot" style={{ background: '#22c55e' }} />
                      <div className="ps-row-text">
                        <div className="ps-row-name">Mike R.</div>
                        <div className="ps-row-sub">In · 6:58 AM</div>
                      </div>
                      <span className="ps-badge ps-badge-green">GPS ✓</span>
                    </div>
                    <div className="ps-row">
                      <div className="ps-dot" style={{ background: '#22c55e' }} />
                      <div className="ps-row-text">
                        <div className="ps-row-name">Sofia M.</div>
                        <div className="ps-row-sub">In · 7:01 AM</div>
                      </div>
                      <span className="ps-badge ps-badge-green">GPS ✓</span>
                    </div>
                    <div className="ps-row">
                      <div className="ps-dot" style={{ background: '#F59E0B' }} />
                      <div className="ps-row-text">
                        <div className="ps-row-name">Daily Log</div>
                        <div className="ps-row-sub">3 photos · submitted</div>
                      </div>
                      <span className="ps-badge ps-badge-amber">Done</span>
                    </div>
                  </div>
                  <div className="ps-nav">
                    <svg className="ps-nav-i act" viewBox="0 0 16 16"><path d="M2 6l6-4 6 4v8a1 1 0 01-1 1H3a1 1 0 01-1-1V6z" /></svg>
                    <svg className="ps-nav-i" viewBox="0 0 16 16"><circle cx="8" cy="6" r="3" /><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" /></svg>
                    <svg className="ps-nav-i" viewBox="0 0 16 16"><rect x="2" y="2" width="5" height="5" rx="1" /><rect x="9" y="9" width="5" height="5" rx="1" /><rect x="2" y="9" width="5" height="5" rx="1" /><rect x="9" y="2" width="5" height="5" rx="1" /></svg>
                    <svg className="ps-nav-i" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" /><path d="M8 5v3l2 2" /></svg>
                  </div>
                </div>
              </div>

              {/* LAPTOP */}
              <div className="dev-laptop">
                <div className="dev-laptop-body">
                  <div className="dev-laptop-screen">
                    <div className="ls-sidebar">
                      <div className="ls-logo">SAGUARO</div>
                      <div className="ls-item act"><div className="ls-dot" />Dashboard</div>
                      <div className="ls-item"><div className="ls-dot" />Field Logs</div>
                      <div className="ls-item"><div className="ls-dot" />Punch Lists</div>
                      <div className="ls-item"><div className="ls-dot" />RFIs</div>
                      <div className="ls-item"><div className="ls-dot" />Sage AI</div>
                    </div>
                    <div className="ls-main">
                      <div className="ls-top"><span className="ls-title">Dashboard</span><span className="ls-badge">Live</span></div>
                      <div className="ls-cards">
                        <div className="ls-card lc1"><div className="ls-card-n">14</div><div className="ls-card-l">On Site</div></div>
                        <div className="ls-card lc2"><div className="ls-card-n">100%</div><div className="ls-card-l">Logs In</div></div>
                        <div className="ls-card lc3"><div className="ls-card-n">3</div><div className="ls-card-l">RFIs</div></div>
                        <div className="ls-card lc4"><div className="ls-card-n">7</div><div className="ls-card-l">Punch</div></div>
                      </div>
                      <div className="ls-row"><div className="ls-td bold">Mesa Commerce</div><div className="ls-td" style={{ color:'#22c55e' }}>On Track</div></div>
                      <div className="ls-row"><div className="ls-td bold">Chandler Ind.</div><div className="ls-td" style={{ color:'#F59E0B' }}>Log Due</div></div>
                    </div>
                  </div>
                </div>
                <div className="dev-laptop-hinge" />
                <div className="dev-laptop-base" />
              </div>

            </div>
          </div>
        </section>

        {/* ── NUMBERS BAR ── */}
        <div className="numbers-bar">
          <div className="numbers-inner">
            <div className="stat-item">
              <div className="stat-number">30 sec</div>
              <div className="stat-label">Average install time</div>
            </div>
            <div className="stat-item">
              <div className="stat-number">100%</div>
              <div className="stat-label">Offline capable</div>
            </div>
            <div className="stat-item">
              <div className="stat-number">0 MB</div>
              <div className="stat-label">App Store download</div>
            </div>
            <div className="stat-item">
              <div className="stat-number">Free</div>
              <div className="stat-label">Forever for your crew</div>
            </div>
          </div>
        </div>

        {/* ── WHAT'S INCLUDED ── */}
        <div className="section-wrap">
          <div className="section-header">
            <h2 className="section-h2">Everything Your Crew Needs on Site</h2>
            <p className="section-sub">Six tools that replace the clipboard, the group text, and the Friday timesheet chase — all in one app that installs in 30 seconds.</p>
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
              <h2 className="section-h2">Install in 30 Seconds on Any Device</h2>
              <p className="section-sub">No App Store. No download. Just open your browser and tap.</p>
            </div>

            <div className="platform-grid">

              {/* iPhone / iPad */}
              <div className="platform-card">
                <div className="platform-header">
                  <div className="platform-icon">
                    <svg viewBox="0 0 24 24">
                      <rect x="5" y="1" width="14" height="22" rx="3" />
                      <circle cx="12" cy="19.5" r="1" fill="currentColor" stroke="none" style={{ fill: '#F59E0B' }} />
                      <path d="M9 4h6" />
                    </svg>
                  </div>
                  <div className="platform-name">iPhone / iPad</div>
                </div>
                <ol className="steps-list">
                  <li className="step-item"><div className="step-num">1</div><span className="step-text">Open <strong>Safari</strong> and go to <strong>saguarocontrol.net/app</strong></span></li>
                  <li className="step-item"><div className="step-num">2</div><span className="step-text">Tap the <strong>Share button</strong> (box with arrow pointing up)</span></li>
                  <li className="step-item"><div className="step-num">3</div><span className="step-text">Tap <strong>&quot;Add to Home Screen&quot;</strong></span></li>
                  <li className="step-item"><div className="step-num">4</div><span className="step-text">Tap <strong>&quot;Add&quot;</strong> — done. Icon appears instantly.</span></li>
                </ol>
                <div className="platform-note">Works on iOS 14+ · No App Store · Updates automatically</div>
              </div>

              {/* Android */}
              <div className="platform-card">
                <div className="platform-header">
                  <div className="platform-icon">
                    <svg viewBox="0 0 24 24">
                      <path d="M6 18V10a6 6 0 0112 0v8" />
                      <rect x="4" y="10" width="16" height="10" rx="2" />
                      <line x1="2" y1="13" x2="4" y2="13" />
                      <line x1="20" y1="13" x2="22" y2="13" />
                      <line x1="8" y1="21" x2="8" y2="23" />
                      <line x1="16" y1="21" x2="16" y2="23" />
                      <circle cx="9" cy="13" r="1" fill="#F59E0B" stroke="none" />
                      <circle cx="15" cy="13" r="1" fill="#F59E0B" stroke="none" />
                    </svg>
                  </div>
                  <div className="platform-name">Android</div>
                </div>
                <ol className="steps-list">
                  <li className="step-item"><div className="step-num">1</div><span className="step-text">Open <strong>Chrome</strong> and go to <strong>saguarocontrol.net/app</strong></span></li>
                  <li className="step-item"><div className="step-num">2</div><span className="step-text">Tap the <strong>three-dot menu ⋮</strong> at top right</span></li>
                  <li className="step-item"><div className="step-num">3</div><span className="step-text">Tap <strong>&quot;Add to Home screen&quot;</strong></span></li>
                  <li className="step-item"><div className="step-num">4</div><span className="step-text">Tap <strong>&quot;Add&quot;</strong> — app icon appears immediately.</span></li>
                </ol>
                <div className="platform-note">Works on Android 8+ · Chrome, Edge, Samsung Browser</div>
              </div>

              {/* iPad / Tablet */}
              <div className="platform-card">
                <div className="platform-header">
                  <div className="platform-icon">
                    <svg viewBox="0 0 24 24">
                      <rect x="3" y="2" width="18" height="20" rx="2" />
                      <circle cx="12" cy="19" r="1" fill="#F59E0B" stroke="none" />
                      <line x1="8" y1="5" x2="16" y2="5" />
                    </svg>
                  </div>
                  <div className="platform-name">iPad / Tablet</div>
                </div>
                <ol className="steps-list">
                  <li className="step-item"><div className="step-num">1</div><span className="step-text">Open <strong>Safari</strong> (iOS) or <strong>Chrome</strong> (Android)</span></li>
                  <li className="step-item"><div className="step-num">2</div><span className="step-text">Go to <strong>saguarocontrol.net/app</strong></span></li>
                  <li className="step-item"><div className="step-num">3</div><span className="step-text">Tap Share → <strong>&quot;Add to Home Screen&quot;</strong> (iOS) or ⋮ → <strong>&quot;Add to Home screen&quot;</strong> (Android)</span></li>
                  <li className="step-item"><div className="step-num">4</div><span className="step-text">Full tablet UI loads automatically — optimized layout.</span></li>
                </ol>
                <div className="platform-note">Full tablet UI · Landscape + portrait · Offline capable</div>
              </div>

              {/* Desktop / Laptop */}
              <div className="platform-card">
                <div className="platform-header">
                  <div className="platform-icon">
                    <svg viewBox="0 0 24 24">
                      <rect x="2" y="3" width="20" height="14" rx="2" />
                      <line x1="8" y1="21" x2="16" y2="21" />
                      <line x1="12" y1="17" x2="12" y2="21" />
                      <circle cx="5" cy="6" r=".8" fill="#F59E0B" stroke="none" />
                      <circle cx="8" cy="6" r=".8" fill="#F59E0B" stroke="none" />
                    </svg>
                  </div>
                  <div className="platform-name">Desktop / Laptop</div>
                </div>
                <ol className="steps-list">
                  <li className="step-item"><div className="step-num">1</div><span className="step-text">Open <strong>Chrome, Edge, or Safari</strong> on your computer</span></li>
                  <li className="step-item"><div className="step-num">2</div><span className="step-text">Go to <strong>saguarocontrol.net/app</strong></span></li>
                  <li className="step-item"><div className="step-num">3</div><span className="step-text">Click the <strong>install icon ⊞</strong> in the address bar — or use the menu</span></li>
                  <li className="step-item"><div className="step-num">4</div><span className="step-text">Click <strong>&quot;Install&quot;</strong> — app opens in its own window.</span></li>
                </ol>
                <div className="platform-note">Windows, Mac, Linux · Works in Chrome, Edge, Safari</div>
              </div>

            </div>
          </div>
        </section>

        {/* ── COMPARISON ── */}
        <div className="section-wrap">
          <div className="section-header">
            <h2 className="section-h2">Why Not Just Use the App Store?</h2>
            <p className="section-sub">App store apps are slow to install, require IT approval, eat storage, and charge per user. Saguaro Field is different.</p>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="compare-table">
              <thead>
                <tr>
                  <th style={{ width: '30%' }}></th>
                  <th>App Store App</th>
                  <th className="saguaro-col">Saguaro Field (PWA)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="feature-col">Install time</td>
                  <td className="app-store-col bad">5–15 minutes</td>
                  <td className="saguaro-col good">30 seconds</td>
                </tr>
                <tr>
                  <td className="feature-col">App Store required</td>
                  <td className="app-store-col bad">Yes</td>
                  <td className="saguaro-col good">No</td>
                </tr>
                <tr>
                  <td className="feature-col">IT approval needed</td>
                  <td className="app-store-col bad">Often</td>
                  <td className="saguaro-col good">Never</td>
                </tr>
                <tr>
                  <td className="feature-col">Storage used</td>
                  <td className="app-store-col bad">200–500 MB</td>
                  <td className="saguaro-col good">~5 MB</td>
                </tr>
                <tr>
                  <td className="feature-col">Updates</td>
                  <td className="app-store-col bad">Manual</td>
                  <td className="saguaro-col good">Automatic</td>
                </tr>
                <tr>
                  <td className="feature-col">Works offline</td>
                  <td className="app-store-col bad">Sometimes</td>
                  <td className="saguaro-col good">Always</td>
                </tr>
                <tr>
                  <td className="feature-col">Cost</td>
                  <td className="app-store-col bad">$5–30/user/mo</td>
                  <td className="saguaro-col good">Free</td>
                </tr>
                <tr>
                  <td className="feature-col">Works on any browser</td>
                  <td className="app-store-col bad">No</td>
                  <td className="saguaro-col good">Yes</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ── TESTIMONIALS ── */}
        <div style={{ background: 'var(--raised)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
          <div className="section-wrap">
            <div className="section-header">
              <h2 className="section-h2">Field Crews Love It</h2>
              <p className="section-sub">From superintendents to foremen — real feedback from the job site.</p>
            </div>

            <div className="testimonials-grid">
              <div className="testi-card">
                <p className="testi-quote">&quot;I had the whole crew of 14 installed in under 10 minutes. Just texted them the link. No IT. No App Store. The GPS clock-in alone saves me an hour of timesheet chasing every Friday.&quot;</p>
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
            <h2 className="final-h2">30 Seconds Away From a Better Job Site</h2>
            <a href="/app" className="btn-primary" style={{ display: 'inline-block', fontSize: '17px', padding: '18px 40px' }}>
              Install Saguaro Field Free →
            </a>
            <div className="final-sub">
              Or <a href="/signup">start a full company trial →</a>
            </div>
            <div className="trust-note">
              Your crew gets the app free. Managers get the full platform free for 30 days.<br />
              No credit card. No App Store. No IT department.
            </div>
          </div>
        </section>

        {/* ── FOOTER ── */}
        <footer className="footer">
          <div className="footer-inner">
            <div className="footer-left">
              <div className="footer-logo">
                <img src="/logo-full.jpg" alt="Saguaro" height={32} style={{ mixBlendMode: 'screen' }} />
              </div>
              <span className="footer-copy">© {new Date().getFullYear()} Saguaro Control. All rights reserved.</span>
            </div>
            <div className="footer-links">
              <a href="/pricing" className="footer-link">Pricing</a>
              <a href="/field-app" className="footer-link">Field App</a>
              <a href="/compare/procore" className="footer-link">vs Procore</a>
              <a href="/privacy" className="footer-link">Privacy</a>
              <a href="/terms" className="footer-link">Terms</a>
            </div>
          </div>
        </footer>

      </div>
    </>
  );
}
