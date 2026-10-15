/**
 * @jest-environment node
 *
 * Drawings through the real routes: a second upload of a sheet number files
 * as the next revision and supersedes the old one; pins link to real items on
 * the same job and come back with the item's name and page link; a pin can't
 * point at another job's item or at something the person can't see; removing
 * a sheet keeps it on record; the item page lists the sheets it's pinned on;
 * and item search never shows subcontracts to someone without Budget access.
 */
import { makeFakeDb } from './__fixtures__/fake-db';
import { describe, test, expect, beforeEach } from '@jest/globals';
declare const jest: { mock: (m: string, f: () => unknown) => void };

const fake = makeFakeDb();
let currentUser: { id: string; tenantId: string; email: string } | null = null;
jest.mock('@/lib/supabase-server', () => ({ createServerClient: () => fake.db, getUser: async () => currentUser, supabaseAdmin: {} }));
jest.mock('@/lib/storage-signing', () => ({
  signStoredUrl: async (_b: string, p: string) => `signed:${p}`,
  signFields: async (rows: Record<string, unknown>[], keys: string[]) => rows.map((r) => ({ ...r, ...Object.fromEntries(keys.filter((k) => r[k]).map((k) => [k, `signed:${r[k]}`])) })),
}));

import { NextRequest } from 'next/server';
import { POST as upload } from '@/app/api/drawings/upload/route';
import { DELETE as delDrawing } from '@/app/api/drawings/[id]/route';
import { GET as listDrawings } from '@/app/api/drawings/list/route';
import { GET as getSheet } from '@/app/api/drawings/[id]/sheet/route';
import { POST as addPin, DELETE as delPin } from '@/app/api/drawings/[id]/pins/route';
import { GET as getItem } from '@/app/api/items/[tool]/[id]/route';
import { GET as search } from '@/app/api/items/search/route';
import { nextRevision, sheetKey } from '@/lib/drawing-revisions';

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';
const JOB = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const JOB2 = 'aaaaaaaa-0000-4000-8000-0000000000a2';
const D1 = 'aaaaaaaa-0000-4000-8000-0000000000d1';
const RFI = 'aaaaaaaa-0000-4000-8000-0000000000f1';
const RFI_JOB2 = 'aaaaaaaa-0000-4000-8000-0000000000f2';
const PUNCH = 'aaaaaaaa-0000-4000-8000-0000000000f3';
const SC = 'aaaaaaaa-0000-4000-8000-0000000000c1';
const ADMIN = { id: 'aaaaaaaa-0000-4000-8000-00000000ad01', tenantId: A, email: 'admin@a.test' };
const FOREMAN = { id: 'aaaaaaaa-0000-4000-8000-00000000f001', tenantId: A, email: 'foreman@a.test' };

const req = (url: string, method = 'GET', body?: unknown) =>
  new NextRequest(`https://saguarocontrol.net${url}`, body === undefined ? { method } : { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const formReq = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return new NextRequest('https://saguarocontrol.net/api/drawings/upload', { method: 'POST', body: fd });
};
const idp = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  fake.reset();
  const { T } = fake;
  T('projects').push({ id: JOB, tenant_id: A, name: 'Copper Ridge' }, { id: JOB2, tenant_id: A, name: 'Pima County' }, { id: 'jb', tenant_id: B, name: 'Other Co' });
  T('profiles').push({ id: ADMIN.id, tenant_id: A, role: 'admin' }, { id: FOREMAN.id, tenant_id: A, role: 'Foreman' });
  T('role_definitions').push({ id: 'fm', tenant_id: A, name: 'Foreman', permissions: { Projects: 'Edit', RFIs: 'Edit', Documents: 'Edit', Budget: 'None' } });
  T('user_role_assignments').push({ id: 'u1', tenant_id: A, user_id: FOREMAN.id, role_id: 'fm', project_id: null });
  T('drawings').push({ id: D1, tenant_id: A, project_id: JOB, name: 'Power Plan', sheet_number: 'E-101', discipline: 'Electrical', version: '1.0', status: 'current', url: 'project-files/e101-r1.pdf', deleted_at: null, created_at: '2026-10-01T00:00:00Z' });
  T('rfis').push(
    { id: RFI, tenant_id: A, project_id: JOB, rfi_number: 'RFI-007', subject: 'Panel LP-2 location', status: 'open', deleted_at: null, created_at: '2026-10-02' },
    { id: RFI_JOB2, tenant_id: A, project_id: JOB2, rfi_number: 'RFI-001', subject: 'Other job', status: 'open', deleted_at: null, created_at: '2026-10-02' },
  );
  T('punch_list').push({ id: PUNCH, tenant_id: A, project_id: JOB, title: 'Missing cover plate', status: 'open', deleted_at: null, created_at: '2026-10-03' });
  T('contracts').push({ id: SC, tenant_id: A, project_id: JOB, contract_type: 'subcontract', contract_number: 'SC-001', party_name: 'Panel Electric', status: 'executed', amount: 1000, created_at: '2026-10-01' });
  currentUser = ADMIN;
});

