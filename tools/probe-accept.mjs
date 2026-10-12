/**
 * tools/probe-accept.mjs — the one signed-in acceptance pass for the redesign
 * round (#150/#151) on production. One signed-in session per width, reused:
 * 1440 (Chromium) and 390 (WebKit, iPhone 15 metrics — mobile web, NOT iOS).
 *
 *   1. Screens: Home, My Work, Jobs, job page, deal page, Command Center,
 *      Compliance, Prequalification, invoice, pay app, daily log. Per screen:
 *      screenshot + text under 12px, low contrast, cut-off text, sideways
 *      scroll, status pill beside the title, selected-state colours, yellow
 *      buttons, fixed overlays that overlap, small targets (390).
 *   2. Shared component states once (Jobs, 1440): primary / secondary hover,
 *      keyboard focus ring, selected chip, disabled button.
 *   3. Interactions: Jobs filter + search + row open; job page tool tile,
 *      Details disclosure, steps, Archive dialog (cancelled); Home / My Work
 *      tabs; Command Center tile. Deal page on a ZZ AUDIT test lead made for
 *      this run: stage move, activity add, Edit Deal save — each reopened and
 *      read back — the delete dialog cancelled once, then confirmed (the test
 *      lead is removed). Invoice, pay app and daily log are opened read-only.
 *
 * Writes only the test lead it creates. Results go to tools/probe (encrypted
 * by the workflow; screenshots never leave the encrypted bundle).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const SITE = (process.env.SITE || 'https://www.saguarocontrol.net').replace(/\/$/, '');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'tools/probe');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
const require = createRequire(path.join(process.env.PLAYWRIGHT_DIR, 'noop.js'));
const pw = require('playwright');
if (!process.env.E2E_EMAIL || !process.env.E2E_PASSWORD) throw new Error('no login');
const JOB = 'ZZ AUDIT Walk Job 10101543';
const STAMP = Date.now().toString().slice(-6);
const R = { site: SITE, startedAt: new Date().toISOString(), ids: {}, screens: {}, states: {}, checks: [], error: null };

const check = (name, ok, detail) => {
  R.checks.push({ name, ok: !!ok, detail: detail == null ? undefined : String(detail).slice(0, 200) });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail != null ? ' — ' + String(detail).slice(0, 120) : ''}`);
};
const shot = (page, name, full = false) => page.screenshot({ path: path.join(OUT, 'shots', `${name}.jpg`), type: 'jpeg', quality: 60, fullPage: full }).catch(() => {});

async function login(page) {
  await page.goto(`${SITE}/login`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.fill('input[name="email"]', process.env.E2E_EMAIL.trim());
  await page.fill('input[name="password"]', process.env.E2E_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 90000 });
}
async function open(page, url) {
  try { await page.goto(`${SITE}${url}`, { waitUntil: 'networkidle', timeout: 35000 }); }
  catch { await page.waitForTimeout(2500); }
  await page.waitForTimeout(1000);
}
async function firstLink(page, listUrl, prefix) {
  await open(page, listUrl);
  return page.evaluate((prefix) => {
    const as = [...document.querySelectorAll('a[href]')]
      .map((a) => ({ h: new URL(a.href).pathname, t: (a.textContent || '') + ' ' + (a.closest('tr,li,[role=row]')?.textContent || '') }))
      .filter((a) => a.h.startsWith(prefix) && a.h.length > prefix.length && !a.h.slice(prefix.length).includes('/new'));
    const zz = as.find((a) => /zz audit/i.test(a.t));
    const pick = (zz || as[0]);
    return pick ? { id: pick.h.slice(prefix.length).split('/')[0], zz: !!zz } : null;
  }, prefix);
}

/* Per-screen measurements. */
const measure = (page, phone) => page.evaluate((phone) => {
  const main = document.querySelector('.main-content-area') || document.querySelector('main') || document.body;
  const rgb = (s) => (s.match(/[\d.]+/g) || []).map(Number);
  const isY = (s) => { const c = rgb(s); return c.length >= 3 && Math.abs(c[0] - 255) < 12 && Math.abs(c[1] - 224) < 22 && c[2] < 60 && (c[3] === undefined || c[3] > 0.5); };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c.length >= 3 && (c[3] === undefined || c[3] > 0.6)) return c; } return [16, 23, 34]; };
  const vis = (el) => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05; };
  const ownText = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
  const small = [], lowC = [], cut = [], errs = [];
  let targets = 0;
  for (const el of [...main.querySelectorAll('*')].filter(vis)) {
    const cs = getComputedStyle(el); const t = ownText(el);
    if (t) {
      const fs = parseFloat(cs.fontSize);
      if (fs < 12) small.push(`${t.slice(0, 30)} @${fs}`);
      const c = rgb(cs.color); const b = bgOf(el);
      if (c.length >= 3) { const L1 = lum(c), L2 = lum(b); const r = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05); if (r < 4.5 && fs < 18) lowC.push(`${t.slice(0, 30)} ${r.toFixed(1)}`); }
      if (el.scrollWidth > el.clientWidth + 1 && /hidden|clip/.test(cs.overflow + cs.overflowX) && cs.textOverflow !== 'ellipsis' && !el.title && !el.closest('[title]')) cut.push(t.slice(0, 30));
      if (/something went wrong|couldn.t load|failed to|unauthori[sz]ed|forbidden|page not found|\b404\b/i.test(t)) errs.push(t.slice(0, 70));
    }
    const r = el.getBoundingClientRect();
    if (phone && el.matches('button, [role="button"], select, input:not([type=hidden]), a.k-btn, a.fl-act') && r.height < 43.5 && r.width < 43.5 && r.top < innerHeight * 3) targets++;
  }
  // Yellow-filled controls outside navigation: the screen's primary actions.
  const yButtons = [...main.querySelectorAll('button, a')].filter((el) => vis(el) && isY(getComputedStyle(el).backgroundColor) && !el.closest('nav, aside, .sag-tabbar, [role=tablist], .k-stages, .jl-chips') && !el.matches('[aria-pressed=true],[aria-selected=true],[aria-current]'))
    .map((el) => (el.textContent || '').trim().slice(0, 24));
  // Selected states and their colours.
  const selected = [...main.querySelectorAll('[aria-pressed="true"], [aria-selected="true"], [aria-current="step"]')].filter(vis)
    .map((el) => ({ t: (el.textContent || '').trim().slice(0, 20), bg: getComputedStyle(el).backgroundColor, fg: getComputedStyle(el).color, yellow: isY(getComputedStyle(el).backgroundColor) || isY(getComputedStyle(el).borderBottomColor) }));
  // Status pill beside the title.
  const h1 = document.querySelector('.main-content-area h1, main h1, h1');
  const titleRow = h1?.closest('.k-title-row, .jx-title');
  const pill = titleRow?.querySelector('.k-badge, .jx-pill, .idBadges, .pdBadges, .dldBadges');
  // Fixed overlays (status box, toasts, sheets) and whether any overlap each other or the tab bar.
  const fixed = [...document.querySelectorAll('body *')].filter((el) => { const cs = getComputedStyle(el); return (cs.position === 'fixed') && vis(el) && el.getBoundingClientRect().height > 20 && el.getBoundingClientRect().height < innerHeight * 0.9; })
    .filter((el) => !el.closest('.sag-topbar, .sidebar-desktop, aside') && !el.matches('.sag-topbar, aside'))
    .map((el) => { const r = el.getBoundingClientRect(); return { cls: (el.className && String(el.className).slice(0, 40)) || el.tagName, role: el.getAttribute('role'), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; });
  const ov = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const overlaps = [];
  for (let i = 0; i < fixed.length; i++) for (let j = i + 1; j < fixed.length; j++) if (ov(fixed[i], fixed[j]) && !(fixed[i].w >= innerWidth - 2 && fixed[j].w >= innerWidth - 2 && fixed[i].h > innerHeight * 0.5)) overlaps.push(`${fixed[i].cls} × ${fixed[j].cls}`);
  return {
    title: (h1?.textContent || document.title || '').trim().slice(0, 60),
    h1: h1 ? `${parseFloat(getComputedStyle(h1).fontSize)}/${getComputedStyle(h1).fontWeight}` : null,
    url: location.pathname,
    sideScroll: document.scrollingElement.scrollWidth > innerWidth + 1,
    pill: pill ? (pill.textContent || '').trim().slice(0, 30) : null,
    small: small.length, smallS: small.slice(0, 5), lowC: lowC.length, lowCS: lowC.slice(0, 5),
    cut: cut.length, cutS: cut.slice(0, 5), err: errs.slice(0, 3), targets,
    yButtons, selected: selected.slice(0, 8), fixed: fixed.slice(0, 8), overlaps,
    height: document.scrollingElement.scrollHeight,
  };
}, phone);

