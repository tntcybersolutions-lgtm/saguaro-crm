#!/usr/bin/env node
/**
 * App Store Connect — TestFlight state and distribution for Saguaro Field
 * (net.saguarocontrol.field). No dependencies; signs its own ES256 JWT.
 *
 *   node tools/asc.mjs status       read-only: builds, beta states, groups, review
 *   node tools/asc.mjs distribute   newest valid build → export compliance,
 *                                   "What to Test", every beta group, and a
 *                                   Beta App Review submission for external testers
 *   node tools/asc.mjs appstore     App Store listing readiness for the newest valid
 *                                   build: puts it on the editable version (2.0),
 *                                   copies review contact + demo sign-in from the
 *                                   TestFlight review details, reports every gap
 *   node tools/asc.mjs appstore-submit   the same, then submits for App Review
 *
 * Env (repo secrets): ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8_BASE64; optional
 * APP_REVIEW_DEMO_EMAIL / APP_REVIEW_DEMO_PASS (the App Review demo login).
 * Never prints a secret, a tester's name or a tester's email.
 */
import crypto from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { DESCRIPTION, KEYWORDS, PROMO, REVIEW_NOTES, SUBTITLE } from './asc-listing.mjs';

const BUNDLE_ID = 'net.saguarocontrol.field';
const WHATS_NEW =
  'Saguaro Field 2.0 — the app now runs the full Saguaro platform, the same screens and data as desktop. ' +
  'Sign in with your Saguaro account. Daily logs, photos, time clock, punch list, change orders, takeoffs and more.';

const MODE = process.argv[2] || 'status';
if (!['status', 'distribute', 'appstore', 'appstore-submit', 'appstore-meta', 'diagnose', 'demo-reset', 'privacy', 'internal-testers'].includes(MODE)) {
  console.error(`Unknown mode "${MODE}" — use status, distribute, appstore or appstore-submit`);
  process.exit(2);
}

const keyId = process.env.ASC_KEY_ID || '';
const issuer = process.env.ASC_ISSUER_ID || '';
const p8 = Buffer.from(process.env.ASC_KEY_P8_BASE64 || '', 'base64').toString('utf8');
if (!keyId || !issuer || !p8.includes('PRIVATE KEY')) {
  console.error('App Store Connect secrets are missing (ASC_KEY_ID / ASC_ISSUER_ID / ASC_KEY_P8_BASE64).');
  process.exit(1);
}

const b64u = (v) => Buffer.from(v).toString('base64url');
function token() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }));
  const body = b64u(JSON.stringify({ iss: issuer, iat: now, exp: now + 1100, aud: 'appstoreconnect-v1' }));
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key: p8, dsaEncoding: 'ieee-p1363' });
  return `${head}.${body}.${b64u(sig)}`;
}