describe('revision numbering', () => {
  test('numbers count up, letters step, sheet numbers match loosely', () => {
    expect(nextRevision([])).toBe('1');
    expect(nextRevision(['1.0'])).toBe('2');
    expect(nextRevision(['1', '3', 'Rev 2'])).toBe('4');
    expect(nextRevision(['A', 'B'])).toBe('C');
    expect(sheetKey('a 101')).toBe(sheetKey('A-101'));
  });
});

describe('drawing revisions', () => {
  test('uploading the same sheet number files Rev 2 and supersedes Rev 1', async () => {
    const r = await upload(formReq({ projectId: JOB, sheet_number: 'e101', title: 'Power Plan' }));
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.drawing.version).toBe('2');
    expect(j.drawing.status).toBe('current');
    expect(j.superseded).toBe(1);
    expect(fake.T('drawings').find((d) => d.id === D1)!.status).toBe('superseded');
    const sheet = await (await getSheet(req(`/api/drawings/${j.drawing.id}/sheet`), idp(j.drawing.id))).json();
    expect(sheet.revisions.map((x: { version: string; status: string }) => [x.version, x.status])).toEqual([['2', 'current'], ['1.0', 'superseded']]);
  });

  test("a new sheet number starts at Rev 1 and leaves other sheets alone; another company's job is refused", async () => {
    const j = await (await upload(formReq({ projectId: JOB, sheet_number: 'A-201', title: 'Floor Plan' }))).json();
    expect(j.drawing.version).toBe('1');
    expect(fake.T('drawings').find((d) => d.id === D1)!.status).toBe('current');
    expect((await upload(formReq({ projectId: 'jb', sheet_number: 'E-101' }))).status).toBe(404);
  });

  test('removing a sheet keeps it on record but takes it off the register', async () => {
    expect((await delDrawing(req(`/api/drawings/${D1}`, 'DELETE'), idp(D1))).status).toBe(200);
    expect(fake.T('drawings').find((d) => d.id === D1)!.deleted_at).toBeTruthy();
    const list = await (await listDrawings(req(`/api/drawings/list?projectId=${JOB}`))).json();
    expect(list.drawings).toHaveLength(0);
    expect((await getSheet(req(`/api/drawings/${D1}/sheet`), idp(D1))).status).toBe(404);
  });
});

