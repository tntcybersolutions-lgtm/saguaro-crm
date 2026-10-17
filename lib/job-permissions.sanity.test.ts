/**
 * @jest-environment node
 *
 * Permissions per job (Procore behavior), through the real resolver, the real
 * guard and the real job-access route. Only the database and the session are
 * faked.
 *
 * Resolution order (lib/permissions resolvePermissions):
 *   1 admin/owner profile → Full everywhere   2 company role (global grants)
 *   3 no job / no row for it → company role   4 job row REPLACES it on that job
 *   5 Admin stays company-wide                6 company admins only gain on a job
 */
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
import { projectIdFromPath, projectIdFromQuery, recordRefFromPath, projectIdFromBody } from '@/lib/permission-scope';
import { describeJobRow, NO_ACCESS_LEVELS } from '@/lib/job-access';
import { GET as getAccess, PUT as putAccess } from '@/app/api/projects/[projectId]/access/route';

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';
const JOB = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const JOB2 = 'aaaaaaaa-0000-4000-8000-0000000000a2';
const JOB_B = 'bbbbbbbb-0000-4000-8000-0000000000b1';
const RFI_JOB = 'aaaaaaaa-0000-4000-8000-0000000000f1';
const RFI_JOB2 = 'aaaaaaaa-0000-4000-8000-0000000000f2';
const ADMIN = { id: 'aaaaaaaa-0000-4000-8000-00000000ad01', tenantId: A, email: 'admin@a.test' };
const VIEWER = { id: 'aaaaaaaa-0000-4000-8000-00000000c001', tenantId: A, email: 'viewer@a.test' };
const PM = { id: 'aaaaaaaa-0000-4000-8000-00000000c002', tenantId: A, email: 'pm@a.test' };
const OTHER = { id: 'bbbbbbbb-0000-4000-8000-00000000ad01', tenantId: B, email: 'admin@b.test' };

const ROLES = {
  ro: { Projects: 'View', Budget: 'View', Schedule: 'View', Safety: 'View', Documents: 'View', RFIs: 'View', Submittals: 'View', 'Change Orders': 'View', 'Pay Apps': 'View', Reports: 'View', Sales: 'View', Admin: 'None' },
  pm: { Projects: 'Full', Budget: 'Full', Schedule: 'Full', Safety: 'Full', Documents: 'Full', RFIs: 'Full', Submittals: 'Full', 'Change Orders': 'Full', 'Pay Apps': 'Full', Reports: 'Full', Sales: 'Edit', Admin: 'View' },
  fm: { Projects: 'Edit', Budget: 'None', Schedule: 'Edit', Safety: 'Edit', Documents: 'Edit', RFIs: 'View', Submittals: 'View', 'Change Orders': 'None', 'Pay Apps': 'None', Reports: 'View', Sales: 'None', Admin: 'None' },
  adm: Object.fromEntries(CATEGORIES.map((c) => [c, 'Full'])),
  old: { Projects: 'Edit', Budget: 'View' }, // stored before Sales existed
};
const roleMap = new Map<string, unknown>(Object.entries(ROLES));
const digits = (m: PermissionMap) => CATEGORIES.map((c) => ({ None: 0, View: 1, Edit: 2, Full: 3 }[m[c]])).join('');

