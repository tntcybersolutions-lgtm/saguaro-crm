#!/usr/bin/env node
/**
 * App Store Connect — TestFlight state and distribution for Saguaro Field
 * (net.saguarocontrol.field). No dependencies; signs its own ES256 JWT.
 *
 *   node tools/asc.mjs status       read-only: builds, beta states, groups, review
 *   node tools/asc.mjs distribute   newest valid build → export compliance,
 *                                   "What to Test", every beta group, and a
 *                                   Beta App Review submission for external testers
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
if (!['status', 'distribute'].includes(MODE)) {
  console.error(`Unknown mode "${MODE}" — use status or distribute`);
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

const snap = await snapshot();
const target = snap.builds.find((b) => b.processing === 'VALID' && !b.expired);
report(snap, target);
if (!target) {
  console.log('\nNo VALID, unexpired build to distribute (still processing, or every build expired).');
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
    api('POST', `/v1/betaGroups/${g.id}/relationships/builds`, { data: [{ type: 'builds', id: target.id }] }));
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
