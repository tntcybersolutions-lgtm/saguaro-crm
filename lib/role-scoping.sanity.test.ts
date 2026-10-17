/**
 * @jest-environment node
 *
 * Role scoping, from the live QA of 17 Oct 2026 (walk/roles/REPORT.md):
 *   D1  a Subcontractor (job-scoped company role) sees only the jobs they are on
 *   D2  creating a job needs Projects: Full; every create route has a guard
 *   D3  a job closed to a person is gone from search, lists and rollups
 *   D4  money and pay rates never leave the server without the rights
 *   D5  the client's permission check is job-aware, the same rule as the server
 *   D6  a refusal reads as a refusal
 * Real resolver, real guard, real list routes; the database and session are faked.
 */
import fs from 'node:fs';
import path from 'node:path';
import { makeFakeDb } from './__fixtures__/fake-db';
import { describe, test, expect, beforeEach } from '@jest/globals';
declare const jest: { mock: (m: string, f: () => unknown) => void };

const fake = makeFakeDb();
let currentUser: { id: string; tenantId: string; email: string } | null = null;

jest.mock('@/lib/supabase-server', () => ({
  createServerClient: () => fake.db,
  getUser: async () => currentUser,
  supabaseAdmin: {},
}));

import { NextRequest } from 'next/server';
import { resolvePermissions, requirePermission, jobsClosedTo, CATEGORIES, type PermissionMap } from '@/lib/permissions';
import { isJobScoped } from '@/lib/permission-resolve';
import {
  computeViewerScope, planScopedRequest, redactBody, fetchWithScope, isUnrestricted, moneyOn, UNRESTRICTED, type ViewerScope,
} from '@/lib/viewer-scope';
import { parseEmbeds, stripGuardedColumns } from '@/lib/money-fields';
import { jobsOffFor } from '@/lib/visible-jobs';
import { ruleFor, allowedBy, jobOpen } from '@/lib/route-access';
import { jobFromPath } from '@/lib/hooks/usePermissions';
import { messageFor, retryText } from '@/lib/api-refusal';
import { humanError } from '@/lib/errors';
import { NO_ACCESS_LEVELS } from '@/lib/job-access';
import { GET as listRfis } from '@/app/api/rfis/list/route';
import { GET as listPunch } from '@/app/api/punch-list/list/route';
import { GET as listLogs } from '@/app/api/daily-logs/list/route';

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const JOB_A = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const JOB_B = 'aaaaaaaa-0000-4000-8000-0000000000a2';
const JOB_C = 'aaaaaaaa-0000-4000-8000-0000000000a3';
const SUB = { id: 'aaaaaaaa-0000-4000-8000-00000000c010', tenantId: A, email: 'sub@a.test' };
const FOREMAN = { id: 'aaaaaaaa-0000-4000-8000-00000000c011', tenantId: A, email: 'fm@a.test' };
const PM = { id: 'aaaaaaaa-0000-4000-8000-00000000c012', tenantId: A, email: 'pm@a.test' };