const req = (url: string, method = 'GET', body?: unknown) =>
  new NextRequest(`https://saguarocontrol.net${url}`, body === undefined ? { method } : { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const pp = (projectId: string) => ({ params: Promise.resolve({ projectId }) });

describe('resolution order', () => {
  const R = (assignments: { role_id: string | null; project_id: string | null; permissions?: unknown }[], projectId: string | null, baseRole = 'member') =>
    digits(resolvePermissions({ baseRole, assignments, roles: roleMap, projectId }));

  test('1. an admin or owner profile is Full on every job, whatever the job row says', () => {
    expect(R([{ role_id: null, project_id: JOB, permissions: NO_ACCESS_LEVELS }], JOB, 'Owner')).toBe('333333333333');
    expect(R([], null, 'admin')).toBe('333333333333');
  });
  test('2. company role: no grant is the member default; two grants, highest wins', () => {
    expect(R([], null)).toBe('111111111110');
    expect(R([{ role_id: 'ro', project_id: null }, { role_id: 'fm', project_id: null }], null)).toBe('212221111110');
  });
  test('3. no job asked, or no row for that job → company role', () => {
    const rows = [{ role_id: 'ro', project_id: null }, { role_id: 'pm', project_id: JOB }];
    expect(R(rows, null)).toBe('111111111110');
    expect(R(rows, JOB2)).toBe('111111111110');
  });
  test('4. the job role replaces the company role on that job — up', () => {
    expect(R([{ role_id: 'ro', project_id: null }, { role_id: 'pm', project_id: JOB }], JOB)).toBe('333333333320');
  });
  test('4. … and down: No access on one job, PM everywhere else', () => {
    const rows = [{ role_id: 'pm', project_id: null }, { role_id: null, project_id: JOB, permissions: NO_ACCESS_LEVELS }];
    expect(R(rows, JOB)).toBe('000000000001');
    expect(R(rows, JOB2)).toBe('333333333321');
  });
  test('4. per-category levels lay on the job role, or on the company role when there is none', () => {
    expect(R([{ role_id: 'fm', project_id: null }, { role_id: 'ro', project_id: JOB, permissions: { Budget: 'Full', Sales: 'None' } }], JOB)).toBe('131111111100');
    expect(R([{ role_id: 'fm', project_id: null }, { role_id: null, project_id: JOB, permissions: { Budget: 'Edit', RFIs: 'bogus' } }], JOB)).toBe('222220100100');
  });
  test('4. two rows on one job: highest wins; a role from nowhere grants nothing', () => {
    expect(R([{ role_id: 'fm', project_id: JOB }, { role_id: 'ro', project_id: JOB }], JOB)).toBe('212221111110');
    expect(R([{ role_id: 'gone', project_id: JOB }], JOB)).toBe('000000000000');
  });
  test('4. Sales inherits Projects on a job role stored before Sales existed', () => {
    expect(R([{ role_id: 'old', project_id: JOB }], JOB)).toBe('210000000020');
  });
  test('5. Admin is company-wide: a job role never raises or lowers it', () => {
    expect(R([{ role_id: null, project_id: JOB, permissions: { Admin: 'Full' } }], JOB)).toBe('111111111110');
    expect(R([{ role_id: 'pm', project_id: JOB }], JOB).slice(-1)).toBe('0');
  });
  test('6. a company admin only gains on a job', () => {
    expect(R([{ role_id: 'adm', project_id: null }, { role_id: null, project_id: JOB, permissions: NO_ACCESS_LEVELS }], JOB)).toBe('333333333333');
  });
});

describe('which job a request is about', () => {
  test('URL, record, query, body', () => {
    expect(projectIdFromPath(`/api/projects/${JOB}/rfis`)).toBe(JOB);
    expect(projectIdFromPath('/api/projects/all/resource-planning')).toBeNull();
    expect(projectIdFromQuery(new URLSearchParams(`projectId=${JOB}`))).toBe(JOB);
    expect(projectIdFromQuery(new URLSearchParams('project_id=nope'))).toBeNull();
    expect(recordRefFromPath(`/api/rfis/${RFI_JOB}/answer`)).toEqual({ table: 'rfis', id: RFI_JOB });
    expect(recordRefFromPath(`/api/safety/incidents/${RFI_JOB}`)).toEqual({ table: 'safety_incidents', id: RFI_JOB });
    expect(recordRefFromPath('/api/rfis/create')).toBeNull();
    expect(projectIdFromBody({ project_id: JOB })).toBe(JOB);
    expect(projectIdFromBody([JOB])).toBeNull();
  });
  test('job row labels', () => {
    const names = new Map([['pm', 'Project Manager']]);
    expect(describeJobRow(null, names).mode).toBe('company');
    expect(describeJobRow({ role_id: 'pm', permissions: null }, names).label).toBe('Project Manager');
    expect(describeJobRow({ role_id: null, permissions: NO_ACCESS_LEVELS }, names).label).toBe('No access');
    expect(describeJobRow({ role_id: null, permissions: { Budget: 'Edit' } }, names).mode).toBe('custom');
  });
});

describe('the guard applies the job role', () => {
  beforeEach(() => {
    fake.reset();
    const { T } = fake;
    T('projects').push({ id: JOB, tenant_id: A, name: 'Copper Ridge' }, { id: JOB2, tenant_id: A, name: 'Pima County' }, { id: JOB_B, tenant_id: B, name: 'Other Co' });
    T('profiles').push(
      { id: ADMIN.id, tenant_id: A, role: 'admin', full_name: 'Ada Admin', email: ADMIN.email },
      { id: VIEWER.id, tenant_id: A, role: 'member', full_name: 'Val Viewer', email: VIEWER.email },
      { id: PM.id, tenant_id: A, role: 'member', full_name: 'Pat Manager', email: PM.email },
      { id: OTHER.id, tenant_id: B, role: 'admin', full_name: 'Other Admin', email: OTHER.email },
    );
    T('role_definitions').push(
      { id: 'ro', tenant_id: A, name: 'Read-Only', permissions: ROLES.ro },
      { id: 'pm', tenant_id: A, name: 'Project Manager', permissions: ROLES.pm },
    );
    T('user_role_assignments').push(
      { id: 'g1', tenant_id: A, user_id: VIEWER.id, role_id: 'ro', project_id: null, permissions: null },
      { id: 'j1', tenant_id: A, user_id: VIEWER.id, role_id: 'pm', project_id: JOB, permissions: null },
      { id: 'g2', tenant_id: A, user_id: PM.id, role_id: 'pm', project_id: null, permissions: null },
      { id: 'j2', tenant_id: A, user_id: PM.id, role_id: null, project_id: JOB2, permissions: NO_ACCESS_LEVELS },
    );
    T('rfis').push(
      { id: RFI_JOB, tenant_id: A, project_id: JOB, subject: 'Door closer' },
      { id: RFI_JOB2, tenant_id: A, project_id: JOB2, subject: 'Frame' },
    );
  });

  test('read-only company, PM on one job: can edit there (URL, body), not elsewhere', async () => {
    currentUser = VIEWER;
    expect((await requirePermission(req(`/api/projects/${JOB}/rfis`, 'POST', {}), 'RFIs', 'Edit')).ok).toBe(true);
    expect((await requirePermission(req('/api/rfis/create', 'POST', { project_id: JOB, subject: 'x' }), 'RFIs', 'Edit')).ok).toBe(true);
    const other = await requirePermission(req('/api/rfis/create', 'POST', { project_id: JOB2 }), 'RFIs', 'Edit');
    expect(other.ok).toBe(false);
    if (!other.ok) expect(other.res.status).toBe(403);
    expect((await requirePermission(req('/api/rfis/create', 'POST', { subject: 'no job' }), 'RFIs', 'Edit')).ok).toBe(false);
  });

  test("a record's job beats a ?projectId= claim", async () => {
    currentUser = VIEWER;
    expect((await requirePermission(req(`/api/rfis/${RFI_JOB}`, 'PATCH', {}), 'RFIs', 'Edit')).ok).toBe(true);
    expect((await requirePermission(req(`/api/rfis/${RFI_JOB2}?projectId=${JOB}`, 'PATCH', {}), 'RFIs', 'Edit')).ok).toBe(false);
  });

  test('PM company-wide with No access on one job: shut out of it, and it leaves their list', async () => {
    currentUser = PM;
    const g = await requirePermission(req(`/api/projects/${JOB2}/daily-logs`), 'Projects', 'View');
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.res.status).toBe(403);
    expect((await requirePermission(req(`/api/projects/${JOB}/daily-logs`), 'Projects', 'View')).ok).toBe(true);
    expect(Array.from(await jobsClosedTo(fake.db as never, PM.id, A))).toEqual([JOB2]);
    expect((await jobsClosedTo(fake.db as never, ADMIN.id, A)).size).toBe(0);
  });

  test("an explicit null stays company-wide; another company's job is a 404", async () => {
    currentUser = VIEWER;
    expect((await requirePermission(req(`/api/projects/${JOB}/x`), 'RFIs', 'Edit', { projectId: null })).ok).toBe(false);
    const foreign = await requirePermission(req(`/api/projects/${JOB_B}/x`), 'Projects', 'View');
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.res.status).toBe(404);
  });

  test('job access screen: read it, set a role, set no access, clear it', async () => {
    currentUser = ADMIN;
    const r1 = await getAccess(req(`/api/projects/${JOB}/access`), pp(JOB));
    expect(r1.status).toBe(200);
    const j1 = await r1.json() as { canManage: boolean; people: { userId: string; job: { mode: string; label: string }; effective: Record<string, string> }[] };
    expect(j1.canManage).toBe(true);
    const v = j1.people.find((p) => p.userId === VIEWER.id)!;
    expect(v.job).toMatchObject({ mode: 'role', label: 'Project Manager' });
    expect(v.effective.RFIs).toBe('Full');

    expect((await putAccess(req(`/api/projects/${JOB}/access`, 'PUT', { userId: VIEWER.id, access: 'none' }), pp(JOB))).status).toBe(200);
    expect(fake.T('user_role_assignments').filter((a) => a.user_id === VIEWER.id && a.project_id === JOB)).toHaveLength(1);
    currentUser = VIEWER;
    expect((await requirePermission(req(`/api/projects/${JOB}/x`), 'Projects', 'View')).ok).toBe(false);

    currentUser = ADMIN;
    expect((await putAccess(req(`/api/projects/${JOB}/access`, 'PUT', { userId: VIEWER.id, access: 'company' }), pp(JOB))).status).toBe(200);
    expect(fake.T('user_role_assignments').filter((a) => a.user_id === VIEWER.id && a.project_id === JOB)).toHaveLength(0);
    currentUser = VIEWER;
    const back = await requirePermission(req(`/api/projects/${JOB}/x`), 'RFIs', 'Edit');
    expect(back.ok).toBe(false); // company Read-Only again
    expect((await requirePermission(req(`/api/projects/${JOB}/x`), 'RFIs', 'View')).ok).toBe(true);
  });

  test('only a company admin changes job access; admins cannot be limited; tenants stay apart', async () => {
    currentUser = VIEWER; // PM on JOB, but Admin is company-wide (None)
    expect((await putAccess(req(`/api/projects/${JOB}/access`, 'PUT', { userId: PM.id, access: 'none' }), pp(JOB))).status).toBe(403);
    currentUser = ADMIN;
    expect((await putAccess(req(`/api/projects/${JOB}/access`, 'PUT', { userId: ADMIN.id, access: 'none' }), pp(JOB))).status).toBe(400);
    expect((await putAccess(req(`/api/projects/${JOB}/access`, 'PUT', { userId: OTHER.id, access: 'none' }), pp(JOB))).status).toBe(404);
    currentUser = OTHER;
    expect((await getAccess(req(`/api/projects/${JOB}/access`), pp(JOB))).status).toBe(404);
  });
});
