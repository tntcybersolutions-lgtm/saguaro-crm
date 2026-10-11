import type { Metadata } from 'next';
import Link from 'next/link';
import MarketingNav from '@/components/MarketingNav';
import {
  ArrowRight,
  CheckCircle,
  UploadSimple,
  Scan,
  Ruler,
  Export,
  Stack,
  Crosshair,
  MapPinLine,
  SquaresFour,
  ListChecks,
  ChartBar,
  Target,
  Sparkle,
} from '@phosphor-icons/react/dist/ssr';
import type { Icon as IconType } from '@phosphor-icons/react';

export const metadata: Metadata = {
  title: 'AI Blueprint Takeoff — Saguaro Control Systems',
  description:
    'Upload a PDF plan set and Saguaro reads every sheet, measures quantities by trade, and builds a priced estimate — no scale wheel, no manual counting. Every number traces back to the page it came from.',
};

// Sonoran palette — identical tokens to the Coverage Heatmap system (single source of truth).
const BG = 'var(--bg-base)';
const RAISED = 'var(--bg-surface)';
const GOLD = 'var(--brand-primary)';
const GOLD_DIM = 'var(--brand-primary-12)';
const GOLD_LINE = 'var(--brand-primary-35)';
const TEXT = '#FFFFFF';
const DIM = 'var(--text-secondary)';
const MUTED = 'var(--text-secondary)';
const GREEN = '#2CFF7A';
const BORDER = 'rgba(255,255,255,0.08)';

const STEPS: { n: string; icon: IconType; title: string; body: string }[] = [
  { n: '1', icon: UploadSimple, title: 'Upload Your Plans', body: 'Drop in any PDF plan set — architectural, structural, MEP. Multi-page sets are read together, not one sheet at a time.' },
  { n: '2', icon: Scan, title: 'The AI Reads Every Sheet', body: 'Saguaro identifies walls, doors, fixtures, footings, and assemblies across the whole set, the way a senior estimator would — including the title-block scale.' },
  { n: '3', icon: Ruler, title: 'Quantities by Trade', body: 'You get measured linear, area, and count quantities grouped by trade and cost code, priced against your rates. Adjust any measurement by hand when you want to.' },
  { n: '4', icon: Export, title: 'Export to a Bid', body: 'Send the line items straight into a bid or estimate, or out to Excel. Every quantity links back to the exact sheet and location it came from — fully traceable.' },
];

const CAPS: { icon: IconType; title: string; body: string }[] = [
  { icon: Stack, title: 'Multi-Page Plan Sets', body: 'Reads full architectural, structural, and MEP sets — not just a single sheet.' },
  { icon: Ruler, title: 'Automatic Quantity Extraction', body: 'Linear, area, and count quantities measured for you, grouped by trade.' },
  { icon: Crosshair, title: 'Scale Detection & Manual Override', body: 'Reads the title-block scale automatically; correct or set it on any sheet.' },
  { icon: MapPinLine, title: 'Traceable to the Source', body: 'Every count links back to the page and location it came from — defensible in a bid review.' },
  { icon: SquaresFour, title: 'Cost Codes & Assemblies', body: 'Map items to your cost codes and reusable assemblies so estimates match your books.' },
  { icon: Export, title: 'Export Anywhere', body: 'Push line items into a Saguaro estimate or bid, or export to Excel.' },
];

// Metric strip — mirrors the exact figures the cinematic hero settles on (4,800 SF · 47 items · 98.6%).
const TAKEOFF_TOTAL = 143900;
const METRICS: { icon: IconType; label: string; value: string; tint: string }[] = [
  { icon: Ruler, label: 'Building Area', value: '4,800 SF', tint: DIM },
  { icon: ListChecks, label: 'Line Items', value: '47', tint: DIM },
  { icon: ChartBar, label: 'Cost / SF', value: '$30', tint: GOLD },
  { icon: Target, label: 'Confidence', value: '98.6%', tint: GREEN },
];

// CSI-division-colored trade breakdown — same hexes as the heatmap SYSTEM_COLORS family so the two tools read as one.
const TRADES: { div: string; label: string; trade: string; amt: number; color: string }[] = [
  { div: '03', label: 'Slab-on-Grade', trade: 'Concrete', amt: 38400, color: '#C9A96A' },
  { div: '04', label: 'CMU Exterior Wall', trade: 'Masonry', amt: 34650, color: '#FF8A00' },
  { div: '05', label: 'Steel Columns W8×24', trade: 'Metals', amt: 28800, color: 'var(--text-secondary)' },
  { div: '03', label: 'Continuous Footing', trade: 'Concrete', amt: 17000, color: '#C9A96A' },
  { div: '08', label: 'Doors & Frames', trade: 'Openings', amt: 15600, color: '#8FC4F0' },
  { div: '09', label: 'Interior Partitions', trade: 'Finishes', amt: 9450, color: '#FF8A00' },
];
const usd = (n: number) => '$' + n.toLocaleString('en-US');
const pctOf = (n: number) => Math.round((n / TAKEOFF_TOTAL) * 100);

