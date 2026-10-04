/**
 * Neon marketing renders of the phone app for /get-the-app.
 *
 * Writes /public/marketing/phone-{project,daily-log,change-orders,time-clock,
 * punch-list,takeoff}.png at 3x (1179 x 2556), the iPhone 15/16 Pro screen.
 * Layouts follow the Saguaro Field phone screens; every name, number and
 * address is invented demo data (no clients, no real dollar amounts).
 * The iOS status bar and home indicator are drawn by PhoneFrame, not here.
 *
 *   npm i --no-save @fontsource/inter lucide-static sharp
 *   node tools/marketing-phone-renders.mjs
 *
 * CHROME_PATH=/path/to/chrome overrides the Playwright browser.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public/marketing');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-renders-'));
const FONT_DIR = path.join(ROOT, 'node_modules/@fontsource/inter/files');
const ICON_DIR = path.join(ROOT, 'node_modules/lucide-static/icons');

function icon(name, size = 20, color = 'currentColor', sw = 2.2) {
  let s = fs.readFileSync(path.join(ICON_DIR, `${name}.svg`), 'utf8');
  s = s.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/class="[^"]*"/, '')
    .replace(/width="24"/, `width="${size}"`)
    .replace(/height="24"/, `height="${size}"`)
    .replace(/stroke="currentColor"/, `stroke="${color}"`)
    .replace(/stroke-width="2"/, `stroke-width="${sw}"`);
  return s.trim();
}

const fontFaces = [400, 500, 600, 700, 800, 900].map(w =>
  `@font-face{font-family:'Inter';font-weight:${w};src:url('${pathToFileURL(path.join(FONT_DIR, `inter-latin-${w}-normal.woff2`)).href}') format('woff2')}`).join('\n');

const BASE = `
${fontFaces}
/* Platform palette only (app/globals.css, lib/design-tokens.ts, lib/status-colors.ts). No blue, no pink. */
:root{--y:#FFE600;--y2:#FFF04A;--o:#FF8A00;--g:#2CFF7A;--r:#FF3B30;--gray:#A3ACBB;--dim:#A9B4C4}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:393px;height:852px;overflow:hidden;background:#000000}
body{font-family:'Inter',sans-serif;color:#fff;-webkit-font-smoothing:antialiased;letter-spacing:-0.012em}
svg{display:block;flex:none;overflow:visible}
.ringw svg{filter:drop-shadow(0 0 9px rgba(44,255,122,.75))}
.pr svg{filter:drop-shadow(0 0 7px rgba(44,255,122,.7))}
.screen{position:relative;width:393px;height:852px;overflow:hidden;background:
  radial-gradient(120% 50% at 105% -6%, rgba(255,230,0,.42) 0%, rgba(255,138,0,.16) 42%, transparent 66%),
  radial-gradient(95% 42% at -18% 40%, rgba(255,138,0,.30) 0%, transparent 62%),
  radial-gradient(90% 40% at 118% 80%, rgba(44,255,122,.20) 0%, transparent 62%),
  radial-gradient(80% 30% at -10% 100%, rgba(255,138,0,.16) 0%, transparent 62%),
  #000000}
.content{position:absolute;top:58px;left:0;right:0;bottom:0;padding:0 16px;overflow:hidden}
.eyebrow{font-size:11px;font-weight:800;letter-spacing:.17em;text-transform:uppercase;color:var(--dim)}
.label{display:flex;align-items:center;gap:8px;font-size:11.5px;font-weight:800;letter-spacing:.15em;text-transform:uppercase;color:#D4D4D8;margin:15px 2px 9px}
.label .dot{width:7px;height:7px;border-radius:50%;background:var(--o);box-shadow:0 0 10px var(--o),0 0 2px var(--o)}
.label .cnt{margin-left:auto;font-size:11px;letter-spacing:.04em;color:#0A0A00;background:var(--y);padding:3px 8px;border-radius:99px;box-shadow:0 0 14px rgba(255,230,0,.5)}
.card{background:linear-gradient(180deg,rgba(255,255,255,.085),rgba(255,255,255,.035));border:1px solid rgba(255,255,255,.11);border-radius:20px;box-shadow:0 10px 30px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.06)}
.chip{display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:800;letter-spacing:.06em;padding:5px 9px;border-radius:99px;white-space:nowrap}
.c-g{color:var(--g);background:rgba(44,255,122,.14);border:1px solid rgba(44,255,122,.5)}
.c-o{color:#FF8A00;background:rgba(255,138,0,.16);border:1px solid rgba(255,138,0,.55)}
.c-y{color:var(--y);background:rgba(255,230,0,.13);border:1px solid rgba(255,230,0,.5)}
.c-r{color:#FF3B30;background:rgba(255,59,48,.16);border:1px solid rgba(255,59,48,.55)}
/* tab bar */
.tabbar{position:absolute;left:0;right:0;bottom:0;height:84px;padding:7px 12px 0;display:flex;justify-content:space-around;align-items:flex-start;
  background:#0E0F12;border-top:1px solid rgba(255,255,255,.09);z-index:10}
.tabbar::before{content:'';position:absolute;left:0;right:0;top:-34px;height:34px;background:linear-gradient(180deg,rgba(14,15,18,0),#0E0F12);pointer-events:none}
.tab{width:78px;height:52px;border-radius:17px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-size:10.5px;font-weight:800;color:#A9B4C4;letter-spacing:.03em}
.tab.on{background:linear-gradient(180deg,#FFF04A,#FFE600);color:#0A0A00;box-shadow:0 6px 24px rgba(255,230,0,.55),inset 0 1px 0 rgba(255,255,255,.7)}
/* sub-page header */
.sh{position:relative;height:56px;display:flex;align-items:center;justify-content:center}
.sh h2{font-size:21px;font-weight:900;letter-spacing:-.02em}
.sh h2::after{content:'';display:block;margin:4px auto 0;width:26px;height:3px;border-radius:2px;background:var(--y);box-shadow:0 0 10px var(--y)}
.round{position:absolute;top:8px;width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14)}
.round.l{left:0}.round.r{right:0;background:linear-gradient(180deg,#FFF04A,#FFE600);border:none;box-shadow:0 6px 18px rgba(255,230,0,.5)}
.pill{display:flex;align-items:center;gap:9px;height:42px;padding:0 14px;border-radius:99px;border:1.5px solid rgba(255,230,0,.6);background:linear-gradient(90deg,rgba(255,230,0,.16),rgba(255,138,0,.08));color:var(--y);font-size:13.5px;font-weight:800;margin:4px 0 12px;box-shadow:0 0 22px rgba(255,230,0,.18)}
.pill span{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.btn{height:50px;border-radius:15px;display:flex;align-items:center;justify-content:center;gap:9px;font-size:16px;font-weight:900;letter-spacing:-.01em}
.btn-y{background:linear-gradient(135deg,#FFF04A 0%,#FFE600 50%,#FF8A00 100%);color:#0A0A00;box-shadow:0 10px 28px rgba(255,138,0,.45),inset 0 1px 0 rgba(255,255,255,.7)}
.btn-ol{border:1.5px solid rgba(255,138,0,.7);color:#FF8A00;background:rgba(255,138,0,.07)}
.fl{font-size:11px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:#D4D4D8;margin:12px 2px 7px}
.inp{height:46px;border-radius:13px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.13);display:flex;align-items:center;padding:0 14px;font-size:16px;font-weight:600;gap:10px}
`;

const TABS = [['house', 'Home'], ['hammer', 'Field'], ['layout-grid', 'Tools'], ['user-round', 'Me']];
const tabbar = active => `<nav class="tabbar">${TABS.map(([ic, l]) =>
  `<div class="tab${l === active ? ' on' : ''}">${icon(ic, 21, l === active ? '#0A0A00' : '#A9B4C4', 2.3)}<span>${l}</span></div>`).join('')}</nav>`;

const PROJECT = 'Sonoran Vista Medical Center — Phase II';
const sub = (title, plus = false) => `
  <div class="sh"><div class="round l">${icon('chevron-left', 22, '#fff', 2.6)}</div><h2>${title}</h2>${plus ? `<div class="round r">${icon('plus', 22, '#0A0A00', 2.8)}</div>` : ''}</div>
  <div class="pill">${icon('folder', 17, '#FFE600', 2.4)}<span>${PROJECT}</span>${icon('chevron-down', 17, '#FFE600', 2.6)}</div>`;

const page = (body, css = '') => `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}${css}</style></head><body><div class="screen">${body}</div></body></html>`;

/* ───────────────────────── 1. PROJECT HOME (hero) ───────────────────────── */
const home = page(`
<div class="content">
  <div class="top">
    <div>
      <div class="eyebrow">Overview · Active job</div>
      <div class="ttl">Sonoran Vista Medical ${icon('chevron-down', 20, '#FFE600', 2.8)}</div>
    </div>
    <div class="bell">${icon('bell', 20, '#fff', 2.3)}<i>3</i></div>
  </div>

  <div class="hero">
    <div class="hr1"><span class="hchip">${icon('zap', 12, '#FFE600', 2.6)} PHASE 6 · CONSTRUCTION</span><span class="pct">63<small>%</small></span></div>
    <div class="hlab">Contract to cash · 5 of 8 milestones</div>
    <div class="segs">${[1, 1, 1, 1, 1, 2, 0, 0].map(s => `<i class="${s === 1 ? 'd' : s === 2 ? 'c' : ''}"></i>`).join('')}</div>
    <div class="next"><div class="num">6</div><div><div class="nk">NEXT MILESTONE</div><div class="nv">Submit pay app #6</div></div><div class="go">${icon('arrow-right', 20, '#FFE600', 2.8)}</div></div>
  </div>

  <div class="label"><i class="dot"></i>Needs your attention<span class="cnt">2</span></div>
  <div class="att o"><div class="ic">${icon('triangle-alert', 19, '#0A0A00', 2.5)}</div><div class="at"><b>CO #7 — owner decision</b><span>$6,840 · waiting 2 days</span></div>${icon('chevron-right', 18, '#FF8A00', 2.6)}</div>
  <div class="att b"><div class="ic">${icon('message-square-text', 19, '#0A0A00', 2.5)}</div><div class="at"><b>RFI 014 due tomorrow</b><span>Mechanical · Level 2 east</span></div>${icon('chevron-right', 18, '#FFE600', 2.6)}</div>

  <div class="label"><i class="dot" style="background:#2CFF7A;box-shadow:0 0 10px #2CFF7A"></i>Money</div>
  <div class="money">
    <div class="tile ty"><div class="k">Contract value</div><div class="v">$4.82M</div><div class="s">+$142K approved COs</div></div>
    <div class="tile to"><div class="k">Billed to date</div><div class="v">$2.91M</div><div class="bar"><i style="width:60%"></i></div></div>
    <div class="tile tg"><div class="k">Paid to date</div><div class="v">$2.44M</div><div class="s">84% collected</div></div>
    <div class="tile tr"><div class="k">Open items</div><div class="v">7</div><div class="s">2 overdue · 3 RFIs</div></div>
  </div>

  <div class="label"><i class="dot" style="background:#FFE600;box-shadow:0 0 10px #FFE600"></i>Quick add</div>
  <div class="qa">
    ${[['file-text', 'Daily log', '#FFF04A', '#FFE600'], ['camera', 'Photo', '#FF8A00', '#FF8A00'], ['list-checks', 'Punch', '#2CFF7A', '#2CFF7A'], ['clock', 'Time', '#FFF04A', '#FFE600'], ['circle-help', 'RFI', '#FF8A00', '#FF8A00']]
    .map(([ic, l, a, b]) => `<div class="qb"><div class="qc" style="background:linear-gradient(160deg,${a},${b});box-shadow:0 8px 22px ${b}88,inset 0 1px 0 rgba(255,255,255,.6)">${icon(ic, 23, '#0A0A00', 2.4)}</div><span>${l}</span></div>`).join('')}
  </div>
</div>
${tabbar('Home')}`, `
.top{display:flex;align-items:flex-end;justify-content:space-between;margin:2px 0 11px}
.ttl{display:flex;align-items:center;gap:6px;font-size:27px;font-weight:900;letter-spacing:-.035em;margin-top:4px}
.bell{position:relative;width:42px;height:42px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14)}
.bell i{position:absolute;top:-3px;right:-3px;min-width:18px;height:18px;border-radius:9px;background:var(--o);color:#0A0A00;font:900 10.5px Inter;font-style:normal;display:grid;place-items:center;box-shadow:0 0 12px var(--o)}
.hero{position:relative;overflow:hidden;border-radius:24px;padding:14px 14px 12px;color:#0A0A00;
  background:linear-gradient(135deg,#FFF04A 0%,#FFE600 38%,#FF8A00 100%);
  box-shadow:0 18px 46px rgba(255,138,0,.42),inset 0 1px 0 rgba(255,255,255,.8)}
.hero::before{content:'';position:absolute;right:-50px;top:-80px;width:220px;height:220px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.55),transparent 65%)}
.hero>*{position:relative}
.hr1{display:flex;align-items:center;justify-content:space-between}
.hchip{display:inline-flex;align-items:center;gap:5px;background:#0A0A00;color:#FFE600;font-size:10px;font-weight:900;letter-spacing:.1em;padding:6px 10px;border-radius:99px}
.pct{font-size:34px;font-weight:900;letter-spacing:-.04em;line-height:1}.pct small{font-size:18px}
.hlab{font-size:13px;font-weight:800;margin-top:6px;opacity:.85}
.segs{display:flex;gap:5px;margin:8px 0 10px}
.segs i{flex:1;height:9px;border-radius:5px;background:rgba(10,10,0,.15)}
.segs i.d{background:#0A0A00}
.segs i.c{background:rgba(255,255,255,.55);box-shadow:inset 0 0 0 2px #0A0A00}
.next{display:flex;align-items:center;gap:11px;background:rgba(255,255,255,.42);border-radius:16px;padding:8px 8px 8px 10px}
.num{width:34px;height:34px;border-radius:50%;background:#0A0A00;color:#FFE600;font-weight:900;font-size:16px;display:grid;place-items:center}
.nk{font-size:9.5px;font-weight:900;letter-spacing:.14em;opacity:.7}
.nv{font-size:16.5px;font-weight:900;letter-spacing:-.02em}
.go{margin-left:auto;width:40px;height:40px;border-radius:50%;background:#0A0A00;display:grid;place-items:center;box-shadow:0 4px 12px rgba(0,0,0,.3)}
.att{display:flex;align-items:center;gap:11px;padding:7px 11px;border-radius:16px;margin-bottom:7px}
.att .ic{width:36px;height:36px;border-radius:11px;display:grid;place-items:center}
.att .at{flex:1;display:flex;flex-direction:column;gap:2px}
.att b{font-size:14.5px;font-weight:800}.att span{font-size:12px;font-weight:600;color:#A9B4C4}
.att.o{background:linear-gradient(90deg,rgba(255,138,0,.26),rgba(255,138,0,.06));border:1px solid rgba(255,138,0,.55)}
.att.o .ic{background:#FF8A00;box-shadow:0 0 18px rgba(255,138,0,.6)}
.att.b{background:linear-gradient(90deg,rgba(255,230,0,.2),rgba(255,230,0,.04));border:1px solid rgba(255,230,0,.5)}
.att.b .ic{background:linear-gradient(160deg,#FFF04A,#FFE600);box-shadow:0 0 18px rgba(255,230,0,.6)}
.money{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.tile{border-radius:18px;padding:9px 12px 9px;border:1px solid}
.tile .k{font-size:9.5px;font-weight:900;letter-spacing:.13em;text-transform:uppercase;color:#D4D4D8}
.tile .v{font-size:26px;font-weight:900;letter-spacing:-.035em;margin-top:3px;line-height:1.1}
.tile .s{font-size:11.5px;font-weight:700;margin-top:3px;color:#D4D4D8}
.tile .bar{height:6px;border-radius:3px;background:rgba(255,255,255,.12);margin-top:8px;overflow:hidden}
.tile .bar i{display:block;height:100%;border-radius:3px;background:#FF8A00;box-shadow:0 0 10px #FF8A00}
.ty{background:linear-gradient(160deg,rgba(255,230,0,.24),rgba(255,230,0,.04));border-color:rgba(255,230,0,.5)}.ty .v{color:#FFE600;text-shadow:0 0 20px rgba(255,230,0,.6)}
.to{background:linear-gradient(160deg,rgba(255,138,0,.24),rgba(255,138,0,.04));border-color:rgba(255,138,0,.5)}.to .v{color:#FF8A00;text-shadow:0 0 20px rgba(255,138,0,.6)}
.tg{background:linear-gradient(160deg,rgba(44,255,122,.2),rgba(44,255,122,.03));border-color:rgba(44,255,122,.45)}.tg .v{color:#2CFF7A;text-shadow:0 0 20px rgba(44,255,122,.55)}
.tr{background:linear-gradient(160deg,rgba(255,59,48,.22),rgba(255,59,48,.03));border-color:rgba(255,59,48,.5)}.tr .v{color:#FF3B30;text-shadow:0 0 20px rgba(255,59,48,.6)}
.qa{display:flex;justify-content:space-between;padding:0 2px}
.qb{display:flex;flex-direction:column;align-items:center;gap:6px;font-size:11px;font-weight:800;color:#D4D4D8}
.qc{width:52px;height:52px;border-radius:50%;display:grid;place-items:center}
`);

/* ───────────────────────── 2. DAILY LOG ───────────────────────── */
const dailyLog = page(`
<div class="content">
  ${sub('Daily logs')}
  <div class="card dl">
    <div class="dh">New daily log<span class="chip c-g">${icon('check', 11, '#2CFF7A', 3)} DRAFT SAVED</span></div>
    <div class="btn btn-y">${icon('wand-sparkles', 19, '#0A0A00', 2.4)} Auto-fill</div>
    <div class="btn btn-ol" style="margin-top:9px;height:44px;font-size:15px">${icon('copy', 17, '#FF8A00', 2.4)} Same as yesterday</div>
    <div class="stats">
      <div class="st"><div class="k">Last log</div><div class="v" style="color:#2CFF7A">Yesterday</div></div>
      <div class="st"><div class="k">Crew last</div><div class="v" style="color:#FFE600">14</div></div>
      <div class="st"><div class="k">Logs filed</div><div class="v" style="color:#FF8A00">86</div></div>
    </div>
    <div class="fl">Date</div>
    <div class="inp">Sun, Oct 4, 2026<span style="margin-left:auto">${icon('calendar', 19, '#FFE600', 2.3)}</span></div>
    <div class="auto"><span class="chip c-y">AUTO</span>Today's date, filled in for you</div>
    <div class="fl">Superintendent</div>
    <div class="inp">Marcus Reyes</div>
    <div class="fl" style="display:flex;align-items:center">Weather<span class="chip c-g" style="margin-left:auto;letter-spacing:.02em;font-size:11px">${icon('navigation', 11, '#2CFF7A', 2.6)} Auto weather</span></div>
    <div class="wx">
      <div class="sun">${icon('sun', 30, '#0A0A00', 2.4)}</div>
      <div><div class="wt">Sunny</div><div class="ws">Wind 6 mph · No delays</div></div>
      <div class="tmp"><b>94°</b><span>71°</span></div>
    </div>
    <div class="fl">Crew on site</div>
    <div class="crew"><span class="chip c-y">Electrical · 6</span><span class="chip c-o">Mechanical · 4</span><span class="chip c-g">Concrete · 4</span></div>
  </div>
</div>
${tabbar('Field')}`, `
.dl{padding:14px 14px 16px}
.dh{display:flex;align-items:center;justify-content:space-between;font-size:20px;font-weight:900;letter-spacing:-.02em;margin-bottom:12px}
.stats{display:grid;grid-template-columns:1.25fr 1fr 1fr;gap:7px;margin-top:11px}
.st{border-radius:13px;padding:8px 10px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12)}
.st .k{font-size:9px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:var(--dim)}
.st .v{font-size:17px;font-weight:900;margin-top:2px;letter-spacing:-.02em}
.auto{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;color:#D4D4D8;margin-top:7px}
.wx{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:15px;background:linear-gradient(110deg,rgba(255,230,0,.22),rgba(255,138,0,.12));border:1px solid rgba(255,230,0,.5)}
.sun{width:46px;height:46px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 35% 30%,#FFF04A,#FFE600 50%,#FF8A00);box-shadow:0 0 26px rgba(255,230,0,.8)}
.wt{font-size:17px;font-weight:900}.ws{font-size:12px;font-weight:700;color:#D4D4D8;margin-top:1px}
.tmp{margin-left:auto;text-align:right}.tmp b{display:block;font-size:24px;font-weight:900;color:#FFE600;text-shadow:0 0 14px rgba(255,230,0,.6);letter-spacing:-.03em}.tmp span{font-size:13px;font-weight:800;color:#A9B4C4}
.crew{display:flex;gap:6px;flex-wrap:wrap}.crew .chip{font-size:11.5px;letter-spacing:.01em;padding:6px 10px}
`);

/* ───────────────────────── 3. CHANGE ORDERS ───────────────────────── */
const COS = [
  ['CO #7', 'Add 2 data drops — Level 2 east', '$6,840', 'Waiting on owner · 2 days', 'o', 'PENDING'],
  ['CO #6', 'Upsize RTU-3 roof curb', '$18,450', 'Approved Sep 28 · Owner', 'g', 'APPROVED'],
  ['CO #5', 'Lobby millwork — owner upgrade', '$24,100', 'Approved Sep 19 · Owner', 'g', 'APPROVED'],
  ['CO #4', 'Rock at grid C-4 footing', '$32,060', 'Priced · 3 days on hold', 'r', 'HIGH RISK'],
  ['CO #3', 'Owner-added card readers', '$9,720', 'Approved Sep 2 · Owner', 'g', 'APPROVED'],
];
const COL = { o: '#FF8A00', g: '#2CFF7A', r: '#FF3B30' };
const changeOrders = page(`
<div class="content">
  ${sub('Change orders', true)}
  <div class="sum">
    <div><div class="k">Approved</div><div class="v" style="color:#2CFF7A;text-shadow:0 0 16px rgba(44,255,122,.55)">$142.3K</div></div>
    <div><div class="k">Pending</div><div class="v" style="color:#FF8A00;text-shadow:0 0 16px rgba(255,138,0,.55)">$38.9K</div></div>
    <div><div class="k">Contract</div><div class="v" style="color:#FFE600;text-shadow:0 0 16px rgba(255,230,0,.55)">+2.9%</div></div>
  </div>
  <div class="filters"><span class="f on">All · 7</span><span class="f">Pending · 2</span><span class="f">Approved · 4</span><span class="f">Rejected · 1</span></div>
  ${COS.map(([n, t, a, m, c, s]) => `
  <div class="co" style="--c:${COL[c]}">
    <div class="r1"><span class="no">${n}</span><span class="chip c-${c}">${s}</span></div>
    <div class="t">${t}</div>
    <div class="r2"><span class="amt">${a}</span><span class="m">${m}</span></div>
  </div>`).join('')}
</div>
${tabbar('Tools')}`, `
.sum{display:grid;grid-template-columns:repeat(3,1fr);border-radius:18px;padding:11px 4px;background:linear-gradient(110deg,rgba(44,255,122,.14),rgba(255,138,0,.14) 50%,rgba(255,230,0,.16));border:1px solid rgba(255,230,0,.4)}
.sum>div{text-align:center}.sum>div+div{border-left:1px solid rgba(255,255,255,.12)}
.sum .k{font-size:9.5px;font-weight:900;letter-spacing:.13em;text-transform:uppercase;color:#D4D4D8}
.sum .v{font-size:21px;font-weight:900;letter-spacing:-.03em;margin-top:3px}
.filters{display:flex;gap:6px;margin:11px 0 10px}
.f{font-size:12px;font-weight:800;padding:8px 11px;border-radius:99px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.13);color:#D4D4D8;white-space:nowrap}
.f.on{background:linear-gradient(180deg,#FFF04A,#FFE600);color:#0A0A00;border:none;box-shadow:0 4px 16px rgba(255,230,0,.5)}
.co{position:relative;overflow:hidden;border-radius:18px;padding:11px 13px 11px 17px;margin-bottom:8px;background:linear-gradient(100deg,color-mix(in srgb,var(--c) 17%,transparent),rgba(255,255,255,.035) 70%);border:1px solid color-mix(in srgb,var(--c) 45%,transparent)}
.co::before{content:'';position:absolute;left:0;top:0;bottom:0;width:5px;background:var(--c);box-shadow:0 0 14px var(--c)}
.r1{display:flex;align-items:center;justify-content:space-between}
.no{font-size:11.5px;font-weight:900;letter-spacing:.08em;color:#D4D4D8}
.co .t{font-size:15.5px;font-weight:800;margin:5px 0 6px;letter-spacing:-.015em}
.r2{display:flex;align-items:baseline;gap:9px}
.amt{font-size:21px;font-weight:900;letter-spacing:-.03em;color:var(--c);text-shadow:0 0 14px color-mix(in srgb,var(--c) 60%,transparent)}
.m{font-size:12px;font-weight:700;color:#A9B4C4}
`);

/* ───────────────────────── 4. TIME CLOCK ───────────────────────── */
const CREW = [['MR', 'Marcus Reyes', 'Superintendent', '6:42', '#FFE600'], ['JO', 'Jamal Ortiz', 'Concrete · 03-300', '6:31', '#FF8A00'], ['LT', 'Linh Tran', 'Electrical · 26-050', '6:10', '#2CFF7A'], ['DK', 'Dana Kim', 'Mechanical · 23-000', '5:58', '#FFF04A']];
const ring = (() => {
  const r = 70, c = 2 * Math.PI * r, p = 0.78;
  return `<svg width="170" height="170" viewBox="0 0 170 170"><defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFE600"/><stop offset=".55" stop-color="#2CFF7A"/><stop offset="1" stop-color="#2CFF7A"/></linearGradient></defs>
  <circle cx="85" cy="85" r="${r}" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="13"/>
  <circle cx="85" cy="85" r="${r}" fill="none" stroke="url(#rg)" stroke-width="13" stroke-linecap="round" stroke-dasharray="${c * p} ${c}" transform="rotate(-90 85 85)"/></svg>`;
})();
const timeClock = page(`
<div class="content">
  ${sub('Time clock')}
  <div class="tc">
    <span class="chip c-g live"><i></i>ON THE CLOCK</span>
    <div class="ringw">${ring}<div class="rc"><b>6:42</b><span>hours today</span></div></div>
    <div class="meta"><div><span>In at</span><b>6:58 AM</b></div><div><span>Break</span><b>30 min</b></div><div><span>Week</span><b style="color:#FFE600">38.5 h</b></div></div>
  </div>
  <div class="gps">${icon('map-pin', 19, '#0A0A00', 2.5)}<div><b>On site · 38 ft from Gate B</b><span>GPS verified 6:58 AM</span></div><span class="chip c-g" style="margin-left:auto">${icon('check', 11, '#2CFF7A', 3)} OK</span></div>
  <div class="cc">${icon('hard-hat', 19, '#FFE600', 2.3)}<span><b>03-300</b> · Cast-in-place concrete</span>${icon('chevron-down', 17, '#FFE600', 2.6)}</div>
  <div class="btn out">${icon('timer', 20, '#fff', 2.5)} Clock out</div>
  <div class="label" style="margin-top:14px"><i class="dot" style="background:#2CFF7A;box-shadow:0 0 10px #2CFF7A"></i>Crew on the clock<span class="cnt">9</span></div>
  ${CREW.map(([i, n, r, h, c]) => `<div class="cr"><div class="av" style="background:${c};box-shadow:0 0 14px ${c}99">${i}</div><div class="cn"><b>${n}</b><span>${r}</span></div><b class="hh" style="color:${c}">${h}</b></div>`).join('')}
</div>
${tabbar('Field')}`, `
.tc{position:relative;border-radius:22px;padding:12px 14px 12px;text-align:center;background:radial-gradient(70% 70% at 50% 45%,rgba(44,255,122,.22),transparent 70%),linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.03));border:1px solid rgba(44,255,122,.4)}
.live{position:absolute;left:12px;top:12px}.live i{width:7px;height:7px;border-radius:50%;background:#2CFF7A;box-shadow:0 0 8px #2CFF7A}
.ringw{position:relative;width:170px;height:170px;margin:14px auto 4px}
.rc{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.rc b{font-size:44px;font-weight:900;letter-spacing:-.04em;line-height:1;text-shadow:0 0 22px rgba(44,255,122,.5)}
.rc span{font-size:12px;font-weight:800;color:#A9B4C4;margin-top:4px;letter-spacing:.04em}
.meta{display:grid;grid-template-columns:repeat(3,1fr);margin-top:6px}
.meta div{display:flex;flex-direction:column;gap:2px}.meta div+div{border-left:1px solid rgba(255,255,255,.12)}
.meta span{font-size:9.5px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:var(--dim)}.meta b{font-size:15px;font-weight:900}
.gps{display:flex;align-items:center;gap:11px;margin-top:10px;padding:9px 11px;border-radius:15px;background:linear-gradient(90deg,rgba(44,255,122,.2),rgba(44,255,122,.04));border:1px solid rgba(44,255,122,.5)}
.gps>svg:first-child{padding:8px;width:36px;height:36px;border-radius:11px;background:#2CFF7A;box-shadow:0 0 16px rgba(44,255,122,.6)}
.gps b{display:block;font-size:14px;font-weight:800}.gps div span{font-size:11.5px;font-weight:700;color:#A9B4C4}
.cc{display:flex;align-items:center;gap:10px;margin-top:8px;height:44px;padding:0 13px;border-radius:14px;background:rgba(255,230,0,.08);border:1.5px solid rgba(255,230,0,.5);font-size:14.5px;font-weight:700}
.cc span{flex:1}.cc b{color:#FFE600;font-weight:900}
.out{margin-top:10px;height:52px;color:#fff;background:linear-gradient(135deg,#FF8A00 0%,#FF3B30 100%);box-shadow:0 10px 28px rgba(255,59,48,.5),inset 0 1px 0 rgba(255,255,255,.45)}
.cr{display:flex;align-items:center;gap:11px;padding:8px 2px;border-bottom:1px solid rgba(255,255,255,.07)}
.av{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;color:#0A0A00;font-size:12.5px;font-weight:900}
.cn{flex:1}.cn b{display:block;font-size:14.5px;font-weight:800}.cn span{font-size:12px;font-weight:600;color:#A9B4C4}
.hh{font-size:17px;font-weight:900;letter-spacing:-.02em}
`);

/* ───────────────────────── 5. PUNCH LIST ───────────────────────── */
const PUNCH = [
  ['paintbrush', 'Touch-up paint at door frame', 'Paint · L2 · Room 214', 'OPEN', 'o', '#FF8A00'],
  ['zap', 'Missing outlet cover plate', 'Electrical · L1 · Lobby', 'READY', 'y', '#FFE600'],
  ['layers', 'Replace stained ceiling tile', 'Ceilings · L3 · Room 305', 'OPEN', 'o', '#FF8A00'],
  ['wrench', 'Adjust door closer — Stair A', 'Doors · L1 · Stair A', 'CLOSED', 'g', '#2CFF7A'],
  ['droplets', 'Seal penetration above RTU-3', 'Roofing · Roof · Grid D-6', 'CLOSED', 'g', '#2CFF7A'],
  ['hard-hat', 'Patch drywall at corridor 118', 'Drywall · L1 · Corridor 118', 'OPEN', 'o', '#FF8A00'],
];
const pring = (() => {
  const r = 38, c = 2 * Math.PI * r, p = 42 / 58;
  return `<svg width="96" height="96" viewBox="0 0 96 96"><defs><linearGradient id="pg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFE600"/><stop offset="1" stop-color="#2CFF7A"/></linearGradient></defs>
  <circle cx="48" cy="48" r="${r}" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="10"/>
  <circle cx="48" cy="48" r="${r}" fill="none" stroke="url(#pg)" stroke-width="10" stroke-linecap="round" stroke-dasharray="${c * p} ${c}" transform="rotate(-90 48 48)"/></svg>`;
})();
const punch = page(`
<div class="content">
  ${sub('Punch list', true)}
  <div class="pc">
    <div class="pr">${pring}<b>72%</b></div>
    <div class="pt"><div class="big">42 <span>of 58 closed</span></div>
      <div class="pb"><i style="width:72%"></i></div>
      <div class="ps"><span style="color:#FF8A00">16 open</span> · <span style="color:#FF3B30">2 overdue</span> · <span style="color:#FFE600">5 mine</span></div></div>
  </div>
  <div class="filters"><span class="f on">Open · 16</span><span class="f">Closed · 42</span><span class="f">Mine · 5</span><span class="f">Overdue · 2</span></div>
  ${PUNCH.map(([ic, t, m, s, c, col]) => `
  <div class="pi"><div class="pic" style="background:linear-gradient(160deg,${col}, color-mix(in srgb,${col} 55%,#000));box-shadow:0 0 16px ${col}88">${icon(ic, 20, '#0A0A00', 2.4)}</div>
    <div class="pm"><b${s === 'CLOSED' ? ' class="done"' : ''}>${t}</b><span>${m}</span></div><span class="chip c-${c}">${s}</span></div>`).join('')}
</div>
${tabbar('Field')}`, `
.pc{display:flex;align-items:center;gap:14px;padding:12px 14px;border-radius:20px;background:linear-gradient(110deg,rgba(255,230,0,.18),rgba(44,255,122,.14));border:1px solid rgba(44,255,122,.45)}
.pr{position:relative;width:96px;height:96px}.pr b{position:absolute;inset:0;display:grid;place-items:center;font-size:22px;font-weight:900;letter-spacing:-.03em}
.pt{flex:1}.big{font-size:30px;font-weight:900;letter-spacing:-.04em;color:#2CFF7A;text-shadow:0 0 18px rgba(44,255,122,.55)}.big span{font-size:14px;font-weight:800;color:#fff;letter-spacing:-.01em;text-shadow:none}
.pb{height:7px;border-radius:4px;background:rgba(255,255,255,.12);margin:7px 0 7px;overflow:hidden}.pb i{display:block;height:100%;border-radius:4px;background:linear-gradient(90deg,#FFE600,#2CFF7A);box-shadow:0 0 10px rgba(44,255,122,.7)}
.ps{font-size:12px;font-weight:800}
.filters{display:flex;gap:6px;margin:11px 0 10px}
.f{font-size:12px;font-weight:800;padding:8px 11px;border-radius:99px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.13);color:#D4D4D8;white-space:nowrap}
.f.on{background:#FF8A00;color:#0A0A00;border:none;box-shadow:0 4px 16px rgba(255,138,0,.55)}
.pi{display:flex;align-items:center;gap:11px;padding:10px 11px;border-radius:16px;margin-bottom:7px;background:linear-gradient(180deg,rgba(255,255,255,.075),rgba(255,255,255,.03));border:1px solid rgba(255,255,255,.11)}
.pic{width:40px;height:40px;border-radius:12px;display:grid;place-items:center}
.pm{flex:1;min-width:0}.pm b{display:block;font-size:14px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pm b.done{color:#A9B4C4}.pm span{font-size:11.5px;font-weight:600;color:#A9B4C4}
`);

/* ───────────────────────── 6. TAKEOFF STUDIO ───────────────────────── */
const takeoff = page(`
<div class="content">
  ${sub('Takeoff Studio', true)}
  <div class="nt"><div class="ntic">${icon('ruler', 22, '#FFE600', 2.4)}</div><div><b>New takeoff — measure &amp; price</b><span>Plan → Measure → Price → Save</span></div>${icon('chevron-right', 20, '#0A0A00', 2.8)}</div>
  <div class="ai">
    <div class="aik">${icon('sparkles', 14, '#FFE600', 2.4)} AI BLUEPRINT TAKEOFF</div>
    <div class="ait">Turn a blueprint into a priced estimate.</div>
    <div class="feat">${['Quantities from the drawing', 'CSI-coded line items', 'Material + labor split', 'Cost per SF · confidence'].map(f => `<div>${icon('circle-check-big', 15, '#2CFF7A', 2.6)}<span>${f}</span></div>`).join('')}</div>
    <div class="btn btn-y" style="margin-top:12px">${icon('upload', 19, '#0A0A00', 2.5)} Upload blueprint</div>
  </div>
  <div class="label"><i class="dot"></i>Estimates &amp; takeoffs</div>
  <div class="est">
    <div class="er1"><b>Level 1–3 core &amp; shell</b><span class="chip c-g">COMPLETE</span></div>
    <div class="ek">Project total</div>
    <div class="ev">$4,215,600</div>
    <div class="stack"><i style="width:46%;background:#FFE600;box-shadow:0 0 10px #FFE600"></i><i style="width:38%;background:#FF8A00;box-shadow:0 0 10px #FF8A00"></i><i style="width:16%;background:#2CFF7A;box-shadow:0 0 10px #2CFF7A"></i></div>
    <div class="lg"><span><i style="background:#FFE600"></i>Material 46%</span><span><i style="background:#FF8A00"></i>Labor 38%</span><span><i style="background:#2CFF7A"></i>Equip 16%</span></div>
  </div>
  <div class="est" style="margin-top:9px;background:linear-gradient(160deg,rgba(255,230,0,.16),rgba(255,255,255,.03) 60%);border-color:rgba(255,230,0,.45)">
    <div class="er1"><b>Site work &amp; utilities</b><span class="chip c-y">IN PROGRESS</span></div>
    <div class="ek">Project total</div>
    <div class="ev" style="color:#FFE600;text-shadow:0 0 22px rgba(255,230,0,.6)">$612,480</div>
  </div>
</div>
${tabbar('Tools')}`, `
.nt{display:flex;align-items:center;gap:12px;padding:12px 12px 12px 12px;border-radius:20px;color:#0A0A00;background:linear-gradient(135deg,#FFF04A 0%,#FFE600 45%,#FF8A00 100%);box-shadow:0 14px 36px rgba(255,138,0,.45),inset 0 1px 0 rgba(255,255,255,.8)}
.ntic{width:42px;height:42px;border-radius:13px;background:#0A0A00;display:grid;place-items:center}
.nt b{display:block;font-size:15.5px;font-weight:900;letter-spacing:-.02em}.nt span{font-size:11.5px;font-weight:800;opacity:.75}
.nt>div:nth-child(2){flex:1}
.ai{position:relative;overflow:hidden;margin-top:11px;border-radius:20px;padding:13px 14px 14px 18px;background:radial-gradient(80% 60% at 100% 0%,rgba(255,230,0,.2),transparent 70%),linear-gradient(180deg,rgba(255,255,255,.08),rgba(255,255,255,.03));border:1px solid rgba(255,230,0,.35)}
.ai::before{content:'';position:absolute;left:0;top:0;bottom:0;width:5px;background:linear-gradient(180deg,#FFE600,#FF8A00);box-shadow:0 0 14px #FFE600}
.aik{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:900;letter-spacing:.15em;color:#FFE600}
.ait{font-size:23px;font-weight:900;letter-spacing:-.035em;line-height:1.12;margin:7px 0 10px}
.feat{display:grid;grid-template-columns:1fr 1fr;gap:8px 10px}.feat div{display:flex;align-items:flex-start;gap:6px;font-size:12px;font-weight:800;line-height:1.25}
.est{border-radius:20px;padding:12px 14px 13px;background:linear-gradient(160deg,rgba(255,138,0,.18),rgba(255,255,255,.03) 60%);border:1px solid rgba(255,138,0,.45)}
.er1{display:flex;align-items:center;justify-content:space-between}.er1 b{font-size:16px;font-weight:900}
.ek{font-size:10px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);margin-top:8px}
.ev{font-size:32px;font-weight:900;letter-spacing:-.04em;color:#FF8A00;text-shadow:0 0 22px rgba(255,138,0,.6)}
.stack{display:flex;gap:4px;height:9px;margin:8px 0 8px}.stack i{display:block;height:100%;border-radius:5px}
.lg{display:flex;gap:12px;font-size:11.5px;font-weight:800;color:#D4D4D8}.lg span{display:flex;align-items:center;gap:5px}.lg i{width:8px;height:8px;border-radius:50%}
`);

const SCREENS = { 'phone-project': home, 'phone-daily-log': dailyLog, 'phone-change-orders': changeOrders, 'phone-time-clock': timeClock, 'phone-punch-list': punch, 'phone-takeoff': takeoff };

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3 });
const pg = await ctx.newPage();
for (const [name, html] of Object.entries(SCREENS)) {
  const f = path.join(TMP, `${name}.html`);
  fs.writeFileSync(f, html);
  await pg.goto(pathToFileURL(f).href);
  await pg.evaluate(() => document.fonts.ready);
  await pg.waitForTimeout(150);
  // Overflow guard: nothing may stick out past the right edge of the screen.
  const over = await pg.evaluate(() => [...document.querySelectorAll('.content *')].filter(e => e.getBoundingClientRect().right > 393.5).map(e => e.className || e.tagName).slice(0, 5));
  const raw = await pg.screenshot();
  // Palette PNG: ~270 KB instead of ~1.3 MB, no visible banding at this dither.
  await sharp(raw).png({ palette: true, quality: 92, effort: 10, compressionLevel: 9, dither: 0.6 }).toFile(path.join(OUT, `${name}.png`));
  console.log(name, over.length ? 'OVERFLOW: ' + over.join(',') : 'ok');
}
await browser.close();
fs.rmSync(TMP, { recursive: true, force: true });
