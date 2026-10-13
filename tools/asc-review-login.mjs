#!/usr/bin/env node
/**
 * tools/asc-review-login.mjs — the sign-in Apple's reviewers use, read from
 * App Store Connect (the review details of the iOS version in review, else the
 * TestFlight review details), written to $GITHUB_ENV as REVIEW_EMAIL /
 * REVIEW_PASSWORD for the native App Review check. Both are masked in the log
 * and never printed. Read-only: nothing in App Store Connect changes.
 *
 * Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8_BASE64, GITHUB_ENV.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';

const BUNDLE_ID = 'net.saguarocontrol.field';
const keyId = process.env.ASC_KEY_ID || '';
const issuer = process.env.ASC_ISSUER_ID || '';
const p8 = Buffer.from(process.env.ASC_KEY_P8_BASE64 || '', 'base64').toString('utf8');
if (!keyId || !issuer || !p8.includes('PRIVATE KEY') || !process.env.GITHUB_ENV) {
  console.error('App Store Connect secrets or GITHUB_ENV missing.');
  process.exit(1);
}
const b64u = (v) => Buffer.from(v).toString('base64url');
function token() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }));
  const body = b64u(JSON.stringify({ iss: issuer, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' }));
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key: p8, dsaEncoding: 'ieee-p1363' });
  return `${head}.${body}.${b64u(sig)}`;
}
async function api(path) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, { headers: { Authorization: `Bearer ${token()}` } });
  if (!res.ok) throw new Error(`GET ${path.split('?')[0]} → ${res.status}`);
  return res.json();
}

const app = (await api(`/v1/apps?filter[bundleId]=${BUNDLE_ID}&limit=1`)).data?.[0];
if (!app) { console.error('app not found'); process.exit(1); }
let d = null;
let from = '';
const versions = (await api(`/v1/apps/${app.id}/appStoreVersions?limit=10`)).data.filter((v) => v.attributes.platform === 'IOS');
for (const v of versions) {
  try {
    const rd = (await api(`/v1/appStoreVersions/${v.id}/appStoreReviewDetail`)).data?.attributes;
    if (rd?.demoAccountName && rd?.demoAccountPassword) { d = rd; from = `App Store review details (${v.attributes.versionString}, ${v.attributes.appStoreState})`; break; }
  } catch { /* no review detail on this version — try the next */ }
}
if (!d) {
  const b = (await api(`/v1/apps/${app.id}/betaAppReviewDetail`)).data?.attributes;
  if (b?.demoAccountName && b?.demoAccountPassword) { d = b; from = 'TestFlight review details'; }
}
if (!d) { console.error('No demo sign-in in App Store Connect.'); process.exit(1); }
console.log(`::add-mask::${d.demoAccountPassword}`);
console.log(`::add-mask::${d.demoAccountName}`);
fs.appendFileSync(process.env.GITHUB_ENV, `REVIEW_EMAIL=${d.demoAccountName}\nREVIEW_PASSWORD=${d.demoAccountPassword}\n`);
console.log(`review sign-in: from the ${from}`);