// Cinematic hero — pixel-honest recreation of the Saguaro takeoff workspace reading a
// live S-201 shell plan (gold scan sweeps once and settles; reduced-motion → finished state).
// Self-contained SVG + CSS; rendered via dangerouslySetInnerHTML so it stays a server component.
const TAKEOFF_HERO = `
<div class="scs-takeoff" role="img" aria-label="Saguaro AI Takeoff: a construction floor plan being read and measured by AI, showing slab area, continuous footing, interior partitions, and 24 steel columns with priced line items totaling $143,900.">
  <style>
    .scs-takeoff{
      --bg:var(--bg-base); --gold:var(--brand-primary); --green:#2CFF7A; --sky:var(--brand-primary-strong);
      --ink:#94A3B8; --white:#FFFFFF; --dim:#D4D4D8; --muted:rgba(255,255,255,.45);
      --line:rgba(148,163,184,.35); --hair:rgba(255,255,255,.08);
      width:100%; max-width:1200px; margin:0 auto;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    }
    .scs-takeoff svg{width:100%; height:auto; display:block; max-width:100%;}
    .scs-takeoff .plan{fill:none; stroke:var(--line);}
    .scs-takeoff .plan-hair{fill:none; stroke:rgba(148,163,184,.18);}
    .scs-takeoff text{font-family:inherit; -webkit-font-smoothing:antialiased;}
    .scs-takeoff .ov{opacity:0; animation:scsFadeUp .7s ease forwards;}
    @keyframes scsFadeUp{from{opacity:0} to{opacity:1}}
    .scs-takeoff .pin{opacity:0; transform-box:fill-box; transform-origin:center; animation:scsPop .5s cubic-bezier(.2,1.4,.4,1) forwards;}
    @keyframes scsPop{0%{opacity:0; transform:scale(0)} 60%{opacity:1; transform:scale(1.18)} 100%{opacity:1; transform:scale(1)}}
    .scs-takeoff .scan{animation:scsSweep 3s cubic-bezier(.45,.05,.3,1) forwards;}
    @keyframes scsSweep{0%{opacity:0; transform:translateX(0)}7%{opacity:.95}88%{opacity:.95}100%{opacity:0; transform:translateX(626px)}}
    .scs-takeoff .row{opacity:0; transform-box:fill-box; animation:scsRowIn .55s ease forwards;}
    @keyframes scsRowIn{from{opacity:0; transform:translateX(12px)} to{opacity:1; transform:translateX(0)}}
    .scs-takeoff .livedot{animation:scsPulse 1.8s ease-in-out infinite;}
    @keyframes scsPulse{0%,100%{opacity:1} 50%{opacity:.35}}
    .scs-takeoff .count-step{opacity:0; animation:scsTick .45s ease forwards;}
    @keyframes scsTick{0%{opacity:0}18%{opacity:1}82%{opacity:1}100%{opacity:0}}
    .scs-takeoff .count-final{opacity:0; animation:scsTickOn .4s ease forwards;}
    @keyframes scsTickOn{from{opacity:0} to{opacity:1}}
    @media (prefers-reduced-motion: reduce){
      .scs-takeoff .ov,.scs-takeoff .pin,.scs-takeoff .row{opacity:1 !important; animation:none !important; transform:none !important;}
      .scs-takeoff .scan{display:none !important;}
      .scs-takeoff .count-step{display:none !important;}
      .scs-takeoff .count-final{opacity:1 !important; animation:none !important;}
      .scs-takeoff .livedot{animation:none !important;}
    }
  </style>
  <svg viewBox="0 0 1200 600" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    <defs>
      <clipPath id="canvasClip"><rect x="64" y="40" width="800" height="560"/></clipPath>
      <filter id="softGlow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <linearGradient id="scanGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="color-mix(in srgb, var(--brand-primary) 0%, transparent)"/><stop offset="1" stop-color="color-mix(in srgb, var(--brand-primary) 22%, transparent)"/></linearGradient>
    </defs>
    <rect x="0" y="0" width="1200" height="600" rx="14" fill="#0a0a0a"/>
    <rect x="0.5" y="0.5" width="1199" height="599" rx="13.5" fill="none" stroke="var(--hair)"/>
    <rect x="1" y="1" width="1198" height="40" rx="13" fill="#11161f"/>
    <rect x="1" y="28" width="1198" height="13" fill="#11161f"/>
    <line x1="0" y1="41" x2="1200" y2="41" stroke="var(--hair)"/>
    <circle cx="24" cy="21" r="5.5" fill="#FF3B30"/><circle cx="44" cy="21" r="5.5" fill="#FFE600"/><circle cx="64" cy="21" r="5.5" fill="#2CFF7A"/>
    <text x="600" y="25" text-anchor="middle" font-size="12.5" fill="var(--dim)" font-weight="600" letter-spacing=".2">Springfield Logistics Center — Shell &amp; Core.pdf  ·  Sheet S-201</text>
    <text x="1176" y="25" text-anchor="end" font-size="11.5" fill="var(--muted)">Sheet 4 / 18</text>
    <rect x="1" y="41" width="62" height="558" fill="#0f141c"/>
    <line x1="63" y1="41" x2="63" y2="599" stroke="var(--hair)"/>
    <g transform="translate(20,78)" fill="none" stroke="var(--muted)" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"><path d="M2 1 L2 20 L7 15 L11 22 L14 20 L10 14 L17 14 Z" fill="rgba(255,255,255,.06)"/></g>
    <g transform="translate(18,138)" fill="none" stroke="var(--dim)" stroke-width="1.6" stroke-linecap="round"><rect x="0" y="6" width="26" height="12" rx="2" transform="rotate(-32 13 12)"/><line x1="6" y1="9" x2="8" y2="12"/><line x1="12" y1="6" x2="14" y2="9"/><line x1="18" y1="3" x2="20" y2="6"/></g>
    <rect x="8" y="182" width="48" height="44" rx="10" fill="color-mix(in srgb, var(--brand-primary) 14%, transparent)" stroke="var(--gold)" stroke-width="1.2"/>
    <g transform="translate(19,193)" fill="none" stroke="var(--gold)" stroke-width="1.7" stroke-linejoin="round"><rect x="0" y="0" width="22" height="22" rx="2" stroke-dasharray="4 3"/><rect x="-3" y="-3" width="6" height="6" fill="#0a0a0a"/><rect x="19" y="-3" width="6" height="6" fill="#0a0a0a"/><rect x="-3" y="19" width="6" height="6" fill="#0a0a0a"/><rect x="19" y="19" width="6" height="6" fill="#0a0a0a"/><rect x="-3" y="-3" width="6" height="6"/><rect x="19" y="-3" width="6" height="6"/><rect x="-3" y="19" width="6" height="6"/><rect x="19" y="19" width="6" height="6"/></g>
    <g transform="translate(20,258)" fill="var(--muted)"><circle cx="3" cy="3" r="3"/><circle cx="20" cy="3" r="3"/><circle cx="3" cy="20" r="3"/><circle cx="20" cy="20" r="3"/><circle cx="11.5" cy="11.5" r="3"/></g>
    <g transform="translate(19,318)" fill="none" stroke="var(--muted)" stroke-width="1.6" stroke-linecap="round"><line x1="0" y1="18" x2="24" y2="18"/><line x1="0" y1="14" x2="0" y2="22"/><line x1="24" y1="14" x2="24" y2="22"/><line x1="6" y1="16" x2="6" y2="20"/><line x1="12" y1="16" x2="12" y2="20"/><line x1="18" y1="16" x2="18" y2="20"/></g>
    <rect x="864" y="41" width="335" height="558" fill="#0f141c"/>
    <line x1="864" y1="41" x2="864" y2="599" stroke="var(--hair)"/>
    <text x="888" y="76" font-size="13.5" fill="var(--white)" font-weight="700" letter-spacing=".3">Detected Line Items</text>
    <g class="livedot"><circle cx="1160" cy="71" r="4" fill="var(--green)"/></g>
    <text x="1176" y="76" text-anchor="end" font-size="11.5" fill="var(--green)" font-weight="600">Live</text>
    <line x1="888" y1="90" x2="1176" y2="90" stroke="var(--hair)"/>
    <g class="row" style="animation-delay:.9s"><circle cx="894" cy="118" r="4" fill="var(--gold)"/><text x="908" y="115" font-size="13" fill="var(--white)" font-weight="600">Slab-on-grade</text><text x="908" y="130" font-size="11" fill="var(--muted)">Concrete · 6&quot; · 4,800 SF</text><text x="1176" y="123" text-anchor="end" font-size="13" fill="var(--white)" font-weight="600">$38,400</text></g>
    <line x1="888" y1="142" x2="1176" y2="142" stroke="var(--hair)"/>
    <g class="row" style="animation-delay:1.35s"><circle cx="894" cy="170" r="4" fill="var(--green)"/><text x="908" y="167" font-size="13" fill="var(--white)" font-weight="600">Cont. footing</text><text x="908" y="182" font-size="11" fill="var(--muted)">Concrete · 340 LF</text><text x="1176" y="175" text-anchor="end" font-size="13" fill="var(--green)" font-weight="600">$17,000</text></g>
    <line x1="888" y1="194" x2="1176" y2="194" stroke="var(--hair)"/>
    <g class="row" style="animation-delay:1.7s"><circle cx="894" cy="222" r="4" fill="rgba(255,255,255,.5)"/><text x="908" y="219" font-size="13" fill="var(--white)" font-weight="600">CMU exterior wall</text><text x="908" y="234" font-size="11" fill="var(--muted)">Masonry · 1,980 SF</text><text x="1176" y="227" text-anchor="end" font-size="13" fill="var(--white)" font-weight="600">$34,650</text></g>
    <line x1="888" y1="246" x2="1176" y2="246" stroke="var(--hair)"/>
    <g class="row" style="animation-delay:2.05s"><circle cx="894" cy="274" r="4" fill="var(--gold)"/><text x="908" y="271" font-size="13" fill="var(--white)" font-weight="600">Steel columns W8×24</text><text x="908" y="286" font-size="11" fill="var(--muted)">Structural · 24 EA</text><text x="1176" y="279" text-anchor="end" font-size="13" fill="var(--white)" font-weight="600">$28,800</text></g>
    <line x1="888" y1="298" x2="1176" y2="298" stroke="var(--hair)"/>
    <g class="row" style="animation-delay:2.4s"><circle cx="894" cy="326" r="4" fill="var(--sky)"/><text x="908" y="323" font-size="13" fill="var(--white)" font-weight="600">Interior partitions</text><text x="908" y="338" font-size="11" fill="var(--muted)">Metal stud · 210 LF</text><text x="1176" y="331" text-anchor="end" font-size="13" fill="var(--white)" font-weight="600">$9,450</text></g>
    <line x1="888" y1="350" x2="1176" y2="350" stroke="var(--hair)"/>
    <g class="row" style="animation-delay:2.75s"><circle cx="894" cy="378" r="4" fill="rgba(255,255,255,.5)"/><text x="908" y="375" font-size="13" fill="var(--white)" font-weight="600">Doors &amp; frames</text><text x="908" y="390" font-size="11" fill="var(--muted)">Openings · 12 EA</text><text x="1176" y="383" text-anchor="end" font-size="13" fill="var(--white)" font-weight="600">$15,600</text></g>
    <rect x="888" y="428" width="288" height="58" rx="10" fill="var(--brand-primary-12)" stroke="var(--brand-primary-35)"/>
    <text x="906" y="452" font-size="11.5" fill="var(--dim)" font-weight="600">Estimate Total</text>
    <text x="906" y="474" font-size="11" fill="var(--muted)">6 trades · 47 elements</text>
    <g class="row" style="animation-delay:3s"><text x="1160" y="466" text-anchor="end" font-size="22" fill="var(--gold)" font-weight="800">$143,900</text></g>
    <text x="888" y="512" font-size="10.5" fill="var(--muted)">Auto-priced from your regional cost book · editable</text>
    <rect x="888" y="524" width="288" height="34" rx="8" fill="rgba(44,255,122,.12)" stroke="rgba(44,255,122,.35)"/>
    <text x="1032" y="545" text-anchor="middle" font-size="12.5" fill="var(--green)" font-weight="700">Push to Estimate →</text>
    <g clip-path="url(#canvasClip)">
      <rect x="64" y="41" width="800" height="558" fill="#0b1017"/>
      <g class="plan-hair" stroke-dasharray="2 5"><line x1="205" y1="150" x2="205" y2="470"/><line x1="309" y1="150" x2="309" y2="470"/><line x1="413" y1="150" x2="413" y2="470"/><line x1="517" y1="150" x2="517" y2="470"/><line x1="621" y1="150" x2="621" y2="470"/><line x1="725" y1="150" x2="725" y2="470"/><line x1="150" y1="200" x2="780" y2="200"/><line x1="150" y1="270" x2="780" y2="270"/><line x1="150" y1="340" x2="780" y2="340"/><line x1="150" y1="410" x2="780" y2="410"/></g>
      <g font-size="10.5" fill="var(--ink)" text-anchor="middle" font-weight="600"><g fill="none" stroke="var(--line)"><circle cx="205" cy="132" r="10"/><circle cx="309" cy="132" r="10"/><circle cx="413" cy="132" r="10"/><circle cx="517" cy="132" r="10"/><circle cx="621" cy="132" r="10"/><circle cx="725" cy="132" r="10"/><circle cx="128" cy="200" r="10"/><circle cx="128" cy="270" r="10"/><circle cx="128" cy="340" r="10"/><circle cx="128" cy="410" r="10"/></g><text x="205" y="135.5">A</text><text x="309" y="135.5">B</text><text x="413" y="135.5">C</text><text x="517" y="135.5">D</text><text x="621" y="135.5">E</text><text x="725" y="135.5">F</text><text x="128" y="203.5">1</text><text x="128" y="273.5">2</text><text x="128" y="343.5">3</text><text x="128" y="413.5">4</text></g>
      <g stroke="var(--line)" stroke-width="1"><line x1="150" y1="158" x2="150" y2="150"/><line x1="780" y1="158" x2="780" y2="150"/><line x1="150" y1="154" x2="780" y2="154"/></g>
      <text x="465" y="150" text-anchor="middle" font-size="10.5" fill="var(--ink)">63'-0"</text>
      <g stroke="var(--line)" stroke-width="1"><line x1="158" y1="150" x2="150" y2="150"/><line x1="158" y1="470" x2="150" y2="470"/><line x1="154" y1="150" x2="154" y2="470"/></g>
      <text x="146" y="314" text-anchor="middle" font-size="10.5" fill="var(--ink)" transform="rotate(-90 146 314)">32'-0"</text>
      <rect class="plan" x="150" y="150" width="630" height="320" stroke-width="1.15"/>
      <rect class="plan" x="159" y="159" width="612" height="302" stroke-width="1.15"/>
      <g class="plan" stroke-width="1"><line x1="437" y1="159" x2="437" y2="461"/><line x1="443" y1="159" x2="443" y2="461"/><line x1="159" y1="312" x2="440" y2="312"/><line x1="159" y1="318" x2="440" y2="318"/><line x1="607" y1="318" x2="607" y2="461"/><line x1="613" y1="318" x2="613" y2="461"/></g>
      <g class="plan" stroke-width="1" fill="none"><path d="M470 461 A34 34 0 0 1 504 427"/><line x1="470" y1="461" x2="470" y2="427"/><line x1="470" y1="427" x2="504" y2="427"/><path d="M440 232 A30 30 0 0 1 470 262"/><line x1="440" y1="232" x2="470" y2="232"/><path d="M250 318 A28 28 0 0 0 278 346"/><line x1="250" y1="318" x2="250" y2="346"/><path d="M540 318 A24 24 0 0 1 564 342"/><line x1="540" y1="318" x2="540" y2="342"/></g>
      <g fill="var(--muted)" text-anchor="middle" letter-spacing="1"><text x="298" y="238" font-size="10.5">OFFICE</text><text x="298" y="396" font-size="10.5">LOBBY</text><text x="611" y="236" font-size="10.5">WAREHOUSE</text><text x="525" y="396" font-size="9.5">MECH</text><text x="693" y="396" font-size="9.5">ELEC</text></g>
      <g class="ov" style="animation-delay:.55s"><rect x="159" y="159" width="612" height="302" fill="var(--brand-primary-12)" stroke="var(--gold)" stroke-width="1.3" stroke-dasharray="6 4"/><g><rect x="316" y="176" width="212" height="24" rx="6" fill="#12161d" stroke="color-mix(in srgb, var(--brand-primary) 55%, transparent)"/><circle cx="331" cy="188" r="4" fill="var(--gold)"/><text x="343" y="192" font-size="12" fill="var(--white)" font-weight="600">Slab-on-grade · 4,800 SF</text></g></g>
      <g class="ov" style="animation-delay:1.15s"><rect x="154.5" y="154.5" width="621" height="311" fill="none" stroke="var(--green)" stroke-width="3.2" filter="url(#softGlow)" stroke-linejoin="round"/><g><rect x="300" y="474" width="230" height="24" rx="6" fill="#12161d" stroke="rgba(44,255,122,.55)"/><path d="M314 486 l3 3 l6 -7" fill="none" stroke="var(--green)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><text x="330" y="490" font-size="12" fill="var(--white)" font-weight="600">Cont. footing · 340 LF  ·  verified</text></g></g>
      <g class="ov" style="animation-delay:2.0s"><path d="M440 159 L440 461 M159 315 L440 315 M610 318 L610 461" fill="none" stroke="var(--sky)" stroke-width="2.6" stroke-linecap="round" filter="url(#softGlow)"/><g><rect x="452" y="196" width="182" height="22" rx="6" fill="#12161d" stroke="rgba(56,189,248,.55)"/><circle cx="466" cy="207" r="4" fill="var(--sky)"/><text x="478" y="211" font-size="11.5" fill="var(--white)" font-weight="600">Int. partitions · 210 LF</text></g></g>
      <g fill="var(--gold)">
        ${[200, 270, 340, 410].map((cy, r) => [205, 309, 413, 517, 621, 725].map((cx, c) => `<g class="pin" style="animation-delay:${(1.45 + r * 0.23 + c * 0.05).toFixed(2)}s"><circle cx="${cx}" cy="${cy}" r="5.5" fill="#0b1017" stroke="var(--gold)" stroke-width="2"/><rect x="${cx - 3}" y="${cy - 3}" width="6" height="6" fill="var(--gold)"/></g>`).join('')).join('')}
      </g>
      <g class="ov" style="animation-delay:2.4s"><rect x="612" y="424" width="150" height="24" rx="6" fill="#12161d" stroke="color-mix(in srgb, var(--brand-primary) 55%, transparent)"/><circle cx="626" cy="436" r="4.5" fill="none" stroke="var(--gold)" stroke-width="2"/><text x="638" y="440" font-size="12" fill="var(--white)" font-weight="600">Steel columns ×24</text></g>
      <g class="ov" style="animation-delay:2.95s" transform="translate(80,502)"><rect x="0" y="0" width="150" height="74" rx="8" fill="#12161d" stroke="var(--hair)"/><text x="12" y="18" font-size="9.5" fill="var(--muted)" font-weight="600">Measurement Type</text><rect x="12" y="28" width="13" height="10" fill="var(--brand-primary-35)" stroke="var(--gold)"/><text x="33" y="37" font-size="11" fill="var(--dim)">Areas · SF</text><line x1="12" y1="51" x2="25" y2="51" stroke="var(--green)" stroke-width="3" stroke-linecap="round"/><text x="33" y="54" font-size="11" fill="var(--dim)">Linear · LF</text><circle cx="18" cy="64" r="4" fill="#0b1017" stroke="var(--gold)" stroke-width="2"/><text x="33" y="68" font-size="11" fill="var(--dim)">Counts · EA</text></g>
      <g class="scan"><rect x="150" y="150" width="46" height="320" fill="url(#scanGrad)"/><line x1="196" y1="146" x2="196" y2="474" stroke="var(--gold)" stroke-width="2" filter="url(#softGlow)"/><rect x="192" y="146" width="8" height="8" fill="var(--gold)"/><rect x="192" y="466" width="8" height="8" fill="var(--gold)"/></g>
    </g>
    <g>
      <rect x="82" y="56" width="292" height="30" rx="15" fill="#12161d" stroke="color-mix(in srgb, var(--brand-primary) 45%, transparent)"/>
      <g class="livedot"><circle cx="100" cy="71" r="4.5" fill="var(--gold)"/></g>
      <text x="113" y="75" font-size="12.5" fill="var(--white)" font-weight="700" letter-spacing=".2">AI Takeoff</text>
      <line x1="192" y1="63" x2="192" y2="79" stroke="var(--hair)"/>
      <g font-size="12.5" font-weight="600" text-anchor="end"><text class="count-step" style="animation-delay:.3s" x="228" y="75" fill="var(--gold)">0</text><text class="count-step" style="animation-delay:.7s" x="228" y="75" fill="var(--gold)">11</text><text class="count-step" style="animation-delay:1.1s" x="228" y="75" fill="var(--gold)">19</text><text class="count-step" style="animation-delay:1.5s" x="228" y="75" fill="var(--gold)">28</text><text class="count-step" style="animation-delay:1.9s" x="228" y="75" fill="var(--gold)">36</text><text class="count-step" style="animation-delay:2.3s" x="228" y="75" fill="var(--gold)">43</text><text class="count-final" style="animation-delay:2.7s" x="228" y="75" fill="var(--gold)">47</text></g>
      <text x="234" y="75" font-size="12.5" fill="var(--dim)">items measured</text>
    </g>
    <text x="80" y="588" font-size="10.5" fill="var(--muted)">Scale 1/8" = 1'-0"   ·   detections shown at 98.6% confidence</text>
    <text x="856" y="588" text-anchor="end" font-size="10.5" fill="var(--muted)">Takeoff Canvas</text>
  </svg>
</div>`;

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: GOLD_DIM, border: `1px solid ${GOLD_LINE}`, color: GOLD, fontSize: 11, fontWeight: 800, padding: '5px 12px', borderRadius: 999 }}>
      <Sparkle size={11} weight="fill" color={GOLD} />
      {children}
    </span>
  );
}