async function api(method, path, body) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text.slice(0, 300) }; }
  if (!res.ok) {
    // A 409 on review submission lists what blocks it under meta.associatedErrors.
    const assoc = (e) => Object.entries(e.meta?.associatedErrors || {})
      .flatMap(([where, list]) => list.map((a) => `\n      - ${a.code || ''} ${a.detail || a.title || ''} [${where}]`)).join('');
    const why = (json.errors || []).map((e) => `${e.code || ''} ${e.detail || e.title || ''}`.trim() + assoc(e)).join(' | ') || JSON.stringify(json).slice(0, 300);
    const err = new Error(`${method} ${path.split('?')[0]} → ${res.status}: ${why}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

// The App Review demo login: the demo-company account tools/e2e-*.mjs use,
// held in repo secrets APP_REVIEW_DEMO_EMAIL / APP_REVIEW_DEMO_PASS. When set,
// non-status modes write it to the TestFlight and App Store review details.
// Values are never printed; emails show as "abc…@domain".
const DEMO = process.env.APP_REVIEW_DEMO_EMAIL && process.env.APP_REVIEW_DEMO_PASS
  ? { name: process.env.APP_REVIEW_DEMO_EMAIL.trim(), password: process.env.APP_REVIEW_DEMO_PASS }
  : null;
// The demo-company account Apple's reviewers sign in with (never a real company).
const REVIEW_ACCOUNT = 'demo@saguarocontrol.net';
const maskEmail = (e) => (e ? `${e.slice(0, 3)}…@${e.split('@')[1] || '?'}` : 'none');
// Signs in the way the app's login screen does; returns the HTTP status (200 = works).
async function siteSignIn(email, password) {
  const res = await fetch('https://www.saguarocontrol.net/api/auth/session', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, remember: false }),
  });
  return res.status;
}

async function tryStep(label, fn) {
  try {
    const out = await fn();
    console.log(`  ✓ ${label}${out ? ` — ${out}` : ''}`);
    return true;
  } catch (e) {
    console.log(`  ✗ ${label} — ${e.message}`);
    return false;
  }
}

async function snapshot() {
  const app = (await api('GET', `/v1/apps?filter[bundleId]=${BUNDLE_ID}&limit=1`)).data?.[0];
  if (!app) throw new Error(`No App Store Connect app with bundle id ${BUNDLE_ID}`);

  const res = await api('GET', `/v1/builds?filter[app]=${app.id}&sort=-uploadedDate&limit=10&include=preReleaseVersion,buildBetaDetail`);
  const inc = Object.fromEntries((res.included || []).map((x) => [`${x.type}:${x.id}`, x]));
  const builds = res.data.map((b) => {
    const pre = inc[`preReleaseVersions:${b.relationships?.preReleaseVersion?.data?.id}`];
    const bbd = inc[`buildBetaDetails:${b.relationships?.buildBetaDetail?.data?.id}`];
    return {
      id: b.id,
      version: pre?.attributes?.version ?? '?',
      build: b.attributes.version,
      processing: b.attributes.processingState,
      expired: b.attributes.expired,
      expires: (b.attributes.expirationDate || '').slice(0, 10),
      uploaded: (b.attributes.uploadedDate || '').slice(0, 16).replace('T', ' '),
      encryption: b.attributes.usesNonExemptEncryption,
      internal: bbd?.attributes?.internalBuildState ?? '?',
      external: bbd?.attributes?.externalBuildState ?? '?',
    };
  });

  const groups = [];
  for (const g of (await api('GET', `/v1/apps/${app.id}/betaGroups?limit=50`)).data) {
    const testers = (await api('GET', `/v1/betaGroups/${g.id}/relationships/betaTesters?limit=200`)).data.length;
    const buildIds = new Set((await api('GET', `/v1/betaGroups/${g.id}/relationships/builds?limit=200`)).data.map((x) => x.id));
    groups.push({
      id: g.id,
      name: g.attributes.name,
      internal: g.attributes.isInternalGroup,
      allBuilds: g.attributes.hasAccessToAllBuilds,
      publicLink: g.attributes.publicLinkEnabled,
      testers,
      buildIds,
    });
  }
  return { app, builds, groups };
}

function report({ app, builds, groups }, target) {
  console.log(`\nApp: ${app.attributes.name} (${BUNDLE_ID}, id ${app.id})`);
  console.log('\nBuilds (newest first):');
  console.log('  version  build  processing  expired  expires     uploaded (UTC)    encryption  internal state            external state');
  for (const b of builds) {
    console.log(`  ${String(b.version).padEnd(8)} ${String(b.build).padEnd(6)} ${String(b.processing).padEnd(11)} ${String(b.expired).padEnd(8)} ${b.expires.padEnd(11)} ${b.uploaded.padEnd(17)} ${String(b.encryption).padEnd(11)} ${String(b.internal).padEnd(25)} ${b.external}`);
  }
  console.log('\nBeta groups:');
  for (const g of groups) {
    const has = target ? (g.buildIds.has(target.id) || (g.internal && g.allBuilds) ? 'YES' : 'no') : '-';
    console.log(`  ${g.internal ? 'internal' : 'EXTERNAL'}  "${String(g.name).includes('@') ? maskEmail(g.name) : g.name}"  testers=${g.testers}  allBuilds=${g.allBuilds}  publicLink=${g.publicLink}  has ${target ? target.build : 'target'}: ${has}`);
  }
}

if (MODE === 'diagnose') {
  // Why is a build INVALID? Dump every place App Store Connect records it.
  const app = (await api('GET', `/v1/apps?filter[bundleId]=${BUNDLE_ID}&limit=1`)).data[0];
  const builds = (await api('GET', `/v1/builds?filter[app]=${app.id}&sort=-uploadedDate&limit=2`)).data;
  const b = builds.find((x) => String(x.attributes.version) === String(process.env.TARGET_BUILD || builds[0].attributes.version)) || builds[0];
  const dump = (label, v) => console.log(`\n── ${label}\n${JSON.stringify(v, null, 1).slice(0, 6000)}`);
  dump(`build ${b.attributes.version} attributes`, b.attributes);
  for (const path of [
    `/v1/apps/${app.id}/buildUploads?limit=5`,
    `/v1/buildUploads?filter[app]=${app.id}&limit=5`,
    `/v1/builds/${b.id}/buildBetaDetail`,
    `/v1/builds/${b.id}/betaBuildLocalizations`,
    `/v1/builds/${b.id}/appEncryptionDeclaration`,
    `/v1/builds/${b.id}/buildBundles`,
    `/v1/builds/${b.id}/perfPowerMetrics`,
    `/v1/betaAppReviewSubmissions?filter[build]=${b.id}`,
    `/v1/apps/${app.id}/betaAppReviewDetail`,
  ]) {
    try {
      const r = await api('GET', path);
      const strip = (o) => JSON.parse(JSON.stringify(o, (k, v) => (/password|demoAccount|contact(Email|Phone)/i.test(k) ? '[hidden]' : v)));
      dump(path.split('?')[0], strip(r.data ?? r));
    } catch (e) { console.log(`\n── ${path.split('?')[0]}\n  ${e.message}`); }
  }
  process.exit(0);
}

const snap = await snapshot();
// Never fall back to an older build: the newest upload (or TARGET_BUILD) or nothing.
// tools/asc-target.txt pins the build to act on, so a submit pushed before
// the new upload shows up can never send an older build instead.
const pinned = existsSync('tools/asc-target.txt') ? readFileSync('tools/asc-target.txt', 'utf8').trim() : '';
const wanted = process.env.TARGET_BUILD || pinned || snap.builds[0]?.build;
const pick = snap.builds.find((b) => String(b.build) === String(wanted));
const target = pick && pick.processing === 'VALID' && !pick.expired ? pick : null;
if (pick && !target) console.log(`\nBuild ${pick.version} (${pick.build}) is ${pick.processing}${pick.expired ? ', expired' : ''} — internal ${pick.internal}, external ${pick.external}.`);
report(snap, target);
if (!target) {
  console.log(`\nBuild ${wanted} is not VALID yet — nothing changed. Apple emails the account holder the reason when a build is INVALID.`);
  await tryStep(`build ${wanted} details`, async () => {
    const b = (await api('GET', `/v1/builds/${pick?.id}?fields[builds]=version,processingState,expired,minOsVersion,iconAssetToken,usesNonExemptEncryption,buildAudienceType`)).data.attributes;
    return JSON.stringify({ processing: b.processingState, minOs: b.minOsVersion, audience: b.buildAudienceType, icon: !!b.iconAssetToken, encryption: b.usesNonExemptEncryption });
  });
  await tryStep(`Beta App Review submission for ${wanted}`, async () => {
    const r = (await api('GET', `/v1/betaAppReviewSubmissions?filter[build]=${pick?.id}`)).data?.[0];
    return r ? r.attributes.betaReviewState : 'none';
  });
  process.exit(MODE === 'distribute' ? 1 : 0);
}
console.log(`\nTarget build: ${target.version} (${target.build}), uploaded ${target.uploaded} UTC`);

for (const path of [`/v1/betaAppReviewSubmissions?filter[build]=${target.id}`]) {
  await tryStep('Beta App Review submission state', async () => {
    const s = (await api('GET', path)).data?.[0];
    return s ? `${s.attributes.betaReviewState} (submitted ${String(s.attributes.submittedDate || '').slice(0, 16)})` : 'none yet';
  });
}
await tryStep('Beta App Review details (contact + sign-in for Apple)', async () => {
  const d = (await api('GET', `/v1/apps/${snap.app.id}/betaAppReviewDetail`)).data?.attributes || {};
  const set = (v) => (v ? 'set' : 'MISSING');
  const works = d.demoAccountName && d.demoAccountPassword ? await siteSignIn(d.demoAccountName, d.demoAccountPassword) : null;
  return `contact name ${set(d.contactFirstName && d.contactLastName)}, email ${set(d.contactEmail)}, phone ${set(d.contactPhone)}, demo account required=${d.demoAccountRequired}, demo login ${maskEmail(d.demoAccountName)} → ${works === 200 ? 'signs in' : `DOES NOT SIGN IN (${works ?? 'missing'})`}`;
});

// demo-reset: give the demo-company account a fresh random password and save it
// straight to Apple's TestFlight review details (the appstore pass copies it to
// the App Store review details). The password is never printed; only its
// bcrypt hash is, which is then set on the account (auth.users) in Supabase.
if (MODE === 'demo-reset') {
  const { createRequire } = await import('node:module');
  const bcrypt = createRequire(`${process.env.BCRYPT_DIR}/noop.js`)('bcryptjs');
  const password = crypto.randomBytes(18).toString('base64url');
  const hash = bcrypt.hashSync(password, 10);
  await api('PATCH', `/v1/betaAppReviewDetails/${snap.app.id}`, { data: { type: 'betaAppReviewDetails', id: snap.app.id,
    attributes: { demoAccountName: REVIEW_ACCOUNT, demoAccountPassword: password, demoAccountRequired: true } } });
  console.log(`  ✓ TestFlight review details now use ${maskEmail(REVIEW_ACCOUNT)} with a new password`);
  console.log(`DEMO_BCRYPT ${hash}`);
  process.exit(0);
}

// privacy: publish the App Privacy answers (what PrivacyInfo.xcprivacy declares):
// name, email, precise location, photos/videos and other user content, each
// for app functionality, linked to the user, never used for tracking. Apple may
// not expose these endpoints to API keys; the probe says so and changes nothing.
if (MODE === 'privacy') {
  const id = snap.app.id;
  const probe = await api('GET', `/v1/apps/${id}/dataUsages?limit=50`).catch((e) => e);
  if (probe instanceof Error) {
    console.log(`  ✗ App Privacy through the API — ${probe.message}`);
    console.log('    Apple only allows this in App Store Connect (signed in as the account holder).');
    process.exit(0);
  }
  console.log(`  ✓ App Privacy endpoints reachable (${probe.data?.length ?? 0} answers today)`);
  for (const category of ['NAME', 'EMAIL_ADDRESS', 'PRECISE_LOCATION', 'PHOTOS_OR_VIDEOS', 'OTHER_USER_CONTENT']) {
    await tryStep(`collect ${category} — app functionality, linked to the user, no tracking`, () =>
      api('POST', '/v1/appDataUsages', { data: { type: 'appDataUsages', relationships: {
        app: { data: { type: 'apps', id } },
        category: { data: { type: 'appDataUsageCategories', id: category } },
        purpose: { data: { type: 'appDataUsagePurposes', id: 'APP_FUNCTIONALITY' } },
        dataProtection: { data: { type: 'appDataUsageDataProtections', id: 'DATA_LINKED_TO_YOU' } } } } }).then(() => 'saved'));
  }
  await tryStep('publish App Privacy', async () => {
    const state = (await api('GET', `/v1/apps/${id}/dataUsagePublishState`)).data;
    await api('PATCH', `/v1/appDataUsagesPublishState/${state.id}`, { data: { type: 'appDataUsagesPublishState', id: state.id, attributes: { published: true } } });
    return 'published';
  });
  process.exit(0);
}

// internal-testers: external testers wait on Beta App Review; internal testers
// get every build at once, but must be App Store Connect users. For the named
// external testers this invites each one as a user (Marketing role, Saguaro
// Field only), and adds anyone who is already a user to the internal group.
// Run it again after they accept Apple's invitation email. Emails are masked.
const INTERNAL_NAMES = ['rob', 'mark', 'avery'];
// The API key may not grant Admin (403 ROLES_NOT_ALLOWED) or withdraw invitations;
// owners are upgraded to Admin by the account holder in Users and Access.
const OWNER_DOMAINS = [];
if (MODE === 'internal-testers') {
  const app = snap.app;
  const internal = snap.groups.find((g) => g.internal);
  const external = snap.groups.filter((g) => !g.internal);
  const people = new Map();
  for (const g of external) {
    for (const t of (await api('GET', `/v1/betaGroups/${g.id}/betaTesters?limit=200`)).data) {
      const first = String(t.attributes.firstName || '').trim().toLowerCase();
      const email = String(t.attributes.email || '').trim().toLowerCase();
      if (email && INTERNAL_NAMES.some((n) => first.startsWith(n))) people.set(email, t);
    }
  }
  console.log(`\nTesters matching ${INTERNAL_NAMES.join(', ')}: ${people.size}`);
  for (const [email, t] of people) {
    const who = `${t.attributes.firstName || '?'} ${maskEmail(email)}`;
    const users = (await api('GET', `/v1/users?filter[username]=${encodeURIComponent(email)}&limit=5`)).data;
    if (users.length) {
      await tryStep(`${who}: App Store Connect user — add to internal group "${internal.name}"`, () =>
        api('POST', `/v1/betaGroups/${internal.id}/relationships/betaTesters`, { data: [{ type: 'betaTesters', id: t.id }] }).then(() => 'added; TestFlight email sent'));
      continue;
    }
    // Company owners (Chad's call) get Admin, like the account holder; everyone else Marketing on this app only.
    const owner = OWNER_DOMAINS.some((d) => email.endsWith(`@${d}`));
    const role = owner ? 'ADMIN' : 'MARKETING';
    const pending = (await api('GET', `/v1/userInvitations?filter[email]=${encodeURIComponent(email)}&limit=5`)).data;
    const same = pending.find((p) => (p.attributes.roles || []).includes(role));
    if (same) { console.log(`  · ${who}: ${role} invitation already sent, waiting for them to accept`); continue; }
    for (const p of pending) {
      await tryStep(`${who}: withdraw ${(p.attributes.roles || []).join('/')} invitation`, () => api('DELETE', `/v1/userInvitations/${p.id}`).then(() => 'withdrawn'));
    }
    await tryStep(`${who}: invite to App Store Connect (${role}${owner ? ', all apps' : ', Saguaro Field only'})`, () =>
      api('POST', '/v1/userInvitations', { data: { type: 'userInvitations',
        attributes: { email, firstName: t.attributes.firstName || 'Tester', lastName: t.attributes.lastName || 'Saguaro',
          roles: [role], allAppsVisible: owner, provisioningAllowed: owner },
        ...(owner ? {} : { relationships: { visibleApps: { data: [{ type: 'apps', id: app.id }] } } }) } }).then(() => 'invitation emailed by Apple'));
  }
  process.exit(0);
}

// Put the working demo login in front of Apple's reviewers (TestFlight + App Store).
if (MODE !== 'status' && DEMO) {
  await tryStep(`demo login for App Review → ${maskEmail(DEMO.name)}`, async () => {
    const status = await siteSignIn(DEMO.name, DEMO.password);
    if (status !== 200) throw new Error(`the APP_REVIEW_DEMO_* secrets do not sign in (${status}); App Store Connect left unchanged`);
    await api('PATCH', `/v1/betaAppReviewDetails/${snap.app.id}`, { data: { type: 'betaAppReviewDetails', id: snap.app.id,
      attributes: { demoAccountName: DEMO.name, demoAccountPassword: DEMO.password, demoAccountRequired: true } } });
    return 'signs in; saved to the TestFlight review details';
  });
}

await tryStep('App Store versions', async () => {
  const v = (await api('GET', `/v1/apps/${snap.app.id}/appStoreVersions?limit=10`)).data;
  return v.length ? v.map((x) => `${x.attributes.platform} ${x.attributes.versionString}: ${x.attributes.appStoreState}`).join('; ') : 'none — the app has never been submitted to the App Store';
});

if (MODE === 'status') process.exit(0);

// appstore-meta: correct the listing text and the App Review notes on the
// version already in review, in place (no withdrawal). Apple refuses edits to
// some fields while a version waits for review; each refusal is reported.
if (MODE === 'appstore-meta') {
  const ver = (await api('GET', `/v1/apps/${snap.app.id}/appStoreVersions?limit=20`)).data
    .find((v) => v.attributes.platform === 'IOS' && !['READY_FOR_SALE', 'REPLACED_WITH_NEW_VERSION', 'REMOVED_FROM_SALE'].includes(v.attributes.appStoreState));
  if (!ver) { console.log('  no open iOS version'); process.exit(0); }
  console.log(`\nVersion ${ver.attributes.versionString} (${ver.attributes.appStoreState}) — correcting text in place`);
  for (const loc of (await api('GET', `/v1/appStoreVersions/${ver.id}/appStoreVersionLocalizations?limit=50`)).data.filter((l) => l.attributes.locale?.startsWith('en'))) {
    for (const [field, value] of [['promotionalText', PROMO], ['description', DESCRIPTION], ['keywords', KEYWORDS]]) {
      if (loc.attributes[field] === value) { console.log(`  ✓ ${loc.attributes.locale} ${field} — already current`); continue; }
      await tryStep(`${loc.attributes.locale} ${field}`, () => api('PATCH', `/v1/appStoreVersionLocalizations/${loc.id}`, { data: { type: 'appStoreVersionLocalizations', id: loc.id, attributes: { [field]: value } } }).then(() => 'saved'));
    }
  }
  await tryStep('App Review notes', async () => {
    const rd = (await api('GET', `/v1/appStoreVersions/${ver.id}/appStoreReviewDetail`)).data;
    if (rd.attributes.notes === REVIEW_NOTES) return 'already current';
    await api('PATCH', `/v1/appStoreReviewDetails/${rd.id}`, { data: { type: 'appStoreReviewDetails', id: rd.id, attributes: { notes: REVIEW_NOTES } } });
    return 'saved';
  });
  await tryStep('TestFlight review notes', () =>
    api('PATCH', `/v1/betaAppReviewDetails/${snap.app.id}`, { data: { type: 'betaAppReviewDetails', id: snap.app.id, attributes: { notes: REVIEW_NOTES } } }).then(() => 'saved'));
  process.exit(0);
}
if (MODE === 'appstore' || MODE === 'appstore-submit') {
  await appStore(snap.app, target, MODE === 'appstore-submit');
  process.exit(0);
}

console.log(`\nDistributing ${target.version} (${target.build}):`);

await tryStep('TestFlight review notes (full platform, what to try)', () =>
  api('PATCH', `/v1/betaAppReviewDetails/${snap.app.id}`, { data: { type: 'betaAppReviewDetails', id: snap.app.id, attributes: { notes: REVIEW_NOTES } } }).then(() => 'saved'));

if (target.encryption == null) {
  await tryStep('export compliance: uses non-exempt encryption = false', () =>
    api('PATCH', `/v1/builds/${target.id}`, { data: { type: 'builds', id: target.id, attributes: { usesNonExemptEncryption: false } } }));
}

await tryStep('"What to Test" (en-US)', async () => {
  const locs = (await api('GET', `/v1/builds/${target.id}/betaBuildLocalizations?limit=50`)).data;
  const en = locs.find((l) => l.attributes.locale === 'en-US') || locs[0];
  if (en && en.attributes.whatsNew) return 'already set';
  if (en) {
    await api('PATCH', `/v1/betaBuildLocalizations/${en.id}`, { data: { type: 'betaBuildLocalizations', id: en.id, attributes: { whatsNew: WHATS_NEW } } });
    return 'updated';
  }
  await api('POST', '/v1/betaBuildLocalizations', {
    data: { type: 'betaBuildLocalizations', attributes: { locale: 'en-US', whatsNew: WHATS_NEW }, relationships: { build: { data: { type: 'builds', id: target.id } } } },
  });
  return 'created';
});

for (const g of snap.groups) {
  if (g.buildIds.has(target.id)) { console.log(`  ✓ "${g.name}" already has ${target.build}`); continue; }
  if (g.internal && g.allBuilds) { console.log(`  ✓ "${g.name}" (internal, all builds) gets ${target.build} automatically`); continue; }
  await tryStep(`add ${target.build} to "${g.name}" (${g.internal ? 'internal' : 'external'}, ${g.testers} testers)`, () =>
    api('POST', `/v1/betaGroups/${g.id}/relationships/builds`, { data: [{ type: 'builds', id: target.id }] }).then(() => 'added'));
}

if (snap.groups.some((g) => !g.internal)) {
  await tryStep('submit for Beta App Review (external testers)', async () => {
    const existing = (await api('GET', `/v1/betaAppReviewSubmissions?filter[build]=${target.id}`)).data?.[0];
    if (existing) return `already ${existing.attributes.betaReviewState}`;
    const s = await api('POST', '/v1/betaAppReviewSubmissions', { data: { type: 'betaAppReviewSubmissions', relationships: { build: { data: { type: 'builds', id: target.id } } } } });
    return s.data?.attributes?.betaReviewState || 'submitted';
  });
}

console.log('\nAfter:');
report(await snapshot(), target);

// ───────────────────────── App Store ─────────────────────────
async function appStore(app, build, submit) {
  const VERSION = build.version; // the marketing version of the build (2.0)
  const EDITABLE = ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED', 'INVALID_BINARY'];
  console.log(`\nApp Store — ${submit ? 'prepare and SUBMIT' : 'prepare (no submit)'} ${VERSION} (${build.build})`);

  let versions = (await api('GET', `/v1/apps/${app.id}/appStoreVersions?limit=20`)).data.filter((v) => v.attributes.platform === 'IOS');
  // A version already waiting for (or in) review can't take a new build. When
  // submitting a newer build, pull the waiting one out of review first —
  // Apple then marks it DEVELOPER_REJECTED, which is editable — and send the
  // new build in its place.
  const QUEUED = ['WAITING_FOR_REVIEW', 'IN_REVIEW', 'READY_FOR_REVIEW'];
  const queued = versions.find((v) => QUEUED.includes(v.attributes.appStoreState));
  if (queued && submit) {
    const inReview = (await api('GET', `/v1/appStoreVersions/${queued.id}/build`)).data;
    const inBuild = inReview?.attributes?.version;
    if (String(inBuild) === String(build.build)) {
      console.log(`  ${queued.attributes.versionString} is already ${queued.attributes.appStoreState} with build ${inBuild} — nothing to resubmit.`);
      return;
    }
    console.log(`  ${queued.attributes.versionString} is ${queued.attributes.appStoreState} with build ${inBuild}; replacing it with build ${build.build}.`);
    const pulled = await tryStep(`withdraw build ${inBuild} from App Review`, async () => {
      const subs = (await api('GET', `/v1/reviewSubmissions?filter[app]=${app.id}&filter[platform]=IOS&limit=20`)).data
        .filter((r) => ['WAITING_FOR_REVIEW', 'IN_REVIEW'].includes(r.attributes.state));
      if (!subs.length) throw new Error('no review submission in WAITING_FOR_REVIEW / IN_REVIEW');
      for (const r of subs) await api('PATCH', `/v1/reviewSubmissions/${r.id}`, { data: { type: 'reviewSubmissions', id: r.id, attributes: { canceled: true } } });
      for (let i = 0; i < 40; i++) {
        const st = (await api('GET', `/v1/appStoreVersions/${queued.id}`)).data.attributes.appStoreState;
        if (EDITABLE.includes(st)) return `version ${queued.attributes.versionString} now ${st}`;
        await new Promise((r) => setTimeout(r, 15000));
      }
      throw new Error('version did not become editable within 10 minutes');
    });
    if (!pulled) return;
    versions = (await api('GET', `/v1/apps/${app.id}/appStoreVersions?limit=20`)).data.filter((v) => v.attributes.platform === 'IOS');
  }
  let ver = versions.find((v) => EDITABLE.includes(v.attributes.appStoreState));
  if (!ver) {
    await tryStep(`create App Store version ${VERSION}`, async () => {
      ver = (await api('POST', '/v1/appStoreVersions', { data: { type: 'appStoreVersions', attributes: { platform: 'IOS', versionString: VERSION, releaseType: 'AFTER_APPROVAL' }, relationships: { app: { data: { type: 'apps', id: app.id } } } } })).data;
      return ver.id;
    });
    if (!ver) return;
  }
  const a = ver.attributes;
  console.log(`  editable version: ${a.versionString} (${a.appStoreState}), release ${a.releaseType}, copyright ${a.copyright ? 'set' : 'MISSING'}`);

  const patch = {};
  if (a.versionString !== VERSION) patch.versionString = VERSION;
  if (a.releaseType !== 'AFTER_APPROVAL') patch.releaseType = 'AFTER_APPROVAL';
  if (!a.copyright) patch.copyright = `${new Date().getUTCFullYear()} Saguaro Control Systems`;
  if (Object.keys(patch).length) {
    await tryStep(`version ${Object.entries(patch).map(([k, v]) => `${k}=${v}`).join(', ')}`, () =>
      api('PATCH', `/v1/appStoreVersions/${ver.id}`, { data: { type: 'appStoreVersions', id: ver.id, attributes: patch } }).then(() => 'saved'));
  }
  await tryStep(`attach build ${build.build}`, () =>
    api('PATCH', `/v1/appStoreVersions/${ver.id}/relationships/build`, { data: { type: 'builds', id: build.id } }).then(() => 'attached'));

  // Listing text + screenshots, per locale. The description and promotional
  // text describe the full platform (tools/asc-listing.mjs).
  for (const loc of (await api('GET', `/v1/appStoreVersions/${ver.id}/appStoreVersionLocalizations?limit=50`)).data) {
    if (loc.attributes.locale?.startsWith('en')) {
      await tryStep(`listing ${loc.attributes.locale}: description (${DESCRIPTION.length} chars) + promotional text + keywords`, () =>
        api('PATCH', `/v1/appStoreVersionLocalizations/${loc.id}`, { data: { type: 'appStoreVersionLocalizations', id: loc.id, attributes: { description: DESCRIPTION, promotionalText: PROMO, keywords: KEYWORDS } } }).then(() => 'saved'));
      Object.assign(loc.attributes, { description: DESCRIPTION, keywords: KEYWORDS });
    }
    const L = loc.attributes;
    console.log(`  listing ${L.locale}: description ${L.description ? `${L.description.length} chars` : 'MISSING'}, keywords ${L.keywords ? 'set' : 'MISSING'}, support URL ${L.supportUrl || 'MISSING'}, marketing URL ${L.marketingUrl || '-'}`);
    if (L.description) console.log(`    description starts: "${L.description.slice(0, 220).replace(/\s+/g, ' ')}…"`);
    const sets = (await api('GET', `/v1/appStoreVersionLocalizations/${loc.id}/appScreenshotSets?limit=50`)).data;
    if (!sets.length) console.log('    screenshots: NONE');
    for (const set of sets) {
      const shots = (await api('GET', `/v1/appScreenshotSets/${set.id}/appScreenshots?limit=20`)).data;
      const states = shots.map((x) => x.attributes.assetDeliveryState?.state).filter(Boolean);
      console.log(`    screenshots ${set.attributes.screenshotDisplayType}: ${shots.length} (${[...new Set(states)].join(', ') || 'no state'}) uploaded ${shots.map((x) => String(x.attributes.uploadedDate || '').slice(0, 10)).filter(Boolean).sort().slice(-1)[0] || '?'}`);
    }
  }

  // App info: name, subtitle, privacy policy, category, age rating.
  await tryStep('app info', async () => {
    const infos = await api('GET', `/v1/apps/${app.id}/appInfos?include=primaryCategory,appInfoLocalizations`);
    const info = infos.data.find((i) => EDITABLE.includes(i.attributes.appStoreState || i.attributes.state)) || infos.data[0];
    const mine = new Set((info.relationships?.appInfoLocalizations?.data || []).map((x) => x.id));
    const locs = (infos.included || []).filter((x) => x.type === 'appInfoLocalizations' && (!mine.size || mine.has(x.id)));
    for (const loc of locs.filter((x) => x.attributes.locale?.startsWith('en') && x.attributes.subtitle !== SUBTITLE)) {
      await api('PATCH', `/v1/appInfoLocalizations/${loc.id}`, { data: { type: 'appInfoLocalizations', id: loc.id, attributes: { subtitle: SUBTITLE } } })
        .then(() => { loc.attributes.subtitle = SUBTITLE; }, (e) => console.log(`  subtitle ${loc.attributes.locale}: not saved (${e.status})`));
    }
    const l = locs[0]?.attributes || {};
    const cat = info.relationships?.primaryCategory?.data?.id || 'MISSING';
    let age = '?';
    try {
      const decl = (await api('GET', `/v1/appInfos/${info.id}/ageRatingDeclaration`)).data;
      const d = decl?.attributes || {};
      // Optional overrides stay null; every content question gets the business-app answer.
      const OPTIONAL = new Set(['kidsAgeBand', 'ageRatingOverride', 'ageRatingOverrideV2', 'koreaAgeRatingOverride', 'developerAgeRatingInfoUrl', 'gracRatingClassificationNumber']);
      const missing = Object.keys(d).filter((k) => d[k] === null && !OPTIONAL.has(k));
      const filled = [];
      for (const k of missing) {
        for (const v of ['NONE', false]) {
          try {
            await api('PATCH', `/v1/ageRatingDeclarations/${decl.id}`, { data: { type: 'ageRatingDeclarations', id: decl.id, attributes: { [k]: v } } });
            filled.push(`${k}=${v}`);
            break;
          } catch { /* wrong type for this field, try the boolean */ }
        }
      }
      const left = missing.filter((k) => !filled.some((f) => f.startsWith(`${k}=`)));
      age = left.length ? `INCOMPLETE (${left.join(', ')})` : missing.length ? `completed now: ${filled.join(', ')}` : 'complete';
    } catch (e) { age = `unreadable (${e.status})`; }
    return `name "${l.name || 'MISSING'}", subtitle "${l.subtitle || '-'}", privacy policy ${l.privacyPolicyUrl || 'MISSING'}, category ${cat}, age rating ${age}`;
  });
  // Price: Free, based in the USA. A schedule with no manual prices blocks submission.
  await tryStep('price (Free)', async () => {
    const current = await api('GET', `/v1/appPriceSchedules/${app.id}/manualPrices?include=appPricePoint&limit=5`).catch(() => ({ data: [] }));
    if (current.data?.length) {
      const pt = (current.included || []).find((x) => x.type === 'appPricePoints');
      return `already set (${pt?.attributes?.customerPrice ?? '?'} ${pt ? 'USD' : ''})`.trim();
    }
    let free = null;
    for (let next = `/v1/apps/${app.id}/appPricePoints?filter[territory]=USA&limit=200`; next && !free;) {
      const page = await api('GET', next);
      free = page.data.find((x) => Number(x.attributes.customerPrice) === 0);
      next = page.links?.next?.replace('https://api.appstoreconnect.apple.com', '');
    }
    if (!free) throw new Error('no $0 price point for USA');
    await api('POST', '/v1/appPriceSchedules', {
      data: { type: 'appPriceSchedules', relationships: {
        app: { data: { type: 'apps', id: app.id } },
        baseTerritory: { data: { type: 'territories', id: 'USA' } },
        // '${free}' is a literal local id that links the included price below.
        manualPrices: { data: [{ type: 'appPrices', id: '${free}' }] } } },
      included: [{ type: 'appPrices', id: '${free}', attributes: { startDate: null },
        relationships: { appPricePoint: { data: { type: 'appPricePoints', id: free.id } } } }],
    });
    return 'set to Free';
  });

  // Review details for App Review: reuse the TestFlight review contact + demo sign-in.
  const beta = (await api('GET', `/v1/apps/${app.id}/betaAppReviewDetail`)).data?.attributes || {};
  const reviewNotes = REVIEW_NOTES;
  await tryStep('App Review contact + demo sign-in', async () => {
    let rd = null;
    try { rd = (await api('GET', `/v1/appStoreVersions/${ver.id}/appStoreReviewDetail`)).data; } catch (e) { if (e.status !== 404) throw e; }
    const want = {
      contactFirstName: beta.contactFirstName, contactLastName: beta.contactLastName,
      contactPhone: beta.contactPhone, contactEmail: beta.contactEmail,
      demoAccountName: beta.demoAccountName, demoAccountPassword: beta.demoAccountPassword,
      demoAccountRequired: true, notes: reviewNotes,
    };
    const fill = {};
    for (const [k, v] of Object.entries(want)) {
      if (v == null || v === '') continue;
      // Notes and the demo login always follow the TestFlight details (the demo
      // login there is the verified one); contact fields only fill gaps.
      if (k === 'notes' || k.startsWith('demoAccount') || !rd?.attributes?.[k]) fill[k] = v;
    }
    if (!rd) {
      await api('POST', '/v1/appStoreReviewDetails', { data: { type: 'appStoreReviewDetails', attributes: fill, relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: ver.id } } } } });
      return `created (${Object.keys(fill).filter((k) => k !== 'notes').length} fields from the TestFlight review details, values not shown)`;
    }
    await api('PATCH', `/v1/appStoreReviewDetails/${rd.id}`, { data: { type: 'appStoreReviewDetails', id: rd.id, attributes: fill } });
    return `updated (${Object.keys(fill).join(', ').replace(/demoAccountPassword/, 'demo password')})`;
  });

  if (!submit) { console.log('\nNot submitted (appstore mode). Run appstore-submit to send it to App Review.'); return; }

  console.log('\nSubmitting for App Review:');
  let sub = null;
  await tryStep('review submission', async () => {
    const open = (await api('GET', `/v1/reviewSubmissions?filter[app]=${app.id}&filter[platform]=IOS&limit=20`)).data
      .filter((r) => ['READY_FOR_REVIEW', 'UNRESOLVED_ISSUES'].includes(r.attributes.state));
    sub = open[0] || (await api('POST', '/v1/reviewSubmissions', { data: { type: 'reviewSubmissions', attributes: { platform: 'IOS' }, relationships: { app: { data: { type: 'apps', id: app.id } } } } })).data;
    return `${sub.id} (${sub.attributes.state})`;
  });
  if (!sub) return;
  const added = await tryStep(`add version ${VERSION} to the submission`, () =>
    api('POST', '/v1/reviewSubmissionItems', { data: { type: 'reviewSubmissionItems', relationships: { reviewSubmission: { data: { type: 'reviewSubmissions', id: sub.id } }, appStoreVersion: { data: { type: 'appStoreVersions', id: ver.id } } } } }).then(() => 'added'));
  if (!added) console.log('  (if it says the item already exists, the version is already in this submission)');
  await tryStep('submit to App Review', () =>
    api('PATCH', `/v1/reviewSubmissions/${sub.id}`, { data: { type: 'reviewSubmissions', id: sub.id, attributes: { submitted: true } } }).then((r) => r.data?.attributes?.state || 'submitted'));
  await tryStep('App Store version state now', async () => (await api('GET', `/v1/appStoreVersions/${ver.id}`)).data.attributes.appStoreState);
}
