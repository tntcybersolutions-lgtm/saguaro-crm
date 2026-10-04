#!/usr/bin/env node
/**
 * ONE APP — the iOS app must be the live web app, never a second codebase.
 *
 * The iPhone once ran a separate React Native app (D:/Saguaro-Field) that
 * drifted away from the website: different screens, different nav, none of
 * the redesign. The fix is structural: the iOS app is this repo's Capacitor
 * shell in server mode, loading https://www.saguarocontrol.net/app — the same
 * code, deploy, database and auth as desktop. Every web deploy is the iOS
 * update. This check fails CI if that wiring is changed.
 *
 *   node tools/check-ios-mirror.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const BUNDLE_ID = 'net.saguarocontrol.field';
const LIVE_URL = 'https://www.saguarocontrol.net/app';

const problems = [];
const expect = (ok, msg) => { if (!ok) problems.push(msg); };

// capacitor.config.ts — server mode on the live site, the one bundle id.
const cap = read('capacitor.config.ts');
const prodUrl = cap.match(/const PRODUCTION_URL\s*=\s*'([^']+)'/)?.[1];
expect(prodUrl === LIVE_URL, `capacitor.config.ts PRODUCTION_URL is ${prodUrl ?? 'missing'}; must be ${LIVE_URL}`);
expect(/const serverUrl\s*=\s*process\.env\.CAPACITOR_SERVER_URL\s*\?\?\s*PRODUCTION_URL/.test(cap),
  'capacitor.config.ts serverUrl must fall back to PRODUCTION_URL (dev override only via CAPACITOR_SERVER_URL)');
expect(/server:\s*\{[^}]*url:\s*serverUrl/s.test(cap), 'capacitor.config.ts server.url must be serverUrl (server mode, no bundled copy of the app)');
const appId = cap.match(/appId:\s*'([^']+)'/)?.[1];
expect(appId === BUNDLE_ID, `capacitor.config.ts appId is ${appId ?? 'missing'}; must be ${BUNDLE_ID}`);
for (const host of ['www.saguarocontrol.net', 'saguarocontrol.net']) {
  expect(new RegExp(`allowNavigation:[^\\]]*'${host.replace(/\./g, '\\.')}'`).test(cap), `capacitor.config.ts allowNavigation must include ${host}`);
}
if (process.env.CI) {
  expect(!process.env.CAPACITOR_SERVER_URL, `CAPACITOR_SERVER_URL is set in CI (${process.env.CAPACITOR_SERVER_URL}); release builds must load ${LIVE_URL}`);
}

// Xcode project — every build configuration ships the same bundle id.
const pbx = read('ios/App/App.xcodeproj/project.pbxproj');
const ids = [...pbx.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)].map((m) => m[1].trim());
expect(ids.length > 0, 'ios/App/App.xcodeproj/project.pbxproj has no PRODUCT_BUNDLE_IDENTIFIER');
for (const id of ids) expect(id === BUNDLE_ID, `project.pbxproj PRODUCT_BUNDLE_IDENTIFIER ${id}; must be ${BUNDLE_ID}`);

// CI workflow — launches, exports and signs that same bundle id.
const wf = read('.github/workflows/ios.yml');
const wfIds = new Set([...wf.matchAll(/\b(?:com|net)\.[a-z0-9]+\.[a-z0-9.]+\b/gi)].map((m) => m[0]));
for (const id of wfIds) expect(id === BUNDLE_ID, `.github/workflows/ios.yml references ${id}; must only use ${BUNDLE_ID}`);

if (problems.length) {
  console.error('iOS no longer mirrors the web app:\n  - ' + problems.join('\n  - '));
  process.exit(1);
}
console.log(`ok — iOS is ${BUNDLE_ID} loading ${LIVE_URL} (one app, one source)`);
