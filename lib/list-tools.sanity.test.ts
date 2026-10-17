/**
 * @jest-environment node
 *
 * List tools through the REAL route handlers (in-memory database, real
 * permission resolution — lib/permissions is not mocked):
 *   - saved views: save, share with the company, load as a teammate; only the
 *     owner may change a view; a read-only seat may not share;
 *   - bulk edit runs one request per row through the record's own route, with
 *     that route's stamps (closed_at, completed_at, approved_at) and its
 *     transition rules (pay apps through lib/pay-app-status);
 *   - a role without edit rights is refused by the server on every row and
 *     nothing changes.
 */
import { makeFakeDb } from './__fixtures__/fake-db';
import { describe, test, expect, beforeEach } from '@jest/globals';
declare const jest: { mock: (m: string, f: () => unknown) => void };

const fake = makeFakeDb();
const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const OWNER = { id: 'aaaaaaaa-0000-4000-8000-00000000ad01', tenantId: A, email: 'owner@a.test' };
const VIEWER = { id: 'aaaaaaaa-0000-4000-8000-00000000ad02', tenantId: A, email: 'viewer@a.test' };
let current = OWNER;
const fired: string[] = [];

jest.mock('@/lib/supabase-server', () => ({ createServerClient: () => fake.db, getUser: async () => current, supabaseAdmin: {} }));
jest.mock('@/lib/triggers', () => ({
  onPayAppSubmitted: async (id: string) => { fired.push(`submitted:${id}`); },
  onPayAppApproved: async (id: string) => { fired.push(`approved:${id}`); },
  onPayAppCertified: async (id: string) => { fired.push(`certified:${id}`); },
}));
jest.mock('@/lib/background', () => ({ runInBackground: (p: Promise<unknown>) => { void p; } }));
jest.mock('@/lib/storage-signing', () => ({ signStoredUrl: async () => null, signFields: async (r: unknown[]) => r }));

import { NextRequest } from 'next/server';
import { GET as listViews, POST as saveView, PATCH as patchView } from '@/app/api/saved-views/route';
import { PATCH as patchItem } from '@/app/api/items/[tool]/[id]/route';
import { POST as approvePayApp } from '@/app/api/pay-apps/[id]/approve/route';
import { runBulk } from './list-view';

const JOB = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const R1 = 'aaaaaaaa-0000-4000-8000-0000000000c1';
const R2 = 'aaaaaaaa-0000-4000-8000-0000000000c2';
const P1 = 'aaaaaaaa-0000-4000-8000-0000000000d1';
const PA1 = 'aaaaaaaa-0000-4000-8000-0000000000b1';
const PA2 = 'aaaaaaaa-0000-4000-8000-0000000000b2';

