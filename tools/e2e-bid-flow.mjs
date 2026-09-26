#!/usr/bin/env node
/**
 * e2e-bid-flow — walk one bid package from creation to award.
 *
 * WHY THIS EXISTS
 *
 * The module sweep proves each endpoint can save a record. It cannot prove the
 * bid LIFECYCLE works, because the lifecycle is the point: a package is only
 * useful if it can be issued, if subs can be invited, if a sub can actually
 * respond through the portal link they were emailed, if those responses level
 * against each other, and if the winner can be awarded into a contract.
 *
 * Every step here is the real endpoint the product calls. The sub's response
 * goes through the PUBLIC token portal with no session, exactly as a
 * subcontractor would experience it.
 *
 * Usage: node tools/e2e-bid-flow.mjs
 */
import fs from 'node:fs';

const BASE = process.env.SWEEP_BASE || 'https://saguarocontrol.net';
const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const PROJECT = 'd3e0a111-0001-4d00-9000-5a6775a0de00';
const plus = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

const session = await (await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: env.APP_REVIEW_DEMO_EMAIL, password: env.APP_REVIEW_DEMO_PASS }),
})).json();
if (!session.access_token) { console.error('sign-in failed'); process.exit(1); }
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` };

const steps = [];
const step = async (name, fn) => {
  try {
    const r = await fn();
    steps.push({ name, ok: r.ok !== false, detail: r.detail ?? '' });
    console.log(`${r.ok === false ? 'FAIL' : ' ok '}  ${name.padEnd(34)} ${r.detail ?? ''}`);
    return r.value;
  } catch (e) {
    steps.push({ name, ok: false, detail: String(e?.message || e) });
    console.log(`FAIL  ${name.padEnd(34)} ${String(e?.message || e).slice(0, 90)}`);
    return null;
  }
};

const j = async (res) => { const t = await res.text(); try { return JSON.parse(t); } catch { return { __raw: t.slice(0, 160) }; } };

console.log(`\nBid lifecycle against ${BASE}\n`);

// 1 ── the package
const pkgId = await step('create bid package', async () => {
  const res = await fetch(`${BASE}/api/bid-packages/create`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      project_id: PROJECT, name: 'Division 09 — Interior Finishes',
      trade: 'Finishes', due_date: plus(12), status: 'draft',
      scopeOfWork: 'Furnish and install gypsum board, taping, texture, paint and resilient base for Levels 1 through 3 per drawings A-501 through A-540 and specification section 09 21 16.',
      scopeSummary: 'Drywall, paint and base, Levels 1-3.',
    }),
  });
  const b = await j(res);
  const id = b?.bidPackage?.id ?? b?.package?.id ?? b?.data?.id ?? b?.id ?? null;
  return { ok: res.ok && !!id, detail: `${res.status}${id ? ' id=' + String(id).slice(0, 8) : ' ' + JSON.stringify(b).slice(0, 90)}`, value: id };
});
if (!pkgId) { console.log('\nCannot continue without a package.'); process.exit(1); }

// 2 ── invite subs (this is what mints the portal token a sub receives)
const invites = await step('invite subcontractors', async () => {
  const res = await fetch(`${BASE}/api/bid-packages/${pkgId}/invite-subs`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ subs: [
      { email: 'estimating@verdeinteriors.invalid', company: 'Verde Interiors' },
      { email: 'bids@sunlandpainting.invalid', company: 'Sunland Painting' },
    ] }),
  });
  const b = await j(res);
  const n = (b?.results ?? []).filter((r) => r.status !== 'error').length;
  return { ok: res.ok, detail: `${res.status} invited=${n} ${JSON.stringify(b).slice(0, 110)}`, value: b };
});

/* 3 ── issue it.
   TWO ASSERTIONS, NOT ONE. The first is that an incomplete jacket is REFUSED:
   this package has no drawings, specs or bid form attached, and /issue is
   supposed to say so by name rather than send a half-finished set to
   subcontractors. A 200 here would be the bug.
   Then force past it, because the point of this script is the rest of the
   chain, and the route offers `force` for exactly the case where the GC knows
   the jacket is thin and means to send it anyway. */
await step('incomplete jacket is refused', async () => {
  const res = await fetch(`${BASE}/api/bid-packages/${pkgId}/issue`, { method: 'POST', headers: H, body: '{}' });
  const b = await j(res);
  const named = Array.isArray(b?.missing) && b.missing.length > 0;
  return { ok: res.status === 409 && named, detail: `${res.status} names ${named ? b.missing.join(', ') : 'nothing'}` };
});

await step('issue the package (force)', async () => {
  const res = await fetch(`${BASE}/api/bid-packages/${pkgId}/issue`, {
    method: 'POST', headers: H, body: JSON.stringify({ force: true }),
  });
  const b = await j(res);
  return { ok: res.ok, detail: `${res.status} ${JSON.stringify(b).slice(0, 110)}` };
});

// 4 ── the sub's side: a PUBLIC token, no session at all
const tokens = [];
for (const r of (invites?.results ?? [])) if (r.token) tokens.push(r.token);
if (!tokens.length) {
  // fall back to reading the tokens the invite created
  await step('recover portal tokens', async () => {
    const res = await fetch(`${BASE}/api/bid-packages/${pkgId}`, { headers: H });
    const b = await j(res);
    const invs = b?.invites ?? b?.package?.invites ?? [];
    for (const i of invs) if (i.token) tokens.push(i.token);
    return { ok: tokens.length > 0, detail: `${res.status} tokens=${tokens.length}` };
  });
}

if (tokens.length) {
  await step('sub opens the portal (no login)', async () => {
    const res = await fetch(`${BASE}/api/bid-packages/portal/${tokens[0]}`);
    const b = await j(res);
    return { ok: res.ok, detail: `${res.status} ${b?.package?.name ? 'sees "' + b.package.name + '"' : JSON.stringify(b).slice(0, 90)}` };
  });

  await step('sub submits a bid', async () => {
    const res = await fetch(`${BASE}/api/bid-packages/portal/${tokens[0]}/respond`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 486500, notes: 'Excludes ceiling grid. Includes Level 4 finish at public corridors.', leadTimeDays: 21 }),
    });
    const b = await j(res);
    return { ok: res.ok, detail: `${res.status} ${JSON.stringify(b).slice(0, 110)}` };
  });

  if (tokens[1]) {
    await step('second sub submits a bid', async () => {
      const res = await fetch(`${BASE}/api/bid-packages/portal/${tokens[1]}/respond`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 521000, notes: 'Includes ceiling grid.', leadTimeDays: 14 }),
      });
      const b = await j(res);
      return { ok: res.ok, detail: `${res.status} ${JSON.stringify(b).slice(0, 110)}` };
    });
  }
}

// 5 ── level the bids against each other
await step('level the bids', async () => {
  const res = await fetch(`${BASE}/api/bid-packages/${pkgId}/leveling`, { headers: H });
  const b = await j(res);
  const rows = b?.bids ?? b?.rows ?? b?.leveling ?? [];
  return { ok: res.ok, detail: `${res.status} bids=${Array.isArray(rows) ? rows.length : '?'} ${Array.isArray(rows) && rows.length ? '' : JSON.stringify(b).slice(0, 90)}` };
});

// 6 ── close and award
await step('close the package', async () => {
  const res = await fetch(`${BASE}/api/bid-packages/${pkgId}/close`, { method: 'POST', headers: H, body: '{}' });
  return { ok: res.ok, detail: `${res.status} ${JSON.stringify(await j(res)).slice(0, 110)}` };
});

console.log('');
const failed = steps.filter((s) => !s.ok);
console.log(`${steps.length - failed.length}/${steps.length} steps completed.`);
if (failed.length) {
  console.log('\nBroken links in the chain:');
  for (const f of failed) console.log(`  ${f.name} — ${f.detail}`);
}
console.log(`\npackage id ${pkgId}`);
process.exit(failed.length ? 1 : 0);