const ROLES = {
  sub: { Projects: 'View', Budget: 'None', Schedule: 'View', Safety: 'View', Documents: 'View', RFIs: 'Edit', Submittals: 'Edit', 'Change Orders': 'None', 'Pay Apps': 'None', Reports: 'None', Sales: 'None', Admin: 'None' },
  fm: { Projects: 'Edit', Budget: 'None', Schedule: 'Edit', Safety: 'Edit', Documents: 'Edit', RFIs: 'Edit', Submittals: 'View', 'Change Orders': 'None', 'Pay Apps': 'None', Reports: 'View', Sales: 'None', Admin: 'None' },
  pm: { Projects: 'Full', Budget: 'Full', Schedule: 'Full', Safety: 'Full', Documents: 'Full', RFIs: 'Full', Submittals: 'Full', 'Change Orders': 'Full', 'Pay Apps': 'Full', Reports: 'Full', Sales: 'Edit', Admin: 'View' },
};
const roleMap = new Map<string, unknown>(Object.entries(ROLES));
const digits = (m: PermissionMap) => CATEGORIES.map((c) => ({ None: 0, View: 1, Edit: 2, Full: 3 }[m[c]])).join('');
const req = (url: string, method = 'GET', body?: unknown) =>
  new NextRequest(`https://saguarocontrol.net${url}`, body === undefined ? { method } : { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

function seed() {
  fake.reset();
  const { T } = fake;
  T('projects').push(
    { id: JOB_A, tenant_id: A, name: 'Job A' },
    { id: JOB_B, tenant_id: A, name: 'Job B' },
    { id: JOB_C, tenant_id: A, name: 'Job C' },
  );
  T('profiles').push(
    { id: SUB.id, tenant_id: A, role: 'member' },
    { id: FOREMAN.id, tenant_id: A, role: 'member' },
    { id: PM.id, tenant_id: A, role: 'member' },
  );
  T('role_definitions').push(
    { id: 'sub', tenant_id: A, name: 'Subcontractor', is_builtin: true, scope: 'assigned', permissions: ROLES.sub },
    { id: 'fm', tenant_id: A, name: 'Foreman', is_builtin: true, scope: 'company', permissions: ROLES.fm },
    { id: 'pm', tenant_id: A, name: 'Project Manager', is_builtin: true, scope: 'company', permissions: ROLES.pm },
  );
  T('user_role_assignments').push(
    { id: 's1', tenant_id: A, user_id: SUB.id, role_id: 'sub', project_id: null, permissions: null },
    { id: 'f1', tenant_id: A, user_id: FOREMAN.id, role_id: 'fm', project_id: null, permissions: null },
    // The Foreman is PM on B and has No access on C (the report's setup).
    { id: 'f2', tenant_id: A, user_id: FOREMAN.id, role_id: 'pm', project_id: JOB_B, permissions: null },
    { id: 'f3', tenant_id: A, user_id: FOREMAN.id, role_id: null, project_id: JOB_C, permissions: NO_ACCESS_LEVELS },
    { id: 'p1', tenant_id: A, user_id: PM.id, role_id: 'pm', project_id: null, permissions: null },
  );
  // The sub is on Job A through the job's team only.
  T('project_team').push({ id: 't1', tenant_id: A, project_id: JOB_A, user_id: SUB.id });
  T('rfis').push(
    { id: 'r-a', tenant_id: A, project_id: JOB_A, rfi_number: 1, subject: 'A' },
    { id: 'r-c', tenant_id: A, project_id: JOB_C, rfi_number: 2, subject: 'JOBC SECRET RFI' },
  );
  T('punch_list').push(
    { id: 'p-a', tenant_id: A, project_id: JOB_A, title: 'A' },
    { id: 'p-c', tenant_id: A, project_id: JOB_C, title: 'JOBC SECRET punch' },
  );
  T('daily_logs').push(
    { id: 'l-a', tenant_id: A, project_id: JOB_A, log_date: '2026-10-17', deleted_at: null },
    { id: 'l-c', tenant_id: A, project_id: JOB_C, log_date: '2026-10-17', deleted_at: null },
  );
}

describe('D1 — a Subcontractor sees only the jobs they are on', () => {
  beforeEach(seed);

  test('the resolver: None on a job they are not on, the role on one they are', () => {
    const rows = [{ role_id: 'sub', project_id: null }];
    const scoped = new Set(['sub']);
    const onA = new Set([JOB_A]);
    const r = (pid: string | null) => digits(resolvePermissions({ baseRole: 'member', assignments: rows, roles: roleMap, projectId: pid, scopedRoleIds: scoped, memberJobIds: onA }));
    expect(r(JOB_A)).toBe(digits(resolvePermissions({ baseRole: 'member', assignments: rows, roles: roleMap, projectId: null })));
    expect(r(JOB_B)).toBe('000000000000');
    // A company-wide role beside it lifts the limit.
    expect(isJobScoped('member', [...rows, { role_id: 'fm', project_id: null }], scoped)).toBe(false);
    expect(isJobScoped('admin', rows, scoped)).toBe(false);
  });

  test('the guard: their job opens, another job is a 403, company directories are refused', async () => {
    currentUser = SUB;
    expect((await requirePermission(req(`/api/projects/${JOB_A}/rfis`), 'RFIs', 'View')).ok).toBe(true);
    const other = await requirePermission(req(`/api/projects/${JOB_B}/rfis`), 'Projects', 'View');
    expect(other.ok).toBe(false);
    if (!other.ok) expect(other.res.status).toBe(403);
    const dir = await requirePermission(req('/api/subs/list'), 'Projects', 'View', { projectId: null, companyWide: true });
    expect(dir.ok).toBe(false);
    // No owner pay apps, no pipeline, no subscription (the role grants none of them).
    expect((await requirePermission(req(`/api/pay-apps/list?projectId=${JOB_A}`), 'Pay Apps', 'View')).ok).toBe(false);
    expect((await requirePermission(req('/api/leads'), 'Sales', 'View', { projectId: null })).ok).toBe(false);
    expect((await requirePermission(req('/api/billing/subscription'), 'Admin', 'View', { projectId: null })).ok).toBe(false);
  });

  test('every list leaves out every job they are not on', async () => {
    expect(Array.from(await jobsClosedTo(fake.db as never, SUB.id, A)).sort()).toEqual([JOB_B, JOB_C].sort());
    const scope = computeViewerScope({
      baseRole: 'member', assignments: [{ role_id: 'sub', project_id: null }], roles: roleMap,
      scopedRoleIds: new Set(['sub']), memberJobIds: new Set([JOB_A]),
    });
    expect(scope.jobs).toEqual({ mode: 'only', allowed: new Set([JOB_A]) });
    const plan = planScopedRequest('https://db.test/rest/v1/rfis?select=*&tenant_id=eq.x', 'GET', scope, 'GET');
    expect(decodeURIComponent(plan.url)).toContain(`or=(project_id.is.null,project_id.in.(${JOB_A}))`);
    const jobs = planScopedRequest('https://db.test/rest/v1/projects?select=id', 'GET', scope, 'GET');
    expect(decodeURIComponent(jobs.url)).toContain(`id=in.(${JOB_A})`);
    // The access list itself is never filtered.
    expect(planScopedRequest('https://db.test/rest/v1/user_role_assignments?select=*', 'GET', scope, 'GET').url).not.toContain('or=');
  });
});

describe('D2 — creating a job needs Projects: Full, and every create route has a guard', () => {
  beforeEach(seed);

  test('the job-create rule refuses a Subcontractor and a Foreman, lets a PM through', async () => {
    const body = { name: 'New job' };
    currentUser = SUB;
    const s = await requirePermission(req('/api/projects/create', 'POST', body), 'Projects', 'Full', { projectId: null });
    expect(s.ok).toBe(false);
    if (!s.ok) expect(s.res.status).toBe(403);
    currentUser = FOREMAN;
    expect((await requirePermission(req('/api/projects/create', 'POST', body), 'Projects', 'Full', { projectId: null })).ok).toBe(false);
    currentUser = PM;
    expect((await requirePermission(req('/api/projects/create', 'POST', body), 'Projects', 'Full', { projectId: null })).ok).toBe(true);
  });

  test('the job-create route checks it', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'app/api/projects/create/route.ts'), 'utf8');
    expect(src).toMatch(/requirePermission\(req, 'Projects', 'Full', \{ projectId: null \}\)/);
  });

  test('every create route asks for a permission, not just a session', () => {
    const missing: string[] = [];
    const PUBLIC = new Set(['app/api/team/accept-invite/create-account/route.ts']); // the invite token is the check
    const walk = (dir: string) => {
      for (const f of fs.readdirSync(dir)) {
        const p = path.join(dir, f);
        if (fs.statSync(p).isDirectory()) walk(p);
        else if (f === 'route.ts' && /\/create\//.test(p.replace(/\\/g, '/') + '/')) {
          const rel = path.relative(process.cwd(), p).replace(/\\/g, '/');
          if (PUBLIC.has(rel)) continue;
          const s = fs.readFileSync(p, 'utf8');
          if (!/require(Any)?Permission\(|guard[A-Z]\w*\(/.test(s)) missing.push(rel);
        }
      }
    };
    walk(path.join(process.cwd(), 'app/api'));
    expect(missing).toEqual([]);
  });
});

describe('D3 — a closed job leaves search, lists and rollups', () => {
  beforeEach(seed);

  test('the one helper: archived jobs and jobs closed to the person', async () => {
    fake.T('projects').push({ id: 'aaaaaaaa-0000-4000-8000-0000000000a9', tenant_id: A, name: 'Old', is_archived: true });
    const off = await jobsOffFor(fake.db, FOREMAN);
    expect(off.has(JOB_C)).toBe(true);
    expect(off.has('aaaaaaaa-0000-4000-8000-0000000000a9')).toBe(true);
    expect(off.has(JOB_A) || off.has(JOB_B)).toBe(false);
  });

  test('company RFI, punch and daily-log lists drop the No-access job', async () => {
    currentUser = FOREMAN;
    const rfis = await (await listRfis(req('/api/rfis/list'))).json() as { rfis: { id: string }[] };
    expect(rfis.rfis.map((r) => r.id)).toEqual(['r-a']);
    const punch = await (await listPunch(req('/api/punch-list/list'))).json() as { items: { id: string }[] };
    expect(punch.items.map((r) => r.id)).toEqual(['p-a']);
    const logs = await (await listLogs(req('/api/daily-logs/list'))).json() as { logs: { id: string }[] };
    expect(logs.logs.map((r) => r.id)).toEqual(['l-a']);
  });

  test('search runs the same helper (the source says so) and the database layer filters every read', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'app/api/search/route.ts'), 'utf8');
    expect(src).toMatch(/jobsOffFor\(db, user\)/);
    expect(src).toMatch(/off\.has\(String\(onJob\)\)/);
    const scope: ViewerScope = { ...UNRESTRICTED, jobs: { mode: 'except', closed: new Set([JOB_C]) } };
    const plan = planScopedRequest('https://db.test/rest/v1/daily_logs?select=*,project:projects(id,name)&tenant_id=eq.x', 'GET', scope, 'GET');
    expect(decodeURIComponent(plan.url)).toContain(`or=(project_id.is.null,project_id.not.in.(${JOB_C}))`);
    // Inserts are left to the guard; updates and deletes are filtered too.
    expect(planScopedRequest('https://db.test/rest/v1/rfis', 'POST', scope, 'POST').url).not.toContain('or=');
    expect(planScopedRequest('https://db.test/rest/v1/rfis?id=eq.1', 'PATCH', scope, 'PATCH').url).toContain('or=');
  });
});