const req = (url: string, method = 'POST', body?: unknown) =>
  new NextRequest(`https://saguarocontrol.net${url}`, body === undefined ? { method } : { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const json = async (r: Response) => (await r.json()) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const rowOf = (t: string, id: string) => fake.T(t).find((r) => r.id === id)!;

beforeEach(() => {
  fake.reset();
  fired.length = 0;
  current = OWNER;
  fake.T('profiles').push({ id: OWNER.id, role: 'owner' }, { id: VIEWER.id, role: 'member' });
  fake.T('projects').push({ id: JOB, tenant_id: A, name: 'Copper Ridge Clinic' });
  fake.T('rfis').push(
    { id: R1, tenant_id: A, project_id: JOB, rfi_number: 1, subject: 'Footing depth', status: 'open', closed_at: null, deleted_at: null },
    { id: R2, tenant_id: A, project_id: JOB, rfi_number: 2, subject: 'Door hardware', status: 'open', closed_at: null, deleted_at: null },
  );
  fake.T('punch_list').push({ id: P1, tenant_id: A, project_id: JOB, title: 'Touch-up paint', status: 'open', completed_at: null, deleted_at: null });
  for (const id of [PA1, PA2]) {
    fake.T('pay_applications').push({ id, tenant_id: A, project_id: JOB, app_number: id === PA1 ? 1 : 2, status: 'submitted', deleted_at: null, approved_at: null, current_payment_due: 1000 });
  }
});

describe('saved views', () => {
  const MODULE = '/app/projects/:id/rfis|number,subject,status';
  test('save, share with the company, and load as a teammate', async () => {
    const created = await saveView(req('/api/saved-views', 'POST', {
      name: 'Open by due date', module: MODULE, is_shared: true,
      columns: ['number', 'subject', 'status'], column_widths: { subject: 320 },
      sort_by: 'due', sort_direction: 'asc', filters: { values: { status: ['open'] }, groupBy: null, order: ['number', 'subject', 'status'] },
    }));
    expect(created.status).toBe(201);
    const view = (await json(created)).view;
    expect(view).toMatchObject({ is_shared: true, mine: true, column_widths: { subject: 320 } });
    expect(rowOf('saved_views', view.id).tenant_id).toBe(A);

    // A private view of the owner's stays private.
    await saveView(req('/api/saved-views', 'POST', { name: 'Mine only', module: MODULE }));

    current = VIEWER;
    const listed = await json(await listViews(req(`/api/saved-views?module=${encodeURIComponent(MODULE)}&project_id=${JOB}`, 'GET')));
    expect(listed.views.map((v: { name: string }) => v.name)).toEqual(['Open by due date']);
    expect(listed.views[0]).toMatchObject({ mine: false, filters: { values: { status: ['open'] } } });
    expect(listed.views[0].user_id).toBeUndefined();
    expect(listed.canShare).toBe(false);
  });

  test('only the owner may change a view; a read-only seat may not share one', async () => {
    const view = (await json(await saveView(req('/api/saved-views', 'POST', { name: 'Team view', module: 'm', is_shared: true })))).view;
    current = VIEWER;
    const edit = await patchView(req(`/api/saved-views?id=${view.id}`, 'PATCH', { name: 'Hijacked' }));
    expect(edit.status).toBe(403);
    expect(rowOf('saved_views', view.id).name).toBe('Team view');
    const share = await saveView(req('/api/saved-views', 'POST', { name: 'Push to all', module: 'm', is_shared: true }));
    expect(share.status).toBe(403);
    const own = await saveView(req('/api/saved-views', 'POST', { name: 'Just mine', module: 'm' }));
    expect(own.status).toBe(201);
  });

  test('default view: setting one clears the previous default', async () => {
    const a = (await json(await saveView(req('/api/saved-views', 'POST', { name: 'A', module: 'm', is_default: true })))).view;
    const b = (await json(await saveView(req('/api/saved-views', 'POST', { name: 'B', module: 'm' })))).view;
    const r = await patchView(req(`/api/saved-views?id=${b.id}`, 'PATCH', { is_default: true }));
    expect(r.status).toBe(200);
    expect(rowOf('saved_views', a.id).is_default).toBe(false);
    expect(rowOf('saved_views', b.id).is_default).toBe(true);
  });
});

describe('bulk edit through the record routes', () => {
  const itemCall = (tool: string, body: unknown) => (id: string) =>
    patchItem(req(`/api/items/${tool}/${id}`, 'PATCH', body), { params: Promise.resolve({ tool, id }) });

  test('RFIs: bulk close runs the item route per row and stamps closed_at', async () => {
    const o = await runBulk([R1, R2], itemCall('rfis', { status: 'closed' }));
    expect(o).toMatchObject({ done: 2, failed: 0 });
    expect(rowOf('rfis', R1)).toMatchObject({ status: 'closed' });
    expect(rowOf('rfis', R1).closed_at).toBeTruthy();
    expect(rowOf('rfis', R2).closed_at).toBeTruthy();
  });

  test('RFIs: bulk ball-in-court and due date', async () => {
    const o = await runBulk([R1, R2], itemCall('rfis', { ball_in_court: 'Architect', assigned_to_name: 'Architect' }));
    expect(o.done).toBe(2);
    expect(rowOf('rfis', R2)).toMatchObject({ ball_in_court: 'Architect', assigned_to_name: 'Architect' });
    await runBulk([R1], itemCall('rfis', { due_date: '2026-11-02' }));
    expect(rowOf('rfis', R1).due_date).toBe('2026-11-02');
  });

  test('punch list: completed stamps completed_at', async () => {
    const o = await runBulk([P1], itemCall('punch_list', { status: 'completed' }));
    expect(o.done).toBe(1);
    expect(rowOf('punch_list', P1).completed_at).toBeTruthy();
  });

  test('pay apps: bulk approve goes through lib/pay-app-status (approved_at, cascade fired once each)', async () => {
    const o = await runBulk([PA1, PA2], (id) => approvePayApp(req(`/api/pay-apps/${id}/approve`, 'POST', { projectId: JOB }), { params: Promise.resolve({ id }) }));
    expect(o).toMatchObject({ done: 2, failed: 0 });
    expect(rowOf('pay_applications', PA1)).toMatchObject({ status: 'approved' });
    expect(rowOf('pay_applications', PA2).approved_at).toBeTruthy();
    expect(fired.sort()).toEqual([`approved:${PA1}`, `approved:${PA2}`].sort());
  });

  test('a role without edit rights: every row refused by the server, nothing changes', async () => {
    current = VIEWER;
    const rfi = await runBulk([R1, R2], itemCall('rfis', { status: 'closed' }));
    expect(rfi).toMatchObject({ done: 0, failed: 2, refused: true });
    expect(rfi.firstError).toMatch(/permission|access|admin/i);
    expect(rowOf('rfis', R1)).toMatchObject({ status: 'open', closed_at: null });

    const pa = await runBulk([PA1], (id) => approvePayApp(req(`/api/pay-apps/${id}/approve`, 'POST', {}), { params: Promise.resolve({ id }) }));
    expect(pa).toMatchObject({ done: 0, refused: true });
    expect(rowOf('pay_applications', PA1)).toMatchObject({ status: 'submitted', approved_at: null });
    expect(fired).toEqual([]);
  });
});
