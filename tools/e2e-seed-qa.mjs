/**
 * ONE PROJECT IN THE QA TENANT, SO THE DYNAMIC ROUTES CAN BE SWEPT AT ALL.
 *
 * e2e-app-sweep covers 79 static routes and skips 61 dynamic ones, 58 of which
 * are /app/projects/[projectId]/*. That is not a corner of the product — it is
 * the product. They were skipped because the QA tenant is empty:
 *
 *   claude.qa@saguarocontrol.net -> 0 projects, 0 leads, 0 subcontractors
 *
 * so there was no id to substitute and a fabricated one would only have proved
 * the 404 path works.
 *
 * This creates the missing project THROUGH THE APP'S OWN API rather than with
 * an INSERT, so the create path is exercised too, and the row lands with
 * whatever defaults, triggers and derived columns the real endpoint applies.
 *
 * Idempotent: if the tenant already has a project it keeps it and prints the id.
 * It never touches any tenant but the one it signed in as — /api/projects/create
 * takes tenant_id from getUser(), never from the body.
 *
 *   node tools/e2e-seed-qa.mjs
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const BASE = process.env.SWEEP_BASE || 'https://saguarocontrol.net';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])
);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
const { data: auth, error } = await sb.auth.signInWithPassword({
  email: env.SAGUARO_QA_EMAIL, password: env.SAGUARO_QA_PASS,
});
if (error || !auth?.session) { console.log('SIGN-IN FAILED:', error?.message); process.exit(1); }

const headers = {
  'Content-Type': 'application/json',
  authorization: `Bearer ${auth.session.access_token}`,
  cookie: `sb-access-token=${auth.session.access_token}; sb-refresh-token=${auth.session.refresh_token}`,
};

console.log(`\nSEED QA TENANT — ${auth.user.email} against ${BASE}\n`);

const get = async (path) => {
  const r = await fetch(BASE + path, { headers });
  if (!r.ok) return null;
  return r.json().catch(() => null);
};

/* Already seeded? */
const existing = await get('/api/projects?limit=1&fields=id,name');
const rows = existing?.projects || existing?.data || (Array.isArray(existing) ? existing : []);
if (rows.length) {
  console.log(`  project already present: ${rows[0].id}  ${rows[0].name || ''}`);
  console.log('\nnothing to do\n');
  process.exit(0);
}

/* A job the sweep can actually walk: bidding phase, a contract value, real
   dates. A project with null everywhere exercises only the empty-state path. */
const body = {
  name: 'QA Sweep — Sonoran Ridge Fire Station 12',
  address: '4400 E Speedway Blvd',
  city: 'Tucson',
  state: 'AZ',
  zip: '85712',
  stateJurisdiction: 'AZ',
  projectType: 'commercial',
  status: 'active',
  phase: 'building',
  contractValue: 1875000,
  startDate: '2026-04-06',
  description: 'Sweep fixture. Created by tools/e2e-seed-qa.mjs so the dynamic routes have an id.',
  ownerName: 'City of Tucson',
  ownerEmail: 'qa-owner@example.test',
  architectName: 'Sonoran Design Partners',
};

const r = await fetch(BASE + '/api/projects/create', {
  method: 'POST', headers, body: JSON.stringify(body),
});
const out = await r.json().catch(() => ({}));
if (!r.ok || out.error) {
  console.log(`  CREATE FAILED  ${r.status}  ${out.error || ''}`);
  process.exit(1);
}
const id = out.project?.id || out.id || out.projectId;
console.log(`  created project ${id}  ${body.name}`);
console.log('\ndone\n');
