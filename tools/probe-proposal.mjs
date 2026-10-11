/**
 * tools/probe-proposal.mjs — drives "proposal → e-signed contract" on the live
 * site as the real company. The GC is desktop Chromium at 1440 (and an iPhone
 * for the proposal page at 390); the client is an iPhone (WebKit, 390) with no
 * login, opening the signing link the send returns.
 *
 *   Decline  New version → Send to Client (owner prefilled) → the client opens
 *            the link, declines with a reason → the GC sees Declined + reason.
 *   Sign     New version → Send to Client → the client opens it twice, types a
 *            signature, Sign and Accept → the GC sees Accepted, "Signed by", the
 *            open count; the job is Building with that contract amount.
 *
 * Writes only to one ZZ AUDIT job; mail goes to delivered@resend.dev. Rows are
 * removed afterwards from the database (ids are in proposal.json).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const SITE = (process.env.SITE || 'https://www.saguarocontrol.net').replace(/\/$/, '');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'tools/probe');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const require = createRequire(path.join(process.env.PLAYWRIGHT_DIR, 'noop.js'));
const pw = require('playwright');
if (!process.env.E2E_EMAIL || !process.env.E2E_PASSWORD) throw new Error('no real-company login');

const JOB = 'ZZ AUDIT Walk Job 10101543';
const CLIENT = 'delivered@resend.dev';
const result = { site: SITE, job: JOB, steps: [] };
const step = (k, v) => { result[k] = v; result.steps.push(k); console.log(k, JSON.stringify(v)); };
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name), fullPage: true }).catch(() => {});

async function login(page) {
  await page.goto(`${SITE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="email"]', process.env.E2E_EMAIL.trim());
  await page.fill('input[name="password"]', process.env.E2E_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 90000 });
  const d = await (await page.request.get(`${SITE}/api/projects?limit=200&fields=id,name`)).json();
  return d.projects || [];
}
const noSideScroll = (page) => page.evaluate(() => ({ scrollW: document.scrollingElement.scrollWidth, vw: innerWidth, ok: document.scrollingElement.scrollWidth <= innerWidth + 1 }));

/** New Version on the proposal page; returns the new proposal's id. */
async function newVersion(page, jobId, amount, notes) {
  await page.goto(`${SITE}/app/projects/${jobId}/proposal`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /New Version/ }).first().click();
  const amt = page.locator('input[type="number"]').first();
  await amt.fill(String(amount));
  await page.locator('input[placeholder^="e.g. Revised"]').fill(notes);
  const created = page.waitForResponse((r) => r.url().includes('/api/proposals/create') && r.request().method() === 'POST', { timeout: 30000 });
  await page.getByRole('button', { name: 'Create Version' }).click();
  const j = await (await created).json();
  await page.waitForSelector(`tr:has-text("${notes}")`, { timeout: 20000 });
  return j.proposal?.id;
}

/** Send to Client on the row with `notes`; returns { token, prefill }. */
async function sendToClient(page, notes) {
  await page.locator(`tr:has-text("${notes}") button`, { hasText: 'Send to Client' }).click();
  const name = page.locator('input[placeholder="John Smith"]');
  await name.waitFor({ timeout: 15000 });
  const prefill = { name: await name.inputValue(), email: await page.locator('input[placeholder="john@example.com"]').inputValue() };
  // The client is always the test inbox, whatever was prefilled.
  await page.locator('input[placeholder="john@example.com"]').fill(CLIENT);
  if (!prefill.name) await name.fill('ZZ AUDIT Client');
  await page.getByRole('button', { name: 'Next: Add Message' }).click();
  await page.getByRole('button', { name: 'Next: Review & Send' }).click();
  const sent = page.waitForResponse((r) => r.url().includes('/api/documents/sign/send') && r.request().method() === 'POST', { timeout: 60000 });
  await page.getByRole('button', { name: 'Send for Signature' }).click();
  const res = await sent;
  const j = await res.json();
  await page.waitForSelector('text=/Sent to 1 signer/', { timeout: 20000 }).catch(() => {});
  return { status: res.status(), token: j.signatures?.[0]?.token || null, prefill };
}

const rowText = (page, notes) => page.locator(`tr:has-text("${notes}")`).first().innerText().then((t) => t.replace(/\s+/g, ' ').trim()).catch(() => '');

