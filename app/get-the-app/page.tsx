import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Get the App — Saguaro Field',
  description: 'Install Saguaro Field on iPhone, Android, iPad, Mac, or Windows. No App Store required — one tap from your browser.',
};

export default function GetTheAppPage() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;1,300&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --navy:      #07101C;
          --navy-mid:  #0D1D30;
          --navy-lite: #162844;
          --gold:      #C8A84B;
          --gold-lt:   #E3C86E;
          --gold-dim:  rgba(200,168,75,0.14);
          --border:    rgba(200,168,75,0.22);
          --text:      #EEF2F8;
          --muted:     #7A8FA8;
          --teal:  #0DD4AA;
          --green: #3DDB7C;
          --blue:  #4A9EFF;
          --red:   #FF5F5F;
          --amber: #FFAB2E;
          --purple:#A78BFA;
        }

        .gta-body { font-family: 'DM Sans', sans-serif; background: var(--navy); color: var(--text); min-height: 100vh; }

        .gta-wrap {
          max-width: 1160px;
          margin: 0 auto;
          padding: 100px 24px 120px;
        }

        .eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border: 1px solid var(--border);
          background: var(--gold-dim);
          border-radius: 100px;
          padding: 5px 16px 5px 10px;
          margin-bottom: 30px;
          font-size: 11px;
          font-weight: 500;
          color: var(--gold-lt);
          letter-spacing: .09em;
          text-transform: uppercase;
        }
        .eyebrow-dot {
          width: 22px; height: 22px;
          border-radius: 50%;
          background: var(--gold-dim);
          border: 1px solid var(--border);
          display: flex; align-items: center; justify-content: center;
        }
        .eyebrow-dot span {
          width: 8px; height: 8px;
          border-radius: 50%;
          background: var(--gold);
          display: block;
          animation: blink 2s ease-in-out infinite;
        }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.35} }

        .hero {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 80px;
          align-items: center;
        }
        @media(max-width:860px){
          .hero{grid-template-columns:1fr;gap:60px;}
          .devices{order:-1;}
        }

        .gta-h1 {
          font-family:'Syne',sans-serif;
          font-size: clamp(36px,5vw,56px);
          font-weight: 800;
          line-height: 1.06;
          letter-spacing: -.02em;
          margin-bottom: 18px;
        }
        .gta-h1 em { font-style: normal; color: var(--gold); }

        .sub {
          font-size: 16px;
          font-weight: 300;
          color: var(--muted);
          line-height: 1.75;
          max-width: 420px;
          margin-bottom: 40px;
        }

        .install-grid {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 38px;
        }

        .install-card {
          display: flex;
          align-items: center;
          gap: 16px;
          background: var(--navy-mid);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 14px;
          padding: 14px 18px;
          text-decoration: none;
          color: var(--text);
          transition: border-color .2s, transform .2s, box-shadow .2s;
          cursor: pointer;
        }
        .install-card:hover {
          border-color: var(--border);
          transform: translateY(-2px);
          box-shadow: 0 16px 40px rgba(0,0,0,.35);
        }

        .platform-logo {
          width: 40px; height: 40px;
          border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .platform-logo.apple { background: #fff; }
        .platform-logo.android { background: #1C2B3A; border: 1px solid rgba(255,255,255,.08); }
        .platform-logo.pwa { background: linear-gradient(135deg,#1a3a5c,#0d2035); border: 1px solid rgba(255,255,255,.08); }

        .install-info { flex: 1; }
        .install-info h4 {
          font-family: 'Syne', sans-serif;
          font-size: 14px;
          font-weight: 700;
          color: var(--text);
          margin-bottom: 2px;
        }
        .install-info p {
          font-size: 12px;
          color: var(--muted);
          font-weight: 300;
        }

        .install-arrow {
          width: 28px; height: 28px;
          border-radius: 8px;
          background: rgba(200,168,75,.1);
          border: 1px solid var(--border);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .install-arrow svg { width:12px;height:12px;stroke:var(--gold);fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round; }

        .tags {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        .tags-label { font-size:12px;color:var(--muted);margin-right:2px; }
        .tag {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          border-radius: 100px;
          padding: 5px 13px;
          font-size: 11.5px;
          font-weight: 600;
          letter-spacing: .02em;
        }
        .tag svg { width:11px;height:11px; }
        .tag-ios     { background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.18); color:#fff; }
        .tag-ios svg { fill:#fff; }
        .tag-android { background:rgba(61,220,132,.12); border:1px solid rgba(61,220,132,.35); color:#3DDC84; }
        .tag-android svg { fill:#3DDC84; }
        .tag-ipad    { background:rgba(74,158,255,.12); border:1px solid rgba(74,158,255,.35); color:#4A9EFF; }
        .tag-ipad svg { fill:#4A9EFF; }
        .tag-mac     { background:rgba(200,168,75,.13); border:1px solid rgba(200,168,75,.38); color:var(--gold-lt); }
        .tag-mac svg { fill:var(--gold-lt); }
        .tag-win     { background:rgba(167,139,250,.12); border:1px solid rgba(167,139,250,.35); color:#A78BFA; }
        .tag-win svg { fill:#A78BFA; }

        .devices {
          position: relative;
          height: 520px;
        }

        .tablet {
          position: absolute;
          left: 0; top: 50px;
          width: 275px; height: 385px;
          background: #1A2A3E;
          border-radius: 22px;
          border: 2px solid rgba(255,255,255,.14);
          box-shadow: 0 40px 80px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.07);
          overflow: hidden;
          animation: floatT 5.5s ease-in-out infinite .4s;
        }
        @keyframes floatT { 0%,100%{transform:translateY(0) rotate(-2deg)} 50%{transform:translateY(-10px) rotate(-2deg)} }
        .tablet::after {
          content:'';
          position:absolute;
          top:50%; right:7px;
          transform:translateY(-50%);
          width:5px; height:5px;
          border-radius:50%;
          background:rgba(255,255,255,.15);
          z-index:10;
        }
        .tablet-screen {
          position:absolute;
          top:8px; left:16px; right:16px; bottom:8px;
          background: #0A1622;
          border-radius: 16px;
          overflow: hidden;
        }

        .phone {
          position: absolute;
          right: 30px; top: 0;
          width: 172px; height: 368px;
          background: #1A2A3E;
          border-radius: 36px;
          border: 2px solid rgba(255,255,255,.14);
          box-shadow: 0 40px 80px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.07);
          overflow: hidden;
          animation: floatP 5s ease-in-out infinite;
        }
        @keyframes floatP { 0%,100%{transform:translateY(0) rotate(3deg)} 50%{transform:translateY(-14px) rotate(3deg)} }
        .phone::before {
          content:'';
          position:absolute;
          top:10px; left:50%;
          transform:translateX(-50%);
          width:55px; height:7px;
          background:#0A1622;
          border-radius:10px;
          z-index:10;
        }
        .phone-screen {
          position:absolute;
          top:28px; left:7px; right:7px; bottom:7px;
          background: #0A1622;
          border-radius: 30px;
          overflow: hidden;
        }

        .mac { position: absolute; bottom: 0; left: 10px; right: 0; height: 165px; animation: floatM 6s ease-in-out infinite 1s; }
        @keyframes floatM { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
        .mac-body { height: 115px; background: #1A2A3E; border-radius: 10px 10px 0 0; border: 2px solid rgba(255,255,255,.13); border-bottom: none; overflow: hidden; padding: 7px; }
        .mac-body-screen { width: 100%; height: 100%; background: #0A1622; border-radius: 5px; overflow: hidden; }
        .mac-hinge { height: 11px; background: #1A2A3E; border-left: 2px solid rgba(255,255,255,.12); border-right: 2px solid rgba(255,255,255,.12); width: 108%; margin-left: -4%; border-radius: 0 0 6px 6px; border-bottom: 2px solid rgba(255,255,255,.1); }
        .mac-stand { height: 8px; background: #162030; width: 55%; margin: 0 auto; border-radius: 0 0 8px 8px; border: 1px solid rgba(255,255,255,.07); border-top: none; }

        .t-header { padding: 12px 12px 8px; border-bottom: 1px solid rgba(255,255,255,.06); display: flex; align-items: center; justify-content: space-between; }
        .t-logo { font-family: 'Syne', sans-serif; font-size: 11px; font-weight: 800; color: var(--gold); letter-spacing: .05em; }
        .t-dots { display:flex;gap:4px; }
        .t-dot { width:5px;height:5px;border-radius:50%; }
        .t-body { padding: 10px 12px; }
        .t-greeting { font-size: 8px; color: var(--muted); margin-bottom: 2px; }
        .t-title { font-family: 'Syne', sans-serif; font-size: 11px; font-weight: 700; color: var(--text); margin-bottom: 9px; }
        .t-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 8px; }
        .t-stat { border-radius: 8px; padding: 8px 9px; }
        .t-stat.gold  { background: rgba(200,168,75,.18); border:1px solid rgba(200,168,75,.3); }
        .t-stat.teal  { background: rgba(13,212,170,.12); border:1px solid rgba(13,212,170,.25); }
        .t-stat.green { background: rgba(61,219,124,.12); border:1px solid rgba(61,219,124,.25); }
        .t-stat.blue  { background: rgba(74,158,255,.12); border:1px solid rgba(74,158,255,.25); }
        .t-stat-n { font-family: 'Syne', sans-serif; font-size: 14px; font-weight: 800; line-height: 1; margin-bottom: 2px; }
        .gold  .t-stat-n { color: var(--gold-lt); }
        .teal  .t-stat-n { color: var(--teal); }
        .green .t-stat-n { color: var(--green); }
        .blue  .t-stat-n { color: var(--blue); }
        .t-stat-l { font-size: 7px; font-weight: 400; color: rgba(255,255,255,.4); text-transform: uppercase; letter-spacing:.06em; }
        .t-chart { padding: 0 0 8px; }
        .t-chart-label { font-size:7px;color:var(--muted);margin-bottom:5px;text-transform:uppercase;letter-spacing:.06em; }
        .t-bars { display:flex;align-items:flex-end;gap:4px;height:36px; }
        .t-bar { flex:1; border-radius: 3px 3px 0 0; min-width: 0; animation: grow 1s ease-out forwards; transform-origin: bottom; }
        @keyframes grow { from{transform:scaleY(0)} to{transform:scaleY(1)} }
        .t-bar.b1{background:rgba(200,168,75,.7);height:55%;animation-delay:.1s}
        .t-bar.b2{background:rgba(200,168,75,.7);height:80%;animation-delay:.2s}
        .t-bar.b3{background:rgba(200,168,75,.5);height:65%;animation-delay:.3s}
        .t-bar.b4{background:rgba(13,212,170,.6);height:90%;animation-delay:.4s}
        .t-bar.b5{background:rgba(13,212,170,.7);height:100%;animation-delay:.5s}
        .t-bar.b6{background:rgba(13,212,170,.5);height:75%;animation-delay:.6s}
        .t-row { display: flex; align-items: center; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,.04); font-size: 8px; }
        .t-row-name { color: rgba(255,255,255,.6); }
        .t-badge { padding: 2px 7px; border-radius: 100px; font-size: 7px; font-weight: 600; letter-spacing:.04em; text-transform: uppercase; }
        .badge-green { background: rgba(61,219,124,.18); color: var(--green); }
        .badge-amber { background: rgba(255,171,46,.15); color: var(--amber); }
        .badge-blue  { background: rgba(74,158,255,.15); color: var(--blue); }
        .badge-red   { background: rgba(255,95,95,.15);  color: var(--red);  }

        .p-statusbar { padding: 10px 12px 6px; display: flex; justify-content: space-between; align-items: center; }
        .p-time { font-size:9px;font-weight:600;color:var(--text);font-family:'Syne',sans-serif; }
        .p-icons { display:flex;gap:3px;align-items:center; }
        .p-icon { width:9px;height:6px; }
        .p-hero-card { margin: 0 10px 8px; background: linear-gradient(135deg, rgba(200,168,75,.22), rgba(200,168,75,.08)); border: 1px solid rgba(200,168,75,.35); border-radius: 12px; padding: 10px 12px; }
        .p-hero-label { font-size:8px;color:rgba(200,168,75,.7);text-transform:uppercase;letter-spacing:.07em;margin-bottom:3px; }
        .p-hero-amount { font-family:'Syne',sans-serif;font-size:19px;font-weight:800;color:var(--gold-lt);line-height:1; }
        .p-hero-sub { font-size:7.5px;color:rgba(255,255,255,.35);margin-top:3px; }
        .p-progress-row { margin: 0 10px 8px; display: flex; flex-direction: column; gap: 5px; }
        .p-prog-item { display:flex;align-items:center;gap:5px; }
        .p-prog-label { font-size:7.5px;color:rgba(255,255,255,.4);width:40px;flex-shrink:0; }
        .p-prog-track { flex:1;height:4px;background:rgba(255,255,255,.06);border-radius:10px;overflow:hidden; }
        .p-prog-fill { height:100%;border-radius:10px; }
        .fill-green  { background:var(--green);  width:82%; }
        .fill-teal   { background:var(--teal);   width:67%; }
        .fill-amber  { background:var(--amber);  width:45%; }
        .fill-blue   { background:var(--blue);   width:91%; }
        .p-prog-pct { font-size:7px;color:rgba(255,255,255,.3);width:20px;text-align:right;flex-shrink:0; }
        .p-divider { height:1px;background:rgba(255,255,255,.05);margin:0 10px 8px; }
        .p-section-label { padding:0 10px 5px;font-size:8px;color:rgba(255,255,255,.3);text-transform:uppercase;letter-spacing:.07em; }
        .p-item { margin: 0 10px 6px; background: rgba(255,255,255,.04); border-radius: 9px; padding: 8px 10px; display: flex; align-items: center; gap: 8px; }
        .p-item-dot { width:7px;height:7px;border-radius:50%;flex-shrink:0; }
        .p-item-info { flex:1;min-width:0; }
        .p-item-name { font-size:8.5px;color:rgba(255,255,255,.75);margin-bottom:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
        .p-item-sub  { font-size:7px;color:rgba(255,255,255,.3); }
        .p-item-amt  { font-size:8.5px;font-weight:600;font-family:'Syne',sans-serif;color:var(--gold-lt);flex-shrink:0; }
        .p-nav { position: absolute; bottom: 0; left:0; right:0; height: 44px; background: rgba(10,22,34,.95); border-top: 1px solid rgba(255,255,255,.07); display: flex; align-items: center; justify-content: space-around; padding: 0 4px; }
        .p-nav-item { display: flex; flex-direction: column; align-items: center; gap: 2px; }
        .p-nav-icon { width:14px;height:14px;stroke:rgba(255,255,255,.3);fill:none;stroke-width:1.5;stroke-linecap:round; }
        .p-nav-icon.active { stroke:var(--gold); }
        .p-nav-dot { width:4px;height:4px;border-radius:50%;background:var(--gold);display:none; }
        .p-nav-item.active .p-nav-dot { display:block; }

        .m-screen { width: 100%; height: 100%; display: flex; }
        .m-sidebar { width: 28%; background: rgba(200,168,75,.04); border-right: 1px solid rgba(255,255,255,.05); padding: 7px 5px; }
        .m-logo-row { display:flex;align-items:center;gap:3px;margin-bottom:7px;padding:0 3px; }
        .m-logo-text { font-family:'Syne',sans-serif;font-size:7px;font-weight:800;color:var(--gold);letter-spacing:.05em; }
        .m-nav-item { padding: 3px 5px; border-radius: 4px; font-size: 6.5px; color: rgba(255,255,255,.3); margin-bottom: 1px; display: flex; align-items: center; gap: 3px; }
        .m-nav-item.active { background:rgba(200,168,75,.14);color:var(--gold); }
        .m-nav-dot { width:5px;height:5px;border-radius:50%;background:currentColor;opacity:.5; }
        .m-main { flex:1;padding:7px 8px; }
        .m-top { display:flex;justify-content:space-between;align-items:center;margin-bottom:6px; }
        .m-page-title { font-family:'Syne',sans-serif;font-size:8px;font-weight:700;color:var(--text); }
        .m-badge { padding:1.5px 5px;border-radius:4px;font-size:6px;background:rgba(13,212,170,.15);color:var(--teal); }
        .m-cards { display:grid;grid-template-columns:1fr 1fr;gap:3px;margin-bottom:5px; }
        .m-card { border-radius:5px;padding:5px 6px; }
        .m-card.c1 { background:rgba(200,168,75,.15);border:1px solid rgba(200,168,75,.25); }
        .m-card.c2 { background:rgba(13,212,170,.1);border:1px solid rgba(13,212,170,.2); }
        .m-card.c3 { background:rgba(74,158,255,.1);border:1px solid rgba(74,158,255,.2); }
        .m-card.c4 { background:rgba(61,219,124,.1);border:1px solid rgba(61,219,124,.2); }
        .m-card-n  { font-family:'Syne',sans-serif;font-size:10px;font-weight:800;line-height:1; }
        .c1 .m-card-n { color:var(--gold-lt); }
        .c2 .m-card-n { color:var(--teal); }
        .c3 .m-card-n { color:var(--blue); }
        .c4 .m-card-n { color:var(--green); }
        .m-card-l  { font-size:5.5px;color:rgba(255,255,255,.3);text-transform:uppercase;letter-spacing:.06em;margin-top:1px; }
        .m-table { width:100%; }
        .m-tr { display:flex;border-bottom:1px solid rgba(255,255,255,.04);padding:3px 0; }
        .m-td { font-size:6px;color:rgba(255,255,255,.4);flex:1; }
        .m-td.bold { color:rgba(255,255,255,.7); }
        .m-dot-g { display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--green);margin-right:3px; }
        .m-dot-a { display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--amber);margin-right:3px; }

        .features { display: grid; grid-template-columns: repeat(3,1fr); gap: 1px; background: rgba(200,168,75,.12); border: 1px solid rgba(200,168,75,.16); border-radius: 18px; overflow: hidden; margin-top: 80px; }
        @media(max-width:680px){.features{grid-template-columns:1fr;}}
        .feat { background: var(--navy-mid); padding: 28px 28px 30px; }
        .feat-icon { width:38px;height:38px; border-radius:10px; background:var(--gold-dim); border:1px solid var(--border); display:flex;align-items:center;justify-content:center; margin-bottom:14px; }
        .feat-icon svg { width:18px;height:18px;stroke:var(--gold);fill:none;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round; }
        .feat h3 { font-family:'Syne',sans-serif;font-size:15px;font-weight:700;color:var(--text);margin-bottom:6px; }
        .feat p  { font-size:13px;color:var(--muted);line-height:1.65;font-weight:300; }

        .bottom { margin-top: 54px; display: flex; gap: 14px; flex-wrap: wrap; align-items: stretch; }
        .qr-card { flex: 0 0 auto; background: var(--navy-mid); border: 1px solid var(--border); border-radius: 16px; padding: 22px 24px; display: flex; align-items: center; gap: 20px; }
        .qr-img { width: 72px; height: 72px; background: white; border-radius: 9px; padding: 7px; flex-shrink: 0; }
        .qr-img svg { width:100%;height:100%; }
        .qr-info h4 { font-family:'Syne',sans-serif;font-size:14px;font-weight:700;margin-bottom:4px; }
        .qr-info p  { font-size:12px;color:var(--muted);font-weight:300;max-width:180px;line-height:1.5; }
        .pwa-note { flex: 1; background: var(--gold-dim); border: 1px solid var(--border); border-radius: 16px; padding: 22px 26px; display: flex; flex-direction: column; justify-content: center; gap: 6px; }
        .pwa-note h4 { font-family:'Syne',sans-serif;font-size:14px;font-weight:700;color:var(--gold-lt); }
        .pwa-note p  { font-size:12px;color:rgba(200,168,75,.65);font-weight:300;line-height:1.55;max-width:340px; }
      `}</style>

      <div className="gta-body">
        <div className="gta-wrap">

          {/* EYEBROW */}
          <div className="eyebrow">
            <div className="eyebrow-dot"><span /></div>
            Works on every device you own
          </div>

          {/* HERO */}
          <div className="hero">

            {/* COPY */}
            <div>
              <h1 className="gta-h1">Run the job<br /><em>from anywhere.</em></h1>
              <p className="sub">
                Punch lists, pay apps, lien waivers, certified payroll — everything in Saguaro runs natively on iPhone, Android, iPad, and Mac. No download required.
              </p>

              {/* INSTALL OPTIONS */}
              <div className="install-grid">

                {/* iOS */}
                <a href="/field/install?platform=ios" className="install-card">
                  <div className="platform-logo apple">
                    <svg width="22" height="27" viewBox="0 0 22 27" fill="none">
                      <path d="M18.13 14.13c-.04-2.87 2.34-4.25 2.45-4.32-1.34-1.95-3.42-2.22-4.16-2.25-1.77-.18-3.46 1.04-4.36 1.04-.9 0-2.28-1.02-3.75-.99-1.92.03-3.69 1.12-4.68 2.83-2 3.46-.52 8.6 1.44 11.41.96 1.38 2.1 2.93 3.6 2.87 1.44-.06 1.98-.93 3.72-.93 1.74 0 2.22.93 3.74.9 1.55-.03 2.54-1.4 3.49-2.79.04-.06 1.52-2.97 1.5-2.97-.03-.01-2.99-1.16-3.03-4.58-.01-.01 0-.01.04-.22zM15.36 5.36c.8-.97 1.33-2.3 1.18-3.63-1.14.05-2.51.76-3.33 1.72-.73.84-1.37 2.19-1.2 3.48 1.27.1 2.55-.64 3.35-1.57z" fill="#1a1a1a" />
                    </svg>
                  </div>
                  <div className="install-info">
                    <h4>iPhone &amp; iPad — iOS 16+</h4>
                    <p>Tap Share → Add to Home Screen for a native app experience</p>
                  </div>
                  <div className="install-arrow">
                    <svg viewBox="0 0 12 12"><path d="M2 6h8M6 2l4 4-4 4" /></svg>
                  </div>
                </a>

                {/* Android */}
                <a href="/field/install?platform=android" className="install-card">
                  <div className="platform-logo android">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <circle cx="8.5" cy="10.5" r="1" fill="#3DDC84" />
                      <circle cx="15.5" cy="10.5" r="1" fill="#3DDC84" />
                      <path d="M5.5 13.5h13v5a2 2 0 01-2 2h-9a2 2 0 01-2-2v-5z" fill="#3DDC84" fillOpacity=".2" stroke="#3DDC84" strokeWidth="1.2" />
                      <path d="M5.5 9a6.5 3 0 0113 0v4.5h-13V9z" fill="#3DDC84" fillOpacity=".2" stroke="#3DDC84" strokeWidth="1.2" />
                      <line x1="4" y1="10" x2="5.5" y2="10" stroke="#3DDC84" strokeWidth="1.4" strokeLinecap="round" />
                      <line x1="18.5" y1="10" x2="20" y2="10" stroke="#3DDC84" strokeWidth="1.4" strokeLinecap="round" />
                      <line x1="8.5" y1="3.5" x2="6.5" y2="6" stroke="#3DDC84" strokeWidth="1.4" strokeLinecap="round" />
                      <line x1="15.5" y1="3.5" x2="17.5" y2="6" stroke="#3DDC84" strokeWidth="1.4" strokeLinecap="round" />
                      <line x1="9" y1="18.5" x2="9" y2="21" stroke="#3DDC84" strokeWidth="1.4" strokeLinecap="round" />
                      <line x1="15" y1="18.5" x2="15" y2="21" stroke="#3DDC84" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div className="install-info">
                    <h4>Android — Chrome or Samsung Browser</h4>
                    <p>Tap the menu → Install app — one tap, done</p>
                  </div>
                  <div className="install-arrow">
                    <svg viewBox="0 0 12 12"><path d="M2 6h8M6 2l4 4-4 4" /></svg>
                  </div>
                </a>

                {/* macOS / Desktop */}
                <a href="/field/install?platform=desktop-chrome" className="install-card">
                  <div className="platform-logo pwa">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <rect x="3" y="3" width="18" height="13" rx="2" stroke="#4A9EFF" strokeWidth="1.4" />
                      <rect x="3" y="3" width="18" height="2" fill="#4A9EFF" fillOpacity=".25" rx="2" />
                      <line x1="8" y1="19" x2="16" y2="19" stroke="#4A9EFF" strokeWidth="1.4" strokeLinecap="round" />
                      <line x1="12" y1="16" x2="12" y2="19" stroke="#4A9EFF" strokeWidth="1.4" strokeLinecap="round" />
                      <circle cx="5.5" cy="4.5" r=".7" fill="#4A9EFF" fillOpacity=".5" />
                      <circle cx="7.5" cy="4.5" r=".7" fill="#4A9EFF" fillOpacity=".5" />
                      <circle cx="9.5" cy="4.5" r=".7" fill="#4A9EFF" fillOpacity=".5" />
                    </svg>
                  </div>
                  <div className="install-info">
                    <h4>macOS, Windows &amp; Desktop</h4>
                    <p>Open in Chrome or Edge → click the install icon in the address bar</p>
                  </div>
                  <div className="install-arrow">
                    <svg viewBox="0 0 12 12"><path d="M2 6h8M6 2l4 4-4 4" /></svg>
                  </div>
                </a>

              </div>

              {/* PLATFORM TAGS */}
              <div className="tags">
                <span className="tags-label">Works on</span>
                <span className="tag tag-ios">
                  <svg viewBox="0 0 11 11"><path d="M8.2 5.5c0-1 .85-1.5.87-1.5-.5-.7-1.28-.8-1.56-.8-.66-.07-1.29.38-1.63.38s-.84-.36-1.37-.36c-.74 0-1.37.43-1.74 1.09-.74 1.27-.19 3.16.52 4.19.35.52.77 1.1 1.32 1.08.53-.02.74-.34 1.39-.34.65 0 .84.34 1.38.33.56 0 .92-.52 1.26-.99.4-.56.56-1.12.56-1.14-.01 0-1.01-.38-1.01-1.28zM6.92 2.87c.33-.36.52-.84.46-1.33-.47.01-.97.31-1.28.67-.28.32-.53.82-.47 1.3.48.03.97-.22 1.29-.64z" /></svg>
                  iOS
                </span>
                <span className="tag tag-android">
                  <svg viewBox="0 0 11 11"><circle cx="3.8" cy="5" r=".6" /><circle cx="7.2" cy="5" r=".6" /><path d="M2 6h7v2.5a.8.8 0 01-.8.8H2.8a.8.8 0 01-.8-.8V6z" fill="currentColor" fillOpacity=".2" stroke="currentColor" strokeWidth=".8" /><path d="M2 4.5a3.5 1.5 0 017 0V6H2V4.5z" fill="currentColor" fillOpacity=".2" stroke="currentColor" strokeWidth=".8" /><line x1="1.2" y1="5" x2="2" y2="5" stroke="currentColor" strokeWidth=".9" strokeLinecap="round" /><line x1="9" y1="5" x2="9.8" y2="5" stroke="currentColor" strokeWidth=".9" strokeLinecap="round" /><line x1="4" y1="2" x2="3" y2="3.5" stroke="currentColor" strokeWidth=".9" strokeLinecap="round" /><line x1="7" y1="2" x2="8" y2="3.5" stroke="currentColor" strokeWidth=".9" strokeLinecap="round" /></svg>
                  Android
                </span>
                <span className="tag tag-ipad">
                  <svg viewBox="0 0 11 11"><rect x="1.5" y="1" width="8" height="9.5" rx="1.2" stroke="currentColor" fill="none" strokeWidth=".9" /><circle cx="5.5" cy="9" r=".4" fill="currentColor" /></svg>
                  iPad
                </span>
                <span className="tag tag-mac">
                  <svg viewBox="0 0 11 11"><rect x="1" y="1.5" width="9" height="6" rx="1" stroke="currentColor" fill="none" strokeWidth=".9" /><path d="M3.5 9h4M5.5 7.5V9" stroke="currentColor" strokeWidth=".9" strokeLinecap="round" /></svg>
                  macOS
                </span>
                <span className="tag tag-win">
                  <svg viewBox="0 0 11 11"><path d="M1.5 2.5l3.8-.55V5.4H1.5zm0 6l3.8.55V6.6H1.5zM5.8 1.8L9.5 1.2V5.4H5.8zm0 7.4l3.7-.6V6.6H5.8z" fill="currentColor" /></svg>
                  Windows
                </span>
              </div>
            </div>

            {/* DEVICES */}
            <div className="devices">

              {/* TABLET */}
              <div className="tablet">
                <div className="tablet-screen">
                  <div className="t-header">
                    <span className="t-logo">SAGUARO</span>
                    <div className="t-dots">
                      <div className="t-dot" style={{ background: 'var(--red)' }} />
                      <div className="t-dot" style={{ background: 'var(--amber)' }} />
                      <div className="t-dot" style={{ background: 'var(--green)' }} />
                    </div>
                  </div>
                  <div className="t-body">
                    <div className="t-greeting">Good morning, Chad</div>
                    <div className="t-title">Dashboard</div>
                    <div className="t-stats">
                      <div className="t-stat gold"><div className="t-stat-n">$2.8M</div><div className="t-stat-l">Contract Value</div></div>
                      <div className="t-stat teal"><div className="t-stat-n">94%</div><div className="t-stat-l">Compliance</div></div>
                      <div className="t-stat green"><div className="t-stat-n">12</div><div className="t-stat-l">Active Jobs</div></div>
                      <div className="t-stat blue"><div className="t-stat-n">$48K</div><div className="t-stat-l">Retainage Due</div></div>
                    </div>
                    <div className="t-chart">
                      <div className="t-chart-label">Billings — last 6 months</div>
                      <div className="t-bars">
                        <div className="t-bar b1" /><div className="t-bar b2" /><div className="t-bar b3" />
                        <div className="t-bar b4" /><div className="t-bar b5" /><div className="t-bar b6" />
                      </div>
                    </div>
                    <div className="t-row" style={{ paddingTop: 6 }}><span className="t-row-name">Mesa Commerce Center</span><span className="t-badge badge-green">On Track</span></div>
                    <div className="t-row"><span className="t-row-name">Scottsdale Medical</span><span className="t-badge badge-amber">Pay App Due</span></div>
                    <div className="t-row"><span className="t-row-name">Chandler Industrial</span><span className="t-badge badge-blue">In Review</span></div>
                  </div>
                </div>
              </div>

              {/* PHONE */}
              <div className="phone">
                <div className="phone-screen">
                  <div className="p-statusbar">
                    <span className="p-time">9:41</span>
                    <div className="p-icons">
                      <svg className="p-icon" viewBox="0 0 9 6" fill="rgba(255,255,255,.7)"><rect x="0" y="2" width="2" height="4" rx=".5" /><rect x="2.5" y="1" width="2" height="5" rx=".5" /><rect x="5" y="0" width="2" height="6" rx=".5" /><rect x="7.5" y="0" width="1.5" height="6" rx=".5" fill="rgba(255,255,255,.2)" /></svg>
                    </div>
                  </div>
                  <div className="p-hero-card">
                    <div className="p-hero-label">Current Pay App</div>
                    <div className="p-hero-amount">$48,200</div>
                    <div className="p-hero-sub">Application #7 · Mesa Commerce</div>
                  </div>
                  <div className="p-progress-row">
                    <div className="p-prog-item"><span className="p-prog-label">Concrete</span><div className="p-prog-track"><div className="p-prog-fill fill-green" /></div><span className="p-prog-pct">82%</span></div>
                    <div className="p-prog-item"><span className="p-prog-label">Framing</span><div className="p-prog-track"><div className="p-prog-fill fill-teal" /></div><span className="p-prog-pct">67%</span></div>
                    <div className="p-prog-item"><span className="p-prog-label">MEP</span><div className="p-prog-track"><div className="p-prog-fill fill-amber" /></div><span className="p-prog-pct">45%</span></div>
                    <div className="p-prog-item"><span className="p-prog-label">Sitework</span><div className="p-prog-track"><div className="p-prog-fill fill-blue" /></div><span className="p-prog-pct">91%</span></div>
                  </div>
                  <div className="p-divider" />
                  <div className="p-section-label">Lien Waivers</div>
                  <div className="p-item">
                    <div className="p-item-dot" style={{ background: 'var(--amber)' }} />
                    <div className="p-item-info"><div className="p-item-name">Southwest Concrete Co.</div><div className="p-item-sub">Conditional · Due in 3 days</div></div>
                    <span className="p-item-amt">$24K</span>
                  </div>
                  <div className="p-item">
                    <div className="p-item-dot" style={{ background: 'var(--green)' }} />
                    <div className="p-item-info"><div className="p-item-name">Desert Steel Fab</div><div className="p-item-sub">Unconditional · Signed</div></div>
                    <span className="p-item-amt">$11K</span>
                  </div>
                  <div className="p-nav">
                    <div className="p-nav-item active">
                      <svg className="p-nav-icon active" viewBox="0 0 16 16"><path d="M2 6l6-4 6 4v8a1 1 0 01-1 1H3a1 1 0 01-1-1V6z" /></svg>
                      <div className="p-nav-dot" />
                    </div>
                    <div className="p-nav-item"><svg className="p-nav-icon" viewBox="0 0 16 16"><rect x="2" y="2" width="5" height="5" rx="1" /><rect x="9" y="2" width="5" height="5" rx="1" /><rect x="2" y="9" width="5" height="5" rx="1" /><rect x="9" y="9" width="5" height="5" rx="1" /></svg><div className="p-nav-dot" /></div>
                    <div className="p-nav-item"><svg className="p-nav-icon" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" /><path d="M8 5v3l2 2" /></svg><div className="p-nav-dot" /></div>
                    <div className="p-nav-item"><svg className="p-nav-icon" viewBox="0 0 16 16"><circle cx="8" cy="6" r="3" /><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" /></svg><div className="p-nav-dot" /></div>
                  </div>
                </div>
              </div>

              {/* MAC */}
              <div className="mac">
                <div className="mac-body">
                  <div className="mac-body-screen">
                    <div className="m-screen">
                      <div className="m-sidebar">
                        <div className="m-logo-row"><span className="m-logo-text">S</span></div>
                        <div className="m-nav-item active"><div className="m-nav-dot" />Dashboard</div>
                        <div className="m-nav-item"><div className="m-nav-dot" />Projects</div>
                        <div className="m-nav-item"><div className="m-nav-dot" />Pay Apps</div>
                        <div className="m-nav-item"><div className="m-nav-dot" />Lien Waivers</div>
                        <div className="m-nav-item"><div className="m-nav-dot" />Payroll</div>
                      </div>
                      <div className="m-main">
                        <div className="m-top"><span className="m-page-title">Dashboard</span><span className="m-badge">Live</span></div>
                        <div className="m-cards">
                          <div className="m-card c1"><div className="m-card-n">$2.8M</div><div className="m-card-l">Contract</div></div>
                          <div className="m-card c2"><div className="m-card-n">94%</div><div className="m-card-l">Compliance</div></div>
                          <div className="m-card c3"><div className="m-card-n">12</div><div className="m-card-l">Jobs</div></div>
                          <div className="m-card c4"><div className="m-card-n">$48K</div><div className="m-card-l">Retainage</div></div>
                        </div>
                        <div className="m-table">
                          <div className="m-tr"><div className="m-td bold">Mesa Commerce</div><div className="m-td"><span className="m-dot-g" />On Track</div></div>
                          <div className="m-tr"><div className="m-td bold">Scottsdale Med</div><div className="m-td"><span className="m-dot-a" />Pay App Due</div></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mac-hinge" />
                <div className="mac-stand" />
              </div>

            </div>
          </div>

          {/* FEATURE STRIP */}
          <div className="features">
            <div className="feat">
              <div className="feat-icon">
                <svg viewBox="0 0 18 18"><path d="M9 1v10M5 7l4 4 4-4M2 14h14v2a1 1 0 01-1 1H3a1 1 0 01-1-1v-2z" /></svg>
              </div>
              <h3>Installs in one tap</h3>
              <p>No App Store, no approvals. Tap your browser menu and add to home screen — it&apos;s a full app in under 10 seconds.</p>
            </div>
            <div className="feat">
              <div className="feat-icon">
                <svg viewBox="0 0 18 18"><path d="M1 9a8 8 0 1016 0A8 8 0 001 9zM9 5v4l3 3" /></svg>
              </div>
              <h3>Real-time everywhere</h3>
              <p>Every change on mobile updates instantly on desktop. The office and field always see the same data, zero lag.</p>
            </div>
            <div className="feat">
              <div className="feat-icon">
                <svg viewBox="0 0 18 18"><path d="M9 1l2 5.5h5.5l-4.5 3.3 1.7 5.4L9 12.1l-4.7 3.1 1.7-5.4L1.5 6.5H7z" /></svg>
              </div>
              <h3>Push alerts</h3>
              <p>Lien deadlines, insurance expiry, and pay app reminders arrive as native push notifications — even when the app is closed.</p>
            </div>
          </div>

          {/* BOTTOM */}
          <div className="bottom">
            <div className="qr-card">
              <div className="qr-img">
                <svg viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
                  <rect x="1" y="1" width="7" height="7" rx="1" fill="#07101C" />
                  <rect x="2" y="2" width="5" height="5" rx=".5" fill="white" />
                  <rect x="3" y="3" width="3" height="3" fill="#07101C" />
                  <rect x="13" y="1" width="7" height="7" rx="1" fill="#07101C" />
                  <rect x="14" y="2" width="5" height="5" rx=".5" fill="white" />
                  <rect x="15" y="3" width="3" height="3" fill="#07101C" />
                  <rect x="1" y="13" width="7" height="7" rx="1" fill="#07101C" />
                  <rect x="2" y="14" width="5" height="5" rx=".5" fill="white" />
                  <rect x="3" y="15" width="3" height="3" fill="#07101C" />
                  <rect x="9" y="1" width="2" height="2" fill="#07101C" />
                  <rect x="9" y="4" width="1" height="1" fill="#07101C" />
                  <rect x="11" y="3" width="1" height="1" fill="#07101C" />
                  <rect x="1" y="9" width="2" height="2" fill="#07101C" />
                  <rect x="4" y="9" width="1" height="1" fill="#07101C" />
                  <rect x="6" y="11" width="1" height="1" fill="#07101C" />
                  <rect x="9" y="9" width="3" height="3" fill="#07101C" />
                  <rect x="13" y="9" width="1" height="2" fill="#07101C" />
                  <rect x="15" y="10" width="2" height="1" fill="#07101C" />
                  <rect x="18" y="9" width="2" height="1" fill="#07101C" />
                  <rect x="9" y="13" width="2" height="1" fill="#07101C" />
                  <rect x="12" y="14" width="1" height="2" fill="#07101C" />
                  <rect x="14" y="13" width="3" height="1" fill="#07101C" />
                  <rect x="18" y="14" width="2" height="2" fill="#07101C" />
                  <rect x="9" y="16" width="1" height="2" fill="#07101C" />
                  <rect x="11" y="17" width="2" height="2" fill="#07101C" />
                  <rect x="16" y="17" width="3" height="2" fill="#07101C" />
                </svg>
              </div>
              <div className="qr-info">
                <h4>Scan to open on your phone</h4>
                <p>Point your camera here — no App Store search needed.</p>
              </div>
            </div>
            <div className="pwa-note">
              <h4>Why no App Store?</h4>
              <p>Saguaro is a Progressive Web App — it installs directly from your browser in one tap, updates automatically, and works offline. Same experience, zero gatekeeping, always the latest version.</p>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