describe('D4 — money and rates are hidden on the server', () => {
  const foremanScope = () => computeViewerScope({
    baseRole: 'member',
    assignments: [{ role_id: 'fm', project_id: null }, { role_id: 'pm', project_id: JOB_B }],
    roles: roleMap,
  });

  test('a Foreman: no money company-wide, money on the job they are PM on', () => {
    const s = foremanScope();
    expect(isUnrestricted(s)).toBe(false);
    expect(moneyOn(s, null)).toBe(false);
    expect(moneyOn(s, JOB_A)).toBe(false);
    expect(moneyOn(s, JOB_B)).toBe(true);
    expect(isUnrestricted(computeViewerScope({ baseRole: 'member', assignments: [{ role_id: 'pm', project_id: null }], roles: roleMap }))).toBe(true);
    expect(isUnrestricted(computeViewerScope({ baseRole: 'owner', assignments: [], roles: roleMap }))).toBe(true);
  });

  test('rows, embedded rows and renamed columns arrive null; jsonb and other columns do not', () => {
    const s = foremanScope();
    const select = 'id,name,value:contract_value,project_id,lines:pay_app_line_items(id,scheduled_value),meta';
    expect(parseEmbeds(select).map((e) => e.table)).toEqual(['pay_app_line_items']);
    const plan = planScopedRequest(`https://db.test/rest/v1/projects?select=${encodeURIComponent(select)}`, 'GET', s, 'GET');
    expect(plan.redact).not.toBeNull();
    const rows = redactBody([
      { id: JOB_A, name: 'A', value: 2539650, lines: [{ id: 'l1', scheduled_value: 10 }], meta: { amount: 5 } },
      { id: JOB_B, name: 'B', value: 500000, lines: [{ id: 'l2', scheduled_value: 20 }], meta: { amount: 5 } },
    ], plan.redact!, s) as Array<Record<string, any>>;
    expect(rows[0].value).toBeNull();
    expect(rows[0].lines[0].scheduled_value).toBeNull();
    expect(rows[0].meta).toEqual({ amount: 5 });
    expect(rows[0].name).toBe('A');
    expect(rows[1].value).toBe(500000); // PM on B
    expect(rows[1].lines[0].scheduled_value).toBe(20);
  });

  test('pay rates, the pipeline and a pinned job', () => {
    const s = foremanScope();
    const rate = planScopedRequest('https://db.test/rest/v1/prevailing_wage_rates?select=*', 'GET', s, 'GET');
    expect(redactBody([{ id: 1, base_rate: 28.65, trade: 'Electrician' }], rate.redact!, s)).toEqual([{ id: 1, base_rate: null, trade: 'Electrician' }]);
    const leads = planScopedRequest('https://db.test/rest/v1/lead_pipeline?select=*', 'GET', s, 'GET');
    expect(redactBody([{ id: 1, estimated_value: 11602000 }], leads.redact!, s)).toEqual([{ id: 1, estimated_value: null }]);
    // A budget read pinned to the job they are PM on keeps its figures.
    const pinned = planScopedRequest(`https://db.test/rest/v1/budget_lines?select=id,original_budget&project_id=eq.${JOB_B}`, 'GET', s, 'GET');
    expect(redactBody([{ id: 1, original_budget: 100 }], pinned.redact!, s)).toEqual([{ id: 1, original_budget: 100 }]);
  });

  test('never during a write request; a read request never saves money', () => {
    const s = foremanScope();
    expect(planScopedRequest('https://db.test/rest/v1/projects?select=*', 'GET', s, 'POST').redact).toBeNull();
    const strip = planScopedRequest('https://db.test/rest/v1/projects?id=eq.1', 'PATCH', s, 'GET');
    expect(strip.strip).not.toBeNull();
    expect(stripGuardedColumns('projects', { name: 'x', contract_value: 0 }, { money: false, rates: false })).toEqual({ name: 'x' });
  });

  test('an update by someone who never saw the figure cannot overwrite it; their PM job can', async () => {
    const s = foremanScope();
    const plan = planScopedRequest('https://db.test/rest/v1/budget_lines?id=eq.7', 'PATCH', s, 'PATCH');
    expect(plan.strip).toMatchObject({ rates: false, update: true });
    // Inserts keep what they carry; time entries (rates) are never stripped in a write request.
    expect(planScopedRequest('https://db.test/rest/v1/tm_tickets', 'POST', s, 'POST').strip).toBeNull();
    expect(planScopedRequest('https://db.test/rest/v1/time_entries?id=eq.1', 'PATCH', s, 'POST').strip).toBeNull();
    const calls: Array<{ url: string; method: string; body?: string }> = [];
    const doFetch = (rowJob: string) => async (url: string, init?: RequestInit) => {
      calls.push({ url, method: String(init?.method), body: init?.body as string | undefined });
      if (init?.method === 'GET') return new Response(JSON.stringify([{ project_id: rowJob }]), { status: 200, headers: { 'content-type': 'application/json' } });
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const body = JSON.stringify({ description: 'Concrete', original_budget: 0 });
    await fetchWithScope(doFetch(JOB_A), 'https://db.test/rest/v1/budget_lines?id=eq.7', { method: 'PATCH', body }, s, 'PATCH');
    expect(JSON.parse(calls.find((c) => c.method === 'PATCH')!.body!)).toEqual({ description: 'Concrete' });
    calls.length = 0;
    await fetchWithScope(doFetch(JOB_B), 'https://db.test/rest/v1/budget_lines?id=eq.7', { method: 'PATCH', body }, s, 'PATCH');
    expect(JSON.parse(calls.find((c) => c.method === 'PATCH')!.body!)).toEqual({ description: 'Concrete', original_budget: 0 });
  });

  test('end to end through the database fetch', async () => {
    const s = foremanScope();
    let asked = '';
    const doFetch = async (url: string) => {
      asked = url;
      return new Response(JSON.stringify([{ id: JOB_A, contract_value: 2539650, name: 'A' }]), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const res = await fetchWithScope(doFetch, 'https://db.test/rest/v1/projects?select=id,contract_value,name', { method: 'GET' }, { ...s, jobs: { mode: 'except', closed: new Set([JOB_C]) } }, 'GET');
    expect(await res.json()).toEqual([{ id: JOB_A, contract_value: null, name: 'A' }]);
    expect(decodeURIComponent(asked)).toContain(`id=not.in.(${JOB_C})`);
  });
});

describe('D5 — the client check is job-aware, the same rule as the server', () => {
  const fm = ROLES.fm as unknown as Record<string, 'None' | 'View' | 'Edit' | 'Full'>;
  const pm = ROLES.pm as unknown as Record<string, 'None' | 'View' | 'Edit' | 'Full'>;
  const none = NO_ACCESS_LEVELS as unknown as Record<string, 'None'>;

  test('the job comes from the URL', () => {
    expect(jobFromPath(`/app/projects/${JOB_A}/budget`)).toBe(JOB_A);
    expect(jobFromPath('/app/projects')).toBeNull();
    expect(jobFromPath('/app/projects/new')).toBeNull();
  });

  test('screens follow the role ON the job', () => {
    const budgetA = ruleFor(`/app/projects/${JOB_A}/budget`);
    expect(budgetA.job).toBe(JOB_A);
    expect(allowedBy(budgetA.rule, fm)).toBe(false);   // Foreman's company role on A
    expect(allowedBy(budgetA.rule, pm)).toBe(true);    // PM role on B (job role)
    expect(jobOpen(none)).toBe(false);                 // No access on C
    expect(allowedBy(ruleFor(`/app/projects/${JOB_A}/rfis`).rule, fm)).toBe(true);
    expect(allowedBy(ruleFor(`/app/projects/${JOB_A}/pay-apps/new`).rule, fm)).toBe(false);
  });

  test('company screens: pipeline, billing, admin, new jobs, and nothing company-wide for a sub', () => {
    expect(allowedBy(ruleFor('/app/leads').rule, fm)).toBe(false);
    expect(allowedBy(ruleFor('/app/billing').rule, fm)).toBe(false);
    expect(allowedBy(ruleFor('/app/billing').rule, pm)).toBe(true);
    expect(allowedBy(ruleFor('/app/roles-permissions').rule, fm)).toBe(false);
    expect(allowedBy(ruleFor('/app/projects/new').rule, fm)).toBe(false);
    expect(allowedBy(ruleFor('/app/projects/new').rule, pm)).toBe(true);
    expect(allowedBy(ruleFor('/app/subs').rule, ROLES.sub as never, true)).toBe(false);
    expect(allowedBy(ruleFor('/app/daily-logs').rule, ROLES.sub as never, true)).toBe(true);
  });

  test('the RFI screen gates New RFI on the job role (useEditRights is job-aware)', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'app/app/projects/[projectId]/rfis/page.tsx'), 'utf8');
    expect(src).toMatch(/actions=\{rights\.edit \?/);
    expect(src).toMatch(/if \(!rights\.edit\) return;/);
  });
});

describe('D6 — a refusal reads as a refusal', () => {
  test('403 keeps the server words or says so plainly; 401 is a session, not a refusal', () => {
    expect(messageFor(403, { error: "You don't have permission to view Budget. Ask your company admin for access." }, 'x'))
      .toBe("You don't have permission to view Budget. Ask your company admin for access.");
    expect(messageFor(403, { error: 'Forbidden' }, 'x')).toMatch(/^You don't have permission/);
    expect(messageFor(401, null, 'x')).toMatch(/session expired/i);
    expect(messageFor(502, null, "Couldn't load the budget.")).toBe("Couldn't load the budget.");
    expect(retryText("You don't have permission to view Budget.")).toBe("You don't have permission to view Budget.");
    expect(retryText('Server busy.')).toBe('Server busy. Nothing has been lost — try again.');
    expect(humanError(new Error('Unexpected token \'u\', "upstream r"... is not valid JSON'), 'Fallback.')).toBe('Fallback.');
  });

  test('the guard says "You don\'t have permission to …"', async () => {
    seed();
    currentUser = FOREMAN;
    const g = await requirePermission(req(`/api/projects/${JOB_A}/budget`), 'Budget', 'View');
    expect(g.ok).toBe(false);
    if (!g.ok) {
      expect(g.res.status).toBe(403);
      expect((await g.res.json() as { error: string }).error).toBe("You don't have permission to view Budget. Ask your company admin for access.");
    }
  });
});

describe('D16 — an archived job takes no new records', () => {
  beforeEach(seed);
  test('a write naming an archived job is refused; reads and the job record are not', async () => {
    fake.T('projects').find((p) => p.id === JOB_A)!.is_archived = true;
    currentUser = PM;
    const w = await requirePermission(req('/api/daily-logs/create', 'POST', { project_id: JOB_A }), 'Projects', 'Edit');
    expect(w.ok).toBe(false);
    if (!w.ok) expect(w.res.status).toBe(409);
    expect((await requirePermission(req(`/api/projects/${JOB_A}/daily-logs`), 'Projects', 'View')).ok).toBe(true);
    expect((await requirePermission(req(`/api/projects/${JOB_A}`, 'PATCH', {}), 'Projects', 'Edit')).ok).toBe(true);
  });
});