describe('drawing pins', () => {
  test('pin an RFI and a punch item; the sheet shows names and page links; the item lists the sheet', async () => {
    const p1 = await addPin(req(`/api/drawings/${D1}/pins`, 'POST', { x_pct: 0.25, y_pct: 0.4, entity_type: 'rfis', entity_id: RFI }), idp(D1));
    expect(p1.status).toBe(200);
    expect((await p1.json()).pin).toMatchObject({ entity_type: 'rfi', rfi_id: RFI, x_pct: 0.25, y_pct: 0.4, project_id: JOB });
    expect((await addPin(req(`/api/drawings/${D1}/pins`, 'POST', { x_pct: 1.7, y_pct: -2, entity_type: 'punch_list', entity_id: PUNCH }), idp(D1))).status).toBe(200);
    expect((await addPin(req(`/api/drawings/${D1}/pins`, 'POST', { x_pct: 0.5, y_pct: 0.5, title: 'Field-verify beam pocket' }), idp(D1))).status).toBe(200);
    const sheet = await (await getSheet(req(`/api/drawings/${D1}/sheet`), idp(D1))).json();
    expect(sheet.drawing.url).toBe('signed:project-files/e101-r1.pdf');
    expect(sheet.pins).toHaveLength(3);
    expect(sheet.pins[0].item).toMatchObject({ type: 'rfis', name: 'RFI-007 · Panel LP-2 location', href: `/app/projects/${JOB}/items/rfis/${RFI}` });
    expect(sheet.pins[1]).toMatchObject({ x: 1, y: 0 }); // kept on the sheet
    expect(sheet.pins[1].item.type).toBe('punch_list');
    expect(sheet.pins[2]).toMatchObject({ title: 'Field-verify beam pocket', item: null });
    const item = await (await getItem(req(`/api/items/rfis/${RFI}`), { params: Promise.resolve({ tool: 'rfis', id: RFI }) })).json();
    expect(item.drawings).toEqual([expect.objectContaining({ sheet: 'E-101', pins: 1, href: `/app/projects/${JOB}/drawings/${D1}` })]);
  });

  test("a pin can't point at another job's item, nothing at all, or something the person can't see", async () => {
    expect((await addPin(req(`/api/drawings/${D1}/pins`, 'POST', { x_pct: 0.1, y_pct: 0.1, entity_type: 'rfis', entity_id: RFI_JOB2 }), idp(D1))).status).toBe(404);
    expect((await addPin(req(`/api/drawings/${D1}/pins`, 'POST', { x_pct: 0.1, y_pct: 0.1 }), idp(D1))).status).toBe(400);
    currentUser = FOREMAN;
    expect((await addPin(req(`/api/drawings/${D1}/pins`, 'POST', { x_pct: 0.1, y_pct: 0.1, entity_type: 'contracts', entity_id: SC }), idp(D1))).status).toBe(404);
    expect((await addPin(req(`/api/drawings/${D1}/pins`, 'POST', { x_pct: 0.1, y_pct: 0.1, entity_type: 'rfis', entity_id: RFI }), idp(D1))).status).toBe(200);
  });

  test("a pin to a subcontract stays hidden from someone without Budget access; pins can be removed", async () => {
    await addPin(req(`/api/drawings/${D1}/pins`, 'POST', { x_pct: 0.3, y_pct: 0.3, entity_type: 'contracts', entity_id: SC }), idp(D1));
    expect((await (await getSheet(req(`/api/drawings/${D1}/sheet`), idp(D1))).json()).pins).toHaveLength(1);
    currentUser = FOREMAN;
    const sheet = await (await getSheet(req(`/api/drawings/${D1}/sheet`), idp(D1))).json();
    expect(sheet.pins).toHaveLength(0);
    currentUser = ADMIN;
    const pinId = fake.T('drawing_pins')[0].id;
    expect((await delPin(req(`/api/drawings/${D1}/pins?pinId=${pinId}`, 'DELETE'), idp(D1))).status).toBe(200);
    expect(fake.T('drawing_pins')).toHaveLength(0);
  });

  test("another company can't open the sheet", async () => {
    currentUser = { id: 'x', tenantId: B, email: 'b@b.test' };
    expect((await getSheet(req(`/api/drawings/${D1}/sheet`), idp(D1))).status).toBe(404);
  });
});

describe('item search respects tool access', () => {
  test('a foreman without Budget access never sees subcontracts in search', async () => {
    const all = await (await search(req(`/api/items/search?projectId=${JOB}&q=`))).json();
    expect(all.items.some((i: { type: string }) => i.type === 'contracts')).toBe(true);
    currentUser = FOREMAN;
    const fm = await (await search(req(`/api/items/search?projectId=${JOB}&q=`))).json();
    expect(fm.items.some((i: { type: string }) => i.type === 'contracts')).toBe(false);
    expect(fm.items.some((i: { type: string }) => i.type === 'rfis')).toBe(true);
  });
});

import { GET as listMarkups, POST as addMarkup } from '@/app/api/projects/[projectId]/drawings/markups/route';
import { PATCH as patchMarkup, DELETE as delMarkup } from '@/app/api/projects/[projectId]/drawings/markups/[id]/route';

