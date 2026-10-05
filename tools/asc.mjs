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
 * Env (repo secrets): ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8_BASE64.
 * Never prints a secret, a tester's name or a tester's email.
 */
import crypto from 'node:crypto';

const BUNDLE_ID = 'net.saguarocontrol.field';
const WHATS_NEW =
  'Saguaro Field 2.0 — the app now runs the full Saguaro platform, the same screens and data as desktop. ' +
  'Sign in with your Saguaro account. Daily logs, photos, time clock, punch list, change orders, takeoffs and more.';

const MODE = process.argv[2] || 'status';
if (!['status', 'distribute', 'appstore', 'appstore-submit', 'diagnose'].includes(MODE)) {
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
    const why = (json.errors || []).map((e) => `${e.code || ''} ${e.detail || e.title || ''}`.trim()).join(' | ') || JSON.stringify(json).slice(0, 300);
    const err = new Error(`${method} ${path.split('?')[0]} → ${res.status}: ${why}`);
    err.status = res.status;
    throw err;
  }
  return json;
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
    console.log(`  ${g.internal ? 'internal' : 'EXTERNAL'}  "${g.name}"  testers=${g.testers}  allBuilds=${g.allBuilds}  publicLink=${g.publicLink}  has ${target ? target.build : 'target'}: ${has}`);
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
const wanted = process.env.TARGET_BUILD || snap.builds[0]?.build;
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
  return `contact name ${set(d.contactFirstName && d.contactLastName)}, email ${set(d.contactEmail)}, phone ${set(d.contactPhone)}, demo account required=${d.demoAccountRequired}, demo login ${set(d.demoAccountName && d.demoAccountPassword)}`;
});

await tryStep('App Store versions', async () => {
  const v = (await api('GET', `/v1/apps/${snap.app.id}/appStoreVersions?limit=10`)).data;
  return v.length ? v.map((x) => `${x.attributes.platform} ${x.attributes.versionString}: ${x.attributes.appStoreState}`).join('; ') : 'none — the app has never been submitted to the App Store';
});

if (MODE === 'status') process.exit(0);
if (MODE === 'appstore' || MODE === 'appstore-submit') {
  await appStore(snap.app, target, MODE === 'appstore-submit');
  process.exit(0);
}

console.log(`\nDistributing ${target.version} (${target.build}):`);

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

  const versions = (await api('GET', `/v1/apps/${app.id}/appStoreVersions?limit=20`)).data.filter((v) => v.attributes.platform === 'IOS');
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

  // Listing text + screenshots, per locale.
  for (const loc of (await api('GET', `/v1/appStoreVersions/${ver.id}/appStoreVersionLocalizations?limit=50`)).data) {
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
    const locs = (infos.included || []).filter((x) => x.type === 'appInfoLocalizations');
    const l = locs[0]?.attributes || {};
    const cat = info.relationships?.primaryCategory?.data?.id || 'MISSING';
    let age = '?';
    try {
      const decl = (await api('GET', `/v1/appInfos/${info.id}/ageRatingDeclaration`)).data;
      const d = decl?.attributes || {};
      // Optional overrides stay null; every content question gets the business-app answer.
      const OPTIONAL = new Set(['kidsAgeBand', 'ageRatingOverride', 'ageRatingOverrideV2', 'koreaAgeRatingOverride', 'developerAgeRatingInfoUrl']);
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
  await tryStep('price schedule', async () => {
    const p = await api('GET', `/v1/apps/${app.id}/appPriceSchedule`);
    return p.data ? 'set' : 'MISSING';
  });

  // Review details for App Review: reuse the TestFlight review contact + demo sign-in.
  const beta = (await api('GET', `/v1/apps/${app.id}/betaAppReviewDetail`)).data?.attributes || {};
  const reviewNotes =
    'Saguaro Field is the field app for Saguaro, a construction management platform used by general contractors. ' +
    'Sign in with the demo account above. Native features used on device: camera capture for daily-log and punch-list photos, ' +
    'GPS stamping for time-clock punches and photos, Face ID sign-in, and push notifications. ' +
    'Accounts are created by the contractor\'s company; the app has no in-app purchases.';
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
      if (k === 'notes' || k === 'demoAccountRequired' || !rd?.attributes?.[k]) fill[k] = v;
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