export default function TakeoffPage() {
  return (
    <div data-landing style={{ background: BG, color: TEXT, minHeight: '100vh', overflowX: 'hidden' as const, fontFamily: 'inherit' }}>
      <MarketingNav />

      {/* HERO */}
      <section style={{ maxWidth: 1220, margin: '0 auto', padding: '60px 24px 56px' }}>
        <div style={{ textAlign: 'center' as const, maxWidth: 760, margin: '0 auto 40px' }}>
          <div style={{ marginBottom: 22 }}><Eyebrow>AI Blueprint Takeoff</Eyebrow></div>
          <h1 style={{ fontSize: 46, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05, margin: '0 0 18px' }} className="tk-h1">Watch the AI Read Your Blueprint</h1>
          <p style={{ color: DIM, fontSize: 16.5, fontWeight: 400, lineHeight: 1.65, margin: '0 auto 28px', maxWidth: 580 }}>
            Saguaro reads your PDF plan set the way a senior estimator does — every wall, footing, fixture, and column — then paints measured quantities onto the sheet and prices them by trade. No scale wheel. No manual counting.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const, alignItems: 'center', justifyContent: 'center', marginBottom: 22 }}>
            <Link href="/signup" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: GOLD, color: '#0A0A00', textDecoration: 'none', fontWeight: 700, fontSize: 14, padding: '12px 26px', borderRadius: 10, boxShadow: '0 8px 24px var(--brand-primary-25)' }}>Start Free Trial <ArrowRight size={14} weight="bold" color="#0A0A00" /></Link>
            <Link href="#how" style={{ color: DIM, textDecoration: 'none', fontWeight: 500, fontSize: 14, padding: '12px 16px' }}>See How It Works</Link>
          </div>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' as const, justifyContent: 'center' }}>
            {['Multi-Page Plan Sets', 'Quantities by Trade', 'Export to a Bid'].map((t) => (
              <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: DIM }}>
                <CheckCircle size={14} weight="fill" color={GREEN} />{t}
              </span>
            ))}
          </div>
        </div>
        <div style={{ borderRadius: 16, boxShadow: '0 30px 80px rgba(0,0,0,0.5)', border: `1px solid ${BORDER}`, overflow: 'hidden' }} dangerouslySetInnerHTML={{ __html: TAKEOFF_HERO }} />
      </section>

      {/* THE DELIVERABLE — metric strip + CSI trade breakdown */}
      <section style={{ borderTop: `1px solid ${BORDER}`, background: 'rgba(255,255,255,0.012)' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', padding: '76px 24px' }}>
          <div style={{ textAlign: 'center' as const, marginBottom: 40 }}>
            <Eyebrow>The Deliverable</Eyebrow>
            <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', margin: '16px 0 10px' }}>Not a Data Dump — a Client-Ready Estimate</h2>
            <p style={{ color: DIM, fontSize: 14.5, maxWidth: 560, margin: '0 auto', lineHeight: 1.6 }}>Every takeoff comes back priced, coded to CSI divisions, and split by trade — so you can see exactly where the money is before you send the bid.</p>
          </div>

          {/* Metric strip */}
          <div className="tk-strip" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
            {METRICS.map((m) => {
              const Icon = m.icon;
              return (
                <div key={m.label} style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 }}>
                  <Icon size={18} weight="regular" color={MUTED} />
                  <div style={{ fontSize: 24, fontWeight: 800, color: m.tint, marginTop: 12, fontVariantNumeric: 'tabular-nums' as const, letterSpacing: '-0.02em' }}>{m.value}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: MUTED, marginTop: 4 }}>{m.label}</div>
                </div>
              );
            })}
          </div>

          {/* Trade breakdown bar */}
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' as const }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ChartBar size={16} weight="regular" color={GOLD} />
                <span style={{ fontSize: 12, fontWeight: 700, color: DIM }}>Where the Money Is</span>
              </div>
              <span style={{ fontSize: 20, fontWeight: 800, color: GOLD, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' as const }}>{usd(TAKEOFF_TOTAL)}</span>
            </div>
            <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', gap: 1, background: BG }}>
              {TRADES.map((t, i) => (
                <div key={i} style={{ flex: `${t.amt} 0 0`, background: t.color }} title={`${t.label} · ${usd(t.amt)}`} />
              ))}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '10px 22px', marginTop: 18 }}>
              {TRADES.map((t, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                  <span style={{ width: 11, height: 11, borderRadius: 3, background: t.color, flexShrink: 0 }} />
                  <span style={{ fontFamily: 'monospace', fontSize: 11, color: MUTED }}>{t.div}</span>
                  <span style={{ color: TEXT, fontWeight: 500 }}>{t.label}</span>
                  <span style={{ color: MUTED, fontVariantNumeric: 'tabular-nums' as const }}>{usd(t.amt)}</span>
                  <span style={{ color: MUTED, fontVariantNumeric: 'tabular-nums' as const }}>{pctOf(t.amt)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" style={{ borderTop: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', padding: '76px 24px' }}>
          <div style={{ textAlign: 'center' as const, marginBottom: 48 }}>
            <Eyebrow>How It Works</Eyebrow>
            <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', margin: '16px 0 10px' }}>From Plans to a Priced Estimate in Four Steps</h2>
            <p style={{ color: DIM, fontSize: 14.5, maxWidth: 540, margin: '0 auto', lineHeight: 1.6 }}>What used to take a half-day with a scale wheel takes minutes — and every number is traceable back to the sheet it came from.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }} className="tk-steps">
            {STEPS.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.n} style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 22 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: GOLD_DIM, border: `1px solid ${GOLD_LINE}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon size={20} weight="regular" color={GOLD} />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 800, color: MUTED }}>Step {s.n}</span>
                  </div>
                  <h3 style={{ fontSize: 14.5, fontWeight: 700, margin: '0 0 7px', color: TEXT }}>{s.title}</h3>
                  <p style={{ fontSize: 13, color: DIM, lineHeight: 1.6, margin: 0 }}>{s.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CAPABILITIES */}
      <section style={{ borderTop: `1px solid ${BORDER}`, background: 'rgba(255,255,255,0.012)' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', padding: '76px 24px' }}>
          <div style={{ textAlign: 'center' as const, marginBottom: 48 }}>
            <Eyebrow>Built for Real Estimating</Eyebrow>
            <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', margin: '16px 0 10px' }}>Everything You Need to Trust the Number</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }} className="tk-caps">
            {CAPS.map((c) => {
              const Icon = c.icon;
              return (
                <div key={c.title} style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 22 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: GOLD_DIM, border: `1px solid ${GOLD_LINE}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                    <Icon size={19} weight="regular" color={GOLD} />
                  </div>
                  <h3 style={{ fontSize: 14.5, fontWeight: 700, margin: '0 0 7px', color: TEXT }}>{c.title}</h3>
                  <p style={{ fontSize: 13, color: DIM, lineHeight: 1.6, margin: 0 }}>{c.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ borderTop: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '80px 24px 96px', textAlign: 'center' as const }}>
          <div style={{ marginBottom: 18 }}><Eyebrow>Run Your First Takeoff Free</Eyebrow></div>
          <h2 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em', margin: '0 0 12px' }}>Stop Counting by Hand</h2>
          <p style={{ color: DIM, fontSize: 15, lineHeight: 1.6, margin: '0 auto 28px', maxWidth: 460 }}>Upload a plan set and watch the estimate build itself — priced, coded, and traceable to the sheet.</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' as const, alignItems: 'center' }}>
            <Link href="/signup" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: GOLD, color: '#0A0A00', textDecoration: 'none', fontWeight: 700, fontSize: 14, padding: '13px 30px', borderRadius: 10, boxShadow: '0 8px 24px var(--brand-primary-25)' }}>Start Free Trial <ArrowRight size={14} weight="bold" color="#0A0A00" /></Link>
            <Link href="/pricing" style={{ color: DIM, textDecoration: 'none', fontWeight: 500, fontSize: 14, padding: '13px 18px' }}>View Pricing</Link>
          </div>
          <p style={{ color: MUTED, fontSize: 12, marginTop: 16 }}>No credit card required · 30-day free trial</p>
        </div>
      </section>

      <style>{`
        @media (max-width: 900px) {
          .tk-steps { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 760px) {
          .tk-h1 { font-size: 32px !important; }
          .tk-caps { grid-template-columns: 1fr !important; }
          .tk-strip { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 460px) {
          .tk-h1 { font-size: 27px !important; }
          .tk-steps { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