describe('drawing markups', () => {
  const mp = { params: Promise.resolve({ projectId: JOB }) };
  const mip = (id: string) => ({ params: Promise.resolve({ projectId: JOB, id }) });
  const geo = { space: 'image', w: 1000, h: 700, style: { color: 'rgb(239,68,68)', width: 4 }, geometry: [[10, 10], [200, 120]] };

  test('a private markup is seen and changed only by the person who drew it until published', async () => {
    const r = await addMarkup(req(`/api/projects/${JOB}/drawings/markups`, 'POST', { drawing_id: D1, markup_type: 'cloud', data: { ...geo, private: true } }), mp);
    expect(r.status).toBe(200);
    const id = (await r.json()).markup.id;
    await addMarkup(req(`/api/projects/${JOB}/drawings/markups`, 'POST', { drawing_id: D1, markup_type: 'rect', data: geo }), mp);
    expect((await (await listMarkups(req(`/api/projects/${JOB}/drawings/markups?drawing_id=${D1}`), mp)).json()).markups).toHaveLength(2);
    currentUser = FOREMAN;
    expect((await (await listMarkups(req(`/api/projects/${JOB}/drawings/markups?drawing_id=${D1}`), mp)).json()).markups).toHaveLength(1);
    expect((await patchMarkup(req(`/x`, 'PATCH', { data: { ...geo, private: false } }), mip(id))).status).toBe(404);
    expect((await delMarkup(req(`/x`, 'DELETE'), mip(id))).status).toBe(404);
    currentUser = ADMIN;
    expect((await patchMarkup(req(`/x`, 'PATCH', { data: { ...geo, private: false } }), mip(id))).status).toBe(200);
    currentUser = FOREMAN;
    expect((await (await listMarkups(req(`/api/projects/${JOB}/drawings/markups?drawing_id=${D1}`), mp)).json()).markups).toHaveLength(2);
  });

  test('comments: anyone on the job can comment on a published markup, nobody on a private one they cannot see', async () => {
    const pub = (await (await addMarkup(req(`/x`, 'POST', { drawing_id: D1, markup_type: 'rect', data: geo }), mp)).json()).markup.id;
    const priv = (await (await addMarkup(req(`/x`, 'POST', { drawing_id: D1, markup_type: 'rect', data: { ...geo, private: true } }), mp)).json()).markup.id;
    currentUser = FOREMAN;
    const { POST: comment } = await import('@/app/api/projects/[projectId]/drawings/markups/[id]/route');
    const ok = await comment(req(`/x`, 'POST', { content: 'Confirmed in field' }), mip(pub));
    expect(ok.status).toBe(200);
    expect((await ok.json()).comment.content).toBe('Confirmed in field');
    expect((await comment(req(`/x`, 'POST', { content: 'peek' }), mip(priv))).status).toBe(404);
    const list = await (await listMarkups(req(`/x?drawing_id=${D1}`), mp)).json();
    expect(list.markups.find((m: { id: string }) => m.id === pub).comments).toHaveLength(1);
  });

  test("someone else's published markup can't be edited without full Documents access", async () => {
    const id = (await (await addMarkup(req(`/api/projects/${JOB}/drawings/markups`, 'POST', { drawing_id: D1, markup_type: 'rect', data: geo }), mp)).json()).markup.id;
    currentUser = FOREMAN;
    expect((await patchMarkup(req(`/x`, 'PATCH', { color: 'red' }), mip(id))).status).toBe(403);
  });

  test('a sheet link must point at a sheet on the same job', async () => {
    const D2 = 'aaaaaaaa-0000-4000-8000-0000000000d2';
    fake.T('drawings').push({ id: D2, tenant_id: A, project_id: JOB, name: 'Details', sheet_number: 'A-501', status: 'current', deleted_at: null });
    fake.T('drawings').push({ id: 'dx', tenant_id: A, project_id: JOB2, name: 'Other job', sheet_number: 'A-1', status: 'current', deleted_at: null });
    const ok = await addMarkup(req(`/x`, 'POST', { drawing_id: D1, markup_type: 'link', data: { ...geo, text: 'A-501' }, entity_type: 'drawings', entity_id: D2 }), mp);
    expect(ok.status).toBe(200);
    expect((await ok.json()).markup).toMatchObject({ entity_type: 'drawings', entity_id: D2 });
    expect((await addMarkup(req(`/x`, 'POST', { drawing_id: D1, markup_type: 'link', data: geo, entity_type: 'drawings', entity_id: 'dx' }), mp)).status).toBe(404);
    expect((await addMarkup(req(`/x`, 'POST', { drawing_id: D1, markup_type: 'link', data: geo }), mp)).status).toBe(400);
  });
});