async function screen(page, key, url, w) {
  await open(page, url);
  const m = await measure(page, w === '390');
  (R.screens[key] ||= {})[w] = m;
  await shot(page, `${key}-${w}`, w === '390');
  console.log(`${key} ${w} side=${m.sideScroll} s${m.small} c${m.lowC} cut${m.cut} t${m.targets} y${m.yButtons.length} pill=${m.pill ? 'y' : 'n'} ov${m.overlaps.length}${m.err.length ? ' ERR' : ''}`);
  return m;
}

const desktop = await pw.chromium.launch();
const phoneBrowser = await pw.webkit.launch();
try {
  const desk = await desktop.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  const phoneCtx = await phoneBrowser.newContext({ ...pw.devices['iPhone 15'], deviceScaleFactor: 2, colorScheme: 'dark' });
  const gc = await desk.newPage();
  const ph = await phoneCtx.newPage();
  await login(gc); await login(ph);
  const api = gc.request;

  /* ── Records ── */
  const jobs = (await (await api.get(`${SITE}/api/projects?limit=1000&fields=id,name`)).json()).projects || [];
  R.ids.projectId = jobs.find((j) => j.name === JOB)?.id || null;
  const P = `/app/projects/${R.ids.projectId}`;
  const inv = await firstLink(gc, '/app/invoicing', '/app/invoicing/').catch(() => null);
  const pa = await firstLink(gc, `${P}/pay-apps`, `${P}/pay-apps/`).catch(() => null);
  const dl = await firstLink(gc, '/app/daily-logs', '/app/daily-logs/').catch(() => null);
  R.ids.invoice = inv && { ok: true, zz: inv.zz }; R.ids.payApp = pa && { ok: true, zz: pa.zz }; R.ids.dailyLog = dl && { ok: true, zz: dl.zz };
  // The deal-page test record: created here, removed at the end through the UI.
  const created = await api.post(`${SITE}/api/leads`, { data: {
    company_name: `ZZ AUDIT Accept ${STAMP}`, contact_name: 'ZZ AUDIT Contact', contact_email: 'delivered@resend.dev',
    stage: 'New', estimated_value: 50000, probability: 20, source: 'Referral', project_type: 'Commercial', location: 'Phoenix, AZ',
    next_action: 'ZZ AUDIT first step',
  } });
  const cj = await created.json().catch(() => ({}));
  const leadId = cj.lead?.id || cj.id || cj.data?.id || null;
  check('test lead created (POST /api/leads)', created.ok() && !!leadId, created.status());
  console.log('ids', JSON.stringify({ projectId: !!R.ids.projectId, invoice: R.ids.invoice, payApp: R.ids.payApp, dailyLog: R.ids.dailyLog, lead: !!leadId }));

  const SCREENS = [
    ['home', '/app'], ['my-work', '/app/my-work'], ['jobs', '/app/projects'],
    ['job', `${P}/overview`], ['deal', leadId ? `/app/leads/${leadId}` : null],
    ['command-center', '/app/command-center'], ['compliance', '/app/compliance'], ['prequalification', '/app/prequalification'],
    ['invoice', inv ? `/app/invoicing/${inv.id}` : null], ['pay-app', pa ? `${P}/pay-apps/${pa.id}` : null],
    ['daily-log', dl ? `/app/daily-logs/${dl.id}` : null],
  ];

  /* ── 1. Screens at both widths ── */
  for (const [key, url] of SCREENS) {
    if (!url) { R.screens[key] = { blocked: 'no record' }; console.log(key, 'BLOCKED no record'); continue; }
    for (const [w, page] of [['1440', gc], ['390', ph]]) {
      try { await screen(page, key, url, w); }
      catch (e) { (R.screens[key] ||= {})[w] = { error: String(e.message || e).split('\n')[0].slice(0, 140) }; console.log(key, w, 'ERROR'); }
    }
  }
  for (const k of ['deal', 'invoice', 'pay-app', 'daily-log']) {
    for (const w of ['1440', '390']) { const m = R.screens[k]?.[w]; if (m && !m.error && !m.blocked) check(`${k} ${w}: status pill beside the title`, !!m.pill, m.pill); }
  }

  /* ── 2. Shared component states (once, 1440 on Jobs) ── */
  await open(gc, '/app/projects');
  const st = {};
  const style = (loc) => loc.evaluate((el) => { const cs = getComputedStyle(el); return { bg: cs.backgroundColor, fg: cs.color, border: cs.borderColor, outline: `${cs.outlineStyle} ${cs.outlineColor} ${cs.outlineWidth}`, opacity: cs.opacity }; });
  const primary = gc.locator('a.fl-act[data-k=primary]').first();
  if (await primary.count()) {
    st.primary = await style(primary);
    await primary.hover(); await gc.waitForTimeout(250); st.primaryHover = await style(primary);
    await gc.mouse.move(5, 5);
    await gc.keyboard.press('Tab'); await primary.focus(); await gc.waitForTimeout(150); st.primaryFocus = await style(primary);
  }
  const chip = gc.locator('button.jl-chip').filter({ hasText: /^Building/ }).first();
  const chipAll = gc.locator('button.jl-chip').filter({ hasText: /^All/ }).first();
  if (await chip.count()) {
    st.chip = await style(chip); await chip.hover(); await gc.waitForTimeout(200); st.chipHover = await style(chip);
    st.chipSelected = await style(chipAll);
  }
  R.states = st;
  check('primary action is #FFE000 on #101722', /255, 224, 0/.test(st.primary?.bg || '') && /16, 23, 34/.test(st.primary?.fg || ''), `${st.primary?.bg} / ${st.primary?.fg}`);
  check('primary hover darkens', st.primaryHover && st.primaryHover.bg !== st.primary.bg, st.primaryHover?.bg);
  check('keyboard focus ring is #38BDF8', /56, 189, 248/.test(st.primaryFocus?.outline || ''), st.primaryFocus?.outline);
  check('selected stage chip is the selected-control yellow', /255, 224, 0/.test(st.chipSelected?.bg || ''), st.chipSelected?.bg);
  check('unselected chip hover changes', st.chipHover && st.chipHover.bg !== st.chip?.bg, st.chipHover?.bg);

  /* ── 3. Interactions ── */
  // Jobs: filter, search, open.
  for (const [w, page] of [['1440', gc], ['390', ph]]) {
    await open(page, '/app/projects');
    const rows = () => page.locator('li[data-tour="project-card"]').count();
    const all = await rows();
    const b = page.locator('button.jl-chip').filter({ hasText: /^Building/ }).first();
    if (await b.count()) {
      await b.click(); await page.waitForTimeout(400);
      const pressed = await b.getAttribute('aria-pressed');
      const n = await rows();
      check(`jobs ${w}: Building filter selects and narrows`, pressed === 'true' && n <= all, `${n} of ${all}`);
      await shot(page, `jobs-filter-${w}`);
      await page.locator('button.jl-chip').filter({ hasText: /^All/ }).first().click(); await page.waitForTimeout(300);
    }
    await page.fill('input.jl-search', 'ZZ AUDIT'); await page.waitForTimeout(400);
    const texts = await page.locator('li[data-tour="project-card"]').allTextContents();
    check(`jobs ${w}: search narrows to matching jobs`, texts.length > 0 && texts.every((t) => /zz audit/i.test(t)), `${texts.length} rows`);
    const link = page.locator('li[data-tour="project-card"] a').filter({ hasText: JOB }).first();
    if (await link.count()) {
      await link.click(); await page.waitForURL((u) => u.pathname.includes(R.ids.projectId || '§'), { timeout: 20000 }).catch(() => {});
      check(`jobs ${w}: row opens the job`, page.url().includes(R.ids.projectId || '§'), new URL(page.url()).pathname.replace(R.ids.projectId || '', ':id'));
    }
  }

  // Job page: tool tile, Details, steps, Archive dialog (cancelled).
  if (R.ids.projectId) {
    await open(gc, `${P}/overview`);
    const tiles = gc.locator('.fl-list[data-grid] a.fl-tool');
    const nTiles = await tiles.count();
    check('job: tools render as tiles', nTiles >= 4, nTiles);
    const steps = await gc.locator('ol.jx-steps > li').count();
    check('job: numbered steps render', steps >= 4, steps);
    const disc = gc.locator('button.jx-disc').filter({ hasText: 'Details' }).first();
    if (await disc.count()) { await disc.click(); await gc.waitForTimeout(300); check('job: Details opens in place', (await disc.getAttribute('aria-expanded')) === 'true' && (await gc.locator('.jx-dl').count()) > 0); }
    await shot(gc, 'job-details-open-1440', true);
    const arch = gc.locator('button.jx-danger').first();
    if (await arch.count()) {
      await arch.click();
      const dlg = gc.locator('[role=alertdialog]');
      await dlg.waitFor({ timeout: 8000 }).catch(() => {});
      const shown = await dlg.count();
      check('job: Archive asks first (confirm dialog)', shown > 0);
      if (shown) {
        const ds = await dlg.evaluate((el) => { const cs = getComputedStyle(el); return { bg: cs.backgroundColor, r: cs.borderRadius }; });
        R.states.dialog = ds;
        check('dialog uses the modal surface #1B2636', /27, 38, 54/.test(ds.bg), ds.bg);
        await shot(gc, 'dialog-archive-1440');
        await dlg.getByRole('button', { name: 'Cancel' }).click(); await gc.waitForTimeout(500);
        check('job: Cancel leaves the job in place', (await gc.locator('[role=alertdialog]').count()) === 0 && gc.url().includes('/overview'));
      }
    }
    const first = tiles.first();
    if (nTiles) {
      const href = await first.getAttribute('href');
      await first.click(); await gc.waitForURL((u) => u.pathname === href, { timeout: 20000 }).catch(() => {});
      check('job: a tool tile opens its tool', new URL(gc.url()).pathname === href, href?.replace(R.ids.projectId, ':id'));
    }
  }

  // Home and My Work: tabs, a row opens.
  for (const [key, url] of [['home', '/app'], ['my-work', '/app/my-work']]) {
    await open(gc, url);
    const tabs = gc.locator('.fl-tabs [role=tab]');
    if ((await tabs.count()) > 1) {
      const t = tabs.nth(1); await t.click(); await gc.waitForTimeout(400);
      const sel = await t.getAttribute('aria-selected');
      const bg = await t.evaluate((el) => getComputedStyle(el).backgroundColor);
      check(`${key}: tab switches in place and is lit`, sel === 'true' && /255, 224, 0/.test(bg), bg);
      await tabs.first().click(); await gc.waitForTimeout(300);
    } else check(`${key}: tabs`, true, 'no tab row with this data');
    const brief = await gc.locator('.fl-brief').count();
    if (key === 'home') check('home: brief is the alert card', brief > 0 && (await gc.locator('.fl-brief .fl-brief-ic').count()) > 0, brief);
    const rowLink = gc.locator('a.fl-row').first();
    if (await rowLink.count()) {
      const before = new URL(gc.url()).pathname; await rowLink.click(); await gc.waitForTimeout(1500);
      check(`${key}: a row opens its record`, new URL(gc.url()).pathname !== before, new URL(gc.url()).pathname.replace(/[0-9a-f-]{36}/g, ':id'));
    }
  }

  // Command Center: a tile opens.
  await open(gc, '/app/command-center');
  if (new URL(gc.url()).pathname.startsWith('/app/command-center')) {
    const cc = gc.locator('a:has(.pmBtn)').first();
    if (await cc.count()) { const href = await cc.getAttribute('href'); await cc.click(); await gc.waitForTimeout(1500); check('command center: a tool tile opens', new URL(gc.url()).pathname === href, href); }
  } else check('command center: reachable', false, `redirected to ${new URL(gc.url()).pathname} (feature not on for this company)`);

  // Deal page on the test lead: stage, activity, edit — each reopened.
  if (leadId) {
    const D = `/app/leads/${leadId}`;
    const read = async () => (await (await api.get(`${SITE}/api/leads/${leadId}`)).json().catch(() => ({})));
    const leadOf = (j) => j.lead || j.data || j;
    await open(gc, D);
    const cur = gc.locator('.k-stage[aria-current="step"]');
    const curBg = await cur.first().evaluate((el) => getComputedStyle(el).backgroundColor).catch(() => '');
    check('deal: current stage is lit yellow and not greyed', /255, 224, 0/.test(curBg), curBg);
    const next = gc.locator('.k-stage').filter({ hasText: 'Contacted' }).first();
    await next.click(); await gc.waitForTimeout(1800);
    await open(gc, D);
    const stageNow = leadOf(await read()).stage;
    const pillNow = await gc.locator('.k-title-row .k-badge').first().textContent().catch(() => '');
    check('deal: stage move saves and reopens (Contacted)', stageNow === 'Contacted' && /Contacted/.test(pillNow || ''), `${stageNow} / ${pillNow}`);
    const note = `ZZ AUDIT acceptance note ${STAMP}`;
    await gc.getByLabel('Activity description').fill(note);
    await gc.locator('form.k-toolbar button[type=submit]').click(); await gc.waitForTimeout(1800);
    await shot(gc, 'deal-after-activity-1440');
    const ovNow = await measure(gc, false);
    check('deal: status box does not overlap another overlay after a save', ovNow.overlaps.length === 0, ovNow.overlaps.join('; ') || `${ovNow.fixed.length} fixed`);
    await open(gc, D);
    check('deal: activity saves and reopens in the timeline', (await gc.locator('.k-tl').textContent().catch(() => '') || '').includes(note));
    await gc.getByRole('button', { name: 'Edit Deal' }).click();
    const dlg = gc.locator('[role=dialog]').last(); await dlg.waitFor({ timeout: 8000 });
    await shot(gc, 'deal-edit-dialog-1440');
    const step = `ZZ AUDIT next step ${STAMP}`;
    await dlg.getByLabel('Next Action').fill(step);
    await dlg.getByLabel('Estimated Value ($)').fill('12345');
    await dlg.locator('button[type=submit]').last().click(); await gc.waitForTimeout(1800);
    await open(gc, D);
    const L = leadOf(await read());
    const callout = await gc.locator('.k-callout-title').first().textContent().catch(() => '');
    check('deal: Edit Deal saves and every edited field reopens', L.next_action === step && Number(L.estimated_value) === 12345 && (callout || '').includes(step), `${L.next_action === step} ${L.estimated_value} ${(callout || '').slice(0, 40)}`);
    await shot(gc, 'deal-reopened-1440', true);
    // Phone: the same record after the edits, plus a save to see the status box on a phone.
    await open(ph, D);
    await shot(ph, 'deal-reopened-390', true);
    await ph.getByLabel('Activity description').fill(`${note} phone`);
    await ph.locator('form.k-toolbar button[type=submit]').click(); await ph.waitForTimeout(1500);
    const ovPh = await measure(ph, true);
    await shot(ph, 'deal-status-box-390');
    check('deal 390: status box does not overlap another overlay', ovPh.overlaps.length === 0, ovPh.overlaps.join('; ') || JSON.stringify(ovPh.fixed.map((f) => `${f.cls}@${f.y}+${f.h}`)));
    // Delete: cancel once, then confirm (removes the test lead).
    await open(gc, D);
    await gc.getByRole('button', { name: 'Delete Deal' }).click();
    const ad = gc.locator('[role=alertdialog]'); await ad.waitFor({ timeout: 8000 }).catch(() => {});
    await shot(gc, 'dialog-delete-1440');
    if (await ad.count()) {
      await ad.getByRole('button', { name: 'Cancel' }).click(); await gc.waitForTimeout(600);
      check('deal: delete Cancel keeps the record', (await gc.locator('[role=alertdialog]').count()) === 0 && (await api.get(`${SITE}/api/leads/${leadId}`)).ok());
      await gc.getByRole('button', { name: 'Delete Deal' }).click();
      await ad.waitFor({ timeout: 8000 });
      await ad.locator('button').last().click(); await gc.waitForTimeout(2500);
    }
    const gone = (await api.get(`${SITE}/api/leads/${leadId}`)).status();
    check('deal: confirmed delete removes the test lead', gone === 404 || gone === 410, gone);
  }
} catch (e) {
  R.error = String(e.message || e).split('\n')[0].slice(0, 300);
  console.log('fatal', R.error);
}
await desktop.close();
await phoneBrowser.close();
R.finishedAt = new Date().toISOString();
fs.writeFileSync(path.join(OUT, 'errors.json'), JSON.stringify(R, null, 1));
console.log(JSON.stringify({ error: R.error, checks: R.checks.length, failed: R.checks.filter((c) => !c.ok).length }));
