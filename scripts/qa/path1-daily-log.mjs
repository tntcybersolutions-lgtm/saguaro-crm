// MUST-PASS Path 1 — write today's daily log, driven live as the QA user.
//
//   node --env-file=.env.local scripts/qa/path1-daily-log.mjs [baseUrl]
//
// Signs in with SAGUARO_QA_EMAIL / SAGUARO_QA_PASS (read from env, never
// printed), then calls the exact endpoints app/app/daily-logs/page.tsx calls,
// with the exact body shape it sends. The one log it writes is labelled
// QA-FIXTURE and deleted in `finally`; the deletion is proved by a 404.
// Exit code is non-zero if any check fails.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const BASE = process.argv[2] || 'http://localhost:3000';
const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon, SAGUARO_QA_EMAIL: email, SAGUARO_QA_PASS: pass } = process.env;
if (!url || !anon || !email || !pass) { console.error('missing env: NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SAGUARO_QA_EMAIL / SAGUARO_QA_PASS'); process.exit(2); }

let failures = 0;
const check = (name, ok, detail) => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

// The practice date: the calendar day on the wall where the user is standing.
const practiceDate = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

const sb = createClient(url, anon, { auth: { persistSession: false } });
const { data: auth, error: authErr } = await sb.auth.signInWithPassword({ email, password: pass });
if (authErr || !auth.session) { console.error('sign-in failed:', authErr?.message); process.exit(2); }
console.log(`signed in as QA user (id ${auth.user.id.slice(0, 8)}…), practice date ${practiceDate}, UTC date ${new Date().toISOString().slice(0, 10)}`);
const cookie = `sb-access-token=${auth.session.access_token}; sb-refresh-token=${auth.session.refresh_token}`;
const call = async (method, path, body) => {
  const r = await fetch(BASE + path, { method, headers: { cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await r.json(); } catch { /* non-JSON */ }
  return { status: r.status, json };
};

let createdId = null;
try {
  // 1. Page load: projects dropdown + log list.
  const proj = await call('GET', '/api/projects?limit=100&fields=id,name');
  const projects = Array.isArray(proj.json) ? proj.json : proj.json?.projects ?? [];
  check('GET /api/projects', proj.status === 200 && projects.length > 0, `status ${proj.status}, ${projects.length} projects`);
  const before = await call('GET', '/api/daily-logs/list');
  const logsBefore = before.json?.logs ?? [];
  check('GET /api/daily-logs/list (before)', before.status === 200, `status ${before.status}, ${logsBefore.length} logs, source ${before.json?.source}`);

  // A project with no log today — daily_logs is unique on (project, date, tenant).
  const taken = new Set(logsBefore.filter(l => l.log_date === practiceDate).map(l => l.project_id));
  const project = projects.find(p => !taken.has(p.id));
  if (!project) throw new Error('every project already has a log for today — nothing to drive without overwriting real data');
  console.log(`project: ${project.name} (${project.id.slice(0, 8)}…)`);

  // 2. Save — the body page.tsx submitCreate() sends.
  const stamp = `QA-FIXTURE path1 ${new Date().toISOString()}`;
  const body = {
    projectId: project.id, logDate: practiceDate, weather: 'Clear', temperatureHigh: 91, temperatureLow: 68,
    crewCount: 7, workPerformed: `${stamp} — set forms on level 2 deck`, delays: '', safetyNotes: 'Toolbox talk: ladders',
    materialsDelivered: '', visitors: '', notes: '', superintendent: 'QA Super', precipitation: null,
    windConditions: '8 mph SW', phaseOfWork: 'Framing', equipment: null,
  };
  const created = await call('POST', '/api/daily-logs/create', body);
  createdId = created.json?.log?.id ?? null;
  const row = created.json?.log ?? {};
  check('POST /api/daily-logs/create', created.status === 200 && !!createdId, `status ${created.status}, id ${createdId}`);
  check('  saved log_date is the practice date', row.log_date === practiceDate, `log_date ${row.log_date}`);
  check('  saved crew/weather/work', row.crew_count === 7 && row.weather === 'Clear' && row.work_performed === body.workPerformed, `crew ${row.crew_count}, weather ${row.weather}, work "${String(row.work_performed).slice(0, 40)}…"`);
  check('  saved temps', Number(row.high_temp) === 91 && Number(row.low_temp) === 68, `high_temp ${row.high_temp}, low_temp ${row.low_temp}`);
  check('  saved project + super + phase', row.project_id === project.id && row.superintendent === 'QA Super' && row.phase_of_work === 'Framing', `project ${String(row.project_id).slice(0, 8)}…, super ${row.superintendent}, phase ${row.phase_of_work}`);

  // 3. Second save of the same day (double tap on bad signal) must not 500.
  const dup = await call('POST', '/api/daily-logs/create', body);
  check('POST duplicate same day -> 409 with existing id', dup.status === 409 && dup.json?.existingLogId === createdId, `status ${dup.status}, existingLogId ${dup.json?.existingLogId}`);

  // 4. Reopen: list (what the table renders) and detail (row click).
  const after = await call('GET', '/api/daily-logs/list');
  const listed = (after.json?.logs ?? []).find(l => l.id === createdId);
  check('GET /api/daily-logs/list shows the new log', after.status === 200 && !!listed, `status ${after.status}, ${after.json?.logs?.length} logs, found ${!!listed}`);
  // Regression guard: the key the table's Temp column reads (taken from the
  // page source, not assumed) must be a key the list route actually returns.
  const pageSrc = readFileSync(new URL('../../app/app/daily-logs/page.tsx', import.meta.url), 'utf8');
  // The form's default date must be the wall-clock day, not the UTC day
  // (in Arizona the UTC date is tomorrow from 5 pm on).
  const utcDefaults = (pageSrc.match(/logDate: new Date\(\)\.toISOString\(\)/g) || []).length;
  check('  page defaults logDate to the practice date, not UTC', utcDefaults === 0, `${utcDefaults} UTC-date default(s) in page.tsx`);
  const tempKeys =[...pageSrc.matchAll(/row\.(\w+) \?\? '—'}°/g)].map(m => m[1]);
  check('  list row carries the keys the Temp column reads', listed && tempKeys.length === 2 && Number(listed[tempKeys[0]]) === 91 && Number(listed[tempKeys[1]]) === 68, `page reads [${tempKeys.join(', ')}] -> ${tempKeys.map(k => listed?.[k]).join(' / ')}`);
  const detail = await call('GET', `/api/daily-logs/${createdId}`);
  const d = detail.json?.log ?? {};
  check('GET /api/daily-logs/[id] reopens it', detail.status === 200 && d.id === createdId && d.log_date === practiceDate && d.work_performed === body.workPerformed && d.crew_count === 7, `status ${detail.status}, log_date ${d.log_date}, crew ${d.crew_count}`);
} catch (e) {
  failures++;
  console.log('FAIL  driver aborted —', e.message);
} finally {
  if (createdId) {
    const del = await call('DELETE', `/api/daily-logs/${createdId}`);
    const gone = await call('GET', `/api/daily-logs/${createdId}`);
    const ok = gone.status === 404;
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  fixture cleanup — DELETE ${del.status}, then GET ${gone.status} (404 = gone)`);
  }
  await sb.auth.signOut();
}
console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);