async function openStatus(page, notes) {
  await page.locator(`tr:has-text("${notes}") button`, { hasText: 'E-Sign Status' }).click();
  await page.waitForSelector('text=/Sent to 1 signer/', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(800);
  return page.evaluate(() => {
    const h = [...document.querySelectorAll('p')].find((p) => /Sent to 1 signer/.test(p.textContent || ''));
    let box = h; for (let i = 0; i < 3 && box?.parentElement; i++) box = box.parentElement;
    return (box?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 400);
  });
}

const gcBrowser = await pw.chromium.launch();
const gc = await (await gcBrowser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark' })).newPage();
const phoneBrowser = await pw.webkit.launch();
const client = await (await phoneBrowser.newContext({ ...pw.devices['iPhone 15'], colorScheme: 'dark' })).newPage();
const ids = { proposals: [] };
try {
  const jobs = await login(gc);
  const job = jobs.find((j) => j.name === JOB);
  if (!job) throw new Error(`${JOB} not in this company`);
  ids.job = job.id;

  // ── Decline ──
  const declineNotes = `ZZ AUDIT decline ${Date.now().toString(36)}`;
  ids.proposals.push(await newVersion(gc, job.id, 4321, declineNotes));
  const d = await sendToClient(gc, declineNotes);
  step('declineSent', { status: d.status, token: !!d.token, prefill: d.prefill });
  await shot(gc, '1440-sent.png');
  await client.goto(`${SITE}/portals/sign/${d.token}`, { waitUntil: 'networkidle' });
  await client.waitForSelector('text=Proposal for Your Signature', { timeout: 30000 });
  step('signPage', await client.evaluate(() => ({ text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 500) })));
  step('signPageOverflow', await noSideScroll(client));
  await shot(client, '390-sign-page.png');
  await client.getByRole('button', { name: 'Decline', exact: true }).click();
  await client.fill('#decline-reason', 'ZZ AUDIT test - price is over our budget');
  await shot(client, '390-decline-reason.png');
  await client.getByRole('button', { name: 'Decline', exact: true }).last().click();
  await client.waitForSelector('h2:has-text("Declined")', { timeout: 20000 });
  step('clientDeclined', true);
  await shot(client, '390-declined.png');
  await gc.reload({ waitUntil: 'networkidle' });
  step('gcDeclineRow', await rowText(gc, declineNotes));
  step('gcDeclineStatus', await openStatus(gc, declineNotes));
  await shot(gc, '1440-declined.png');

  // ── Sign ──
  const signNotes = `ZZ AUDIT sign ${Date.now().toString(36)}`;
  ids.proposals.push(await newVersion(gc, job.id, 12345, signNotes));
  const s = await sendToClient(gc, signNotes);
  step('signSent', { status: s.status, token: !!s.token });
  await client.goto(`${SITE}/portals/sign/${s.token}`, { waitUntil: 'networkidle' });
  await client.waitForSelector('text=Proposal for Your Signature', { timeout: 30000 });
  await client.reload({ waitUntil: 'networkidle' }); // opened twice
  await client.waitForSelector('text=Proposal for Your Signature', { timeout: 30000 });
  await client.getByRole('button', { name: 'Type', exact: true }).click();
  await client.fill('input[placeholder="Type your full name"]', 'ZZ AUDIT Client');
  await client.locator('input[type="checkbox"]').check();
  await shot(client, '390-ready-to-sign.png');
  await client.getByRole('button', { name: 'Sign and Accept' }).click();
  await client.waitForSelector('h2:has-text("Proposal Signed")', { timeout: 30000 });
  step('clientSigned', await client.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 300)));
  await shot(client, '390-signed.png');

  await gc.reload({ waitUntil: 'networkidle' });
  step('gcSignRow', await rowText(gc, signNotes));
  // A signed panel must not re-fetch the versions in a loop (it once did, forever).
  let refetches = 0;
  const countRefetch = (r) => { if (r.url().includes(`/api/projects/${job.id}/proposals`)) refetches++; };
  gc.on('request', countRefetch);
  step('gcSignStatus', await openStatus(gc, signNotes));
  await gc.waitForTimeout(6000);
  gc.off('request', countRefetch);
  step('signedPanel', {
    proposalRefetchesIn6s: refetches,
    tableShowsRows: await gc.locator(`tr:has-text("${signNotes}")`).isVisible(),
    badge: await gc.evaluate(() => [...document.querySelectorAll('h3')].find((h) => /E-Signature/.test(h.textContent || ''))?.parentElement?.innerText.replace(/\s+/g, ' ').slice(-40) || null),
    title: await gc.evaluate(() => [...document.querySelectorAll('h2,h3,div')].map((e) => e.textContent || '').find((t) => /— Signed$|Send v\d/.test(t.trim())) || null),
  });
  await shot(gc, '1440-signed.png');
  const ctx = await (await gc.request.get(`${SITE}/api/project-context?projectId=${job.id}`)).json().catch(() => ({}));
  step('jobAfter', { phase: ctx?.project?.phase ?? null, originalContract: ctx?.money?.originalContract ?? null, budgetOriginal: ctx?.budget?.original ?? null });
  const notes = await (await gc.request.get(`${SITE}/api/notifications?limit=10`)).json().catch(() => ({}));
  const list = notes.notifications || notes.data || [];
  step('notifications', list.filter((n) => /ZZ AUDIT/.test(`${n.title} ${n.body}`)).slice(0, 5).map((n) => `${n.type}: ${n.title}`));

  // The GC's proposal page on an iPhone.
  const gcPhone = await (await phoneBrowser.newContext({ ...pw.devices['iPhone 15'], colorScheme: 'dark' })).newPage();
  await login(gcPhone);
  await gcPhone.goto(`${SITE}/app/projects/${job.id}/proposal`, { waitUntil: 'networkidle' });
  await gcPhone.waitForSelector(`tr:has-text("${signNotes}")`, { timeout: 20000 });
  step('gcPhoneOverflow', await noSideScroll(gcPhone));
  await shot(gcPhone, '390-proposal-page.png');
  await gcPhone.locator(`tr:has-text("${signNotes}") button`, { hasText: 'E-Sign Status' }).click();
  await gcPhone.waitForSelector('text=/Sent to 1 signer/', { timeout: 20000 }).catch(() => {});
  await gcPhone.locator('text=/Sent to 1 signer/').scrollIntoViewIfNeeded().catch(() => {});
  step('gcPhoneStatusOverflow', await noSideScroll(gcPhone));
  await gcPhone.screenshot({ path: path.join(OUT, '390-esign-status.png') });
} catch (e) {
  result.error = String(e.message || e).split('\n')[0];
  await shot(gc, '1440-error.png');
  await shot(client, '390-error.png');
}
result.ids = ids;
await gcBrowser.close();
await phoneBrowser.close();
fs.writeFileSync(path.join(OUT, 'proposal.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
