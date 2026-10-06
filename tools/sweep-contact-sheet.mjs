#!/usr/bin/env node
/**
 * Renders a sweep's HTML contact sheet (docs/design/sweep/<label>/<vp>/index.html)
 * to one JPEG so a PR can carry the whole sweep as a single image per viewport.
 *
 *   node tools/sweep-contact-sheet.mjs --label=before
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const argv = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const LABEL = String(argv.label || 'after');
const root = path.join(process.cwd(), 'docs', 'design', 'sweep', LABEL);
const browser = await chromium.launch();
for (const vp of ['390', '1440']) {
  const index = path.join(root, vp, 'index.html');
  if (!fs.existsSync(index)) { console.log('missing', index); continue; }
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  await page.goto('file:///' + index.replace(/\\/g, '/'));
  await page.evaluate(() => Promise.all([...document.images].map((im) => (im.complete ? null : new Promise((r) => { im.onload = im.onerror = r; })))));
  await page.waitForTimeout(500);
  const out = path.join(root, `${vp}-contact-sheet.jpg`);
  await page.screenshot({ path: out, fullPage: true, type: 'jpeg', quality: 55 });
  console.log(out, Math.round(fs.statSync(out).size / 1024) + ' KB');
  await page.close();
}
await browser.close();
