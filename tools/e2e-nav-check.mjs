/**
 * EVERY SIDEBAR LINK, FOLLOWED AS A SIGNED-IN USER.
 *
 * A route sweep proves pages exist. It does not prove the navigation points at
 * them. This reads the hrefs straight out of components/AppSidebar.tsx and
 * follows each one, so three separate defects show up:
 *
 *   broken   the link 404s or 500s
 *   bounced  the link lands somewhere else — a nav item that silently throws
 *            you back to /app is worse than no nav item, because the user
 *            clicks it repeatedly and concludes the product is broken
 *   stale    the href points at a route folder that no longer exists on disk
 *
 * Bouncing is how feature-gated sections behave: Command Center redirects to
 * /app when the tenant lacks the entitlement. That is correct server behaviour
 * and a UI bug — the item should not be in the sidebar at all for that tenant.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const ROOT = process.cwd();
const BASE = process.env.SWEEP_BASE || 'https://saguarocontrol.net';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])
);

const sidebar = readFileSync(join(ROOT, 'components/AppSidebar.tsx'), 'utf8');
const items = [...sidebar.matchAll(/\{\s*label:\s*'([^']+)'\s*,\s*href:\s*'([^']+)'/g)]
  .map((m) => ({ label: m[1], href: m[2] }));

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
const { data: auth, error } = await sb.auth.signInWithPassword({
  email: env.SAGUARO_QA_EMAIL, password: env.SAGUARO_QA_PASS,
});
if (error || !auth?.session) { console.log('SIGN-IN FAILED:', error?.message); process.exit(1); }
const cookie = `sb-access-token=${auth.session.access_token}; sb-refresh-token=${auth.session.refresh_token}`;

console.log(`\nNAV CHECK — ${items.length} sidebar links, as ${auth.user.email}\n`);

const broken = [], bounced = [], stale = [], fine = [];
for (const it of items) {
  const path = it.href.split('?')[0];
  // Does a route folder actually back this href?
  const onDisk =
    existsSync(join(ROOT, 'app', path, 'page.tsx')) ||
    existsSync(join(ROOT, 'app', path, 'page.jsx'));
  if (!onDisk) stale.push(it);

  try {
    const r = await fetch(BASE + it.href, { headers: { cookie }, redirect: 'follow' });
    const landed = new URL(r.url).pathname;
    if (r.status >= 400) broken.push({ ...it, status: r.status });
    else if (landed !== path) bounced.push({ ...it, landed });
    else fine.push(it);
  } catch (e) {
    broken.push({ ...it, status: 'THREW: ' + String(e).slice(0, 80) });
  }
}

console.log(`OK ${fine.length} · bounced ${bounced.length} · broken ${broken.length} · no route folder ${stale.length}`);
const show = (label, rows, fmt) => {
  if (!rows.length) return;
  console.log(`\n${label}`);
  for (const r of rows) console.log('    ' + fmt(r));
};
show('BROKEN', broken, (r) => `${r.label.padEnd(20)} ${r.href}  ${r.status}`);
show('BOUNCED (nav item that sends you elsewhere)', bounced, (r) => `${r.label.padEnd(20)} ${r.href}  ->  ${r.landed}`);
show('NO ROUTE FOLDER ON DISK', stale, (r) => `${r.label.padEnd(20)} ${r.href}`);
console.log('');
process.exitCode = broken.length || stale.length ? 1 : 0;
