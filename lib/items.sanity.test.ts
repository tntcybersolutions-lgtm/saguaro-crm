/**
 * @jest-environment node
 *
 * Item pages, end to end through the real route handlers: read an item, edit it,
 * comment on it, link it to another item, search for items to link — with the
 * real permission check (lib/permissions) deciding who may do what, and tenant
 * isolation proven by trying another company's item. Only the database,
 * file signing and the session are faked.
 */
import { makeFakeDb } from './__fixtures__/fake-db';
import { describe, test, expect, beforeEach } from '@jest/globals';
// `jest` stays the global so the SWC transform hoists jest.mock above the imports.
declare const jest: { mock: (m: string, f: () => unknown) => void };

const fake = makeFakeDb();
let currentUser: { id: string; tenantId: string; email: string } | null = null;

jest.mock('@/lib/supabase-server', () => ({
  createServerClient: () => fake.db,
  getUser: async () => currentUser,
  supabaseAdmin: {},
}));
jest.mock('@/lib/storage-signing', () => ({ signStoredUrl: async (_b: string, p: string) => `signed:${p}`, signFields: async (rows: Record<string, unknown>[]) => rows }));

import { NextRequest } from 'next/server';
import { GET as getItem, PATCH as patchItem } from '@/app/api/items/[tool]/[id]/route';
import { GET as listComments, POST as addComment, DELETE as delComment } from '@/app/api/items/[tool]/[id]/comments/route';
import { GET as listLinks, POST as addLink, DELETE as delLink } from '@/app/api/related-items/route';
import { GET as searchRelated } from '@/app/api/related-items/search/route';
import { GET as search } from '@/app/api/items/search/route';

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';
const JOB = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const JOB2 = 'aaaaaaaa-0000-4000-8000-0000000000a2';
const JOB_B = 'bbbbbbbb-0000-4000-8000-0000000000b1';
const RFI = 'aaaaaaaa-0000-4000-8000-0000000000f1';
const SUB = 'aaaaaaaa-0000-4000-8000-0000000000f2';
const PUNCH = 'aaaaaaaa-0000-4000-8000-0000000000f3';
const RFI_JOB2 = 'aaaaaaaa-0000-4000-8000-0000000000f4';
const RFI_B = 'bbbbbbbb-0000-4000-8000-0000000000f9';
const ADMIN = { id: 'aaaaaaaa-0000-4000-8000-00000000ad01', tenantId: A, email: 'admin@a.test' };
const FOREMAN = { id: 'aaaaaaaa-0000-4000-8000-00000000f001', tenantId: A, email: 'foreman@a.test' };
const SALES = { id: 'aaaaaaaa-0000-4000-8000-00000000c001', tenantId: A, email: 'sales@a.test' };
const OTHER = { id: 'bbbbbbbb-0000-4000-8000-00000000ad01', tenantId: B, email: 'admin@b.test' };

const req = (url: string, method = 'GET', body?: unknown) =>
  new NextRequest(`https://saguarocontrol.net${url}`, body === undefined ? { method } : { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const p = (tool: string, id: string) => ({ params: Promise.resolve({ tool, id }) });

beforeEach(() => {
  fake.reset();
  const { T } = fake;
  T('projects').push({ id: JOB, tenant_id: A, name: 'Copper Ridge' }, { id: JOB2, tenant_id: A, name: 'Pima County' }, { id: JOB_B, tenant_id: B, name: 'Other Co Job' });
  T('profiles').push(
    { id: ADMIN.id, tenant_id: A, role: 'admin', full_name: 'Ada Admin' },
    { id: FOREMAN.id, tenant_id: A, role: 'Foreman', full_name: 'Frank Foreman' },
    { id: SALES.id, tenant_id: A, role: 'Salesperson', full_name: 'Sal Sales' },
    { id: OTHER.id, tenant_id: B, role: 'admin', full_name: 'Other Admin' },
  );
  T('role_definitions').push(
    { id: 'role-foreman', tenant_id: A, name: 'Foreman', permissions: { RFIs: 'View', Submittals: 'View', Projects: 'View', Admin: 'None' } },
    { id: 'role-sales', tenant_id: A, name: 'Salesperson', permissions: { RFIs: 'None', Submittals: 'None', Projects: 'Full', Sales: 'Full', Admin: 'None' } },
  );
  T('user_role_assignments').push(
    { id: 'ura-1', tenant_id: A, user_id: FOREMAN.id, role_id: 'role-foreman', project_id: null },
    { id: 'ura-2', tenant_id: A, user_id: SALES.id, role_id: 'role-sales', project_id: null },
  );
  T('rfis').push(
    { id: RFI, tenant_id: A, project_id: JOB, rfi_number: '7', subject: 'Door hardware at level 2', question: 'Which closer?', status: 'open', deleted_at: null, created_at: '2026-10-01T00:00:00Z' },
    { id: RFI_JOB2, tenant_id: A, project_id: JOB2, rfi_number: '1', subject: 'Door frame on another job', status: 'open', deleted_at: null, created_at: '2026-10-02T00:00:00Z' },
    { id: RFI_B, tenant_id: B, project_id: JOB_B, rfi_number: '1', subject: 'Other company door', status: 'open', deleted_at: null, created_at: '2026-10-02T00:00:00Z' },
  );
  T('submittals').push({ id: SUB, tenant_id: A, project_id: JOB, submittal_number: '08 71 00-1', title: 'Door hardware package', status: 'submitted', deleted_at: null, created_at: '2026-10-03T00:00:00Z' });
  T('punch_list').push({ id: PUNCH, tenant_id: A, project_id: JOB, item_number: 3, title: 'Closer leaking oil', status: 'open', deleted_at: null, created_at: '2026-10-04T00:00:00Z' });
  T('project_files').push({ id: 'file-1', tenant_id: A, entity_type: 'rfis', entity_id: RFI, file_name: 'closer-spec.pdf', file_size: 20480, storage_bucket: 'project-files', storage_path: 'a/closer-spec.pdf', created_at: '2026-10-05T00:00:00Z' });
});

describe('item page — read and edit', () => {
  test('reads an RFI with its job and its files', async () => {
    currentUser = ADMIN;
    const r = await getItem(req(`/api/items/rfis/${RFI}`), p('rfis', RFI));
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.item.subject).toBe('Door hardware at level 2');
    expect(j.project.name).toBe('Copper Ridge');
    expect(j.files).toEqual([expect.objectContaining({ name: 'closer-spec.pdf', url: 'signed:a/closer-spec.pdf' })]);
  });

  test('saves editable fields, ignores the rest, and stamps closed_at on close', async () => {
    currentUser = ADMIN;
    const r = await patchItem(req(`/api/items/rfis/${RFI}`, 'PATCH', { status: 'closed', due_date: '2026-10-20', ball_in_court: 'Architect', tenant_id: B, id: 'hijack', cost_impact: '1250.50' }), p('rfis', RFI));
    expect(r.status).toBe(200);
    const row = fake.T('rfis').find((x) => x.id === RFI)!;
    expect(row.status).toBe('closed');
    expect(row.closed_at).toBeTruthy();
    expect(row.due_date).toBe('2026-10-20');
    expect(row.ball_in_court).toBe('Architect');
    expect(row.cost_impact).toBe(1250.5);
    expect(row.tenant_id).toBe(A);
    expect(row.id).toBe(RFI);
  });

  test('refuses an empty title and a body with nothing editable', async () => {
    currentUser = ADMIN;
    expect((await patchItem(req(`/api/items/rfis/${RFI}`, 'PATCH', { subject: '  ' }), p('rfis', RFI))).status).toBe(400);
    expect((await patchItem(req(`/api/items/rfis/${RFI}`, 'PATCH', { tenant_id: B }), p('rfis', RFI))).status).toBe(400);
  });

  test("another company's item is not found, and unknown tools are refused", async () => {
    currentUser = ADMIN;
    expect((await getItem(req(`/api/items/rfis/${RFI_B}`), p('rfis', RFI_B))).status).toBe(404);
    currentUser = OTHER;
    expect((await getItem(req(`/api/items/rfis/${RFI}`), p('rfis', RFI))).status).toBe(404);
    expect((await patchItem(req(`/api/items/rfis/${RFI}`, 'PATCH', { subject: 'x' }), p('rfis', RFI))).status).toBe(404);
    expect((await getItem(req(`/api/items/projects/${JOB}`), p('projects', JOB))).status).toBe(404);
  });

  test('role permissions decide who may read and who may edit', async () => {
    currentUser = FOREMAN; // RFIs: View
    expect((await getItem(req(`/api/items/rfis/${RFI}`), p('rfis', RFI))).status).toBe(200);
    expect((await patchItem(req(`/api/items/rfis/${RFI}`, 'PATCH', { subject: 'x' }), p('rfis', RFI))).status).toBe(403);
    currentUser = SALES; // RFIs: None, Projects: Full
    expect((await getItem(req(`/api/items/rfis/${RFI}`), p('rfis', RFI))).status).toBe(403);
    expect((await patchItem(req(`/api/items/punch_list/${PUNCH}`, 'PATCH', { status: 'completed' }), p('punch_list', PUNCH))).status).toBe(200);
    expect(fake.T('punch_list')[0].completed_at).toBeTruthy();
  });

  test('no session → 401', async () => {
    currentUser = null;
    expect((await getItem(req(`/api/items/rfis/${RFI}`), p('rfis', RFI))).status).toBe(401);
  });
});

describe('item page — comments', () => {
  test('post, list, official answer, remove own, cannot remove others', async () => {
    currentUser = ADMIN;
    expect((await addComment(req(`/api/items/rfis/${RFI}/comments`, 'POST', { body: '' }), p('rfis', RFI))).status).toBe(400);
    const c1 = await addComment(req(`/api/items/rfis/${RFI}/comments`, 'POST', { body: 'Use the LCN 4040XP.', official: true, attachments: [{ id: 'file-1', name: 'closer-spec.pdf' }] }), p('rfis', RFI));
    expect(c1.status).toBe(201);
    currentUser = FOREMAN;
    const c2 = await addComment(req(`/api/items/rfis/${RFI}/comments`, 'POST', { body: 'Got it, ordering.' }), p('rfis', RFI));
    expect(c2.status).toBe(201);
    const list = await (await listComments(req(`/api/items/rfis/${RFI}/comments`), p('rfis', RFI))).json();
    expect(list.comments.map((c: { body: string }) => c.body)).toEqual(['Use the LCN 4040XP.', 'Got it, ordering.']);
    expect(list.comments[0]).toEqual(expect.objectContaining({ author_name: 'Ada Admin', is_official: true, mine: false, attachments: [{ id: 'file-1', name: 'closer-spec.pdf' }] }));
    expect(list.comments[1].mine).toBe(true);
    const adminComment = list.comments[0].id;
    expect((await delComment(req(`/api/items/rfis/${RFI}/comments?commentId=${adminComment}`, 'DELETE'), p('rfis', RFI))).status).toBe(403);
    const mine = list.comments[1].id;
    expect((await delComment(req(`/api/items/rfis/${RFI}/comments?commentId=${mine}`, 'DELETE'), p('rfis', RFI))).status).toBe(200);
    const after = await (await listComments(req(`/api/items/rfis/${RFI}/comments`), p('rfis', RFI))).json();
    expect(after.comments).toHaveLength(1);
    expect(fake.T('entity_comments')).toHaveLength(2); // hidden, not erased
  });
});

describe('related items — one link, shown on both records', () => {
  const links = (type: string, id: string) => listLinks(req(`/api/related-items?type=${type}&id=${id}`));
  const link = (from: [string, string], to: [string, string]) =>
    addLink(req('/api/related-items', 'POST', { from: { type: from[0], id: from[1] }, to: { type: to[0], id: to[1] } }));

  test('link both ways, refuse duplicates (either order), self and other companies, unlink', async () => {
    currentUser = ADMIN;
    const add = await link(['rfi', RFI], ['submittal', SUB]);
    expect(add.status).toBe(201);
    // Stored once, in the fixed order (submittal > rfi by type).
    expect(fake.T('related_items')).toEqual([expect.objectContaining({ a_type: 'rfi', a_id: RFI, b_type: 'submittal', b_id: SUB, tenant_id: A, project_id: JOB, created_by: ADMIN.id })]);
    const fromRfi = await (await links('rfi', RFI)).json();
    expect(fromRfi.items).toEqual([expect.objectContaining({ type: 'submittal', id: SUB, number: 'Submittal #08 71 00-1', title: 'Door hardware package', status: 'submitted', href: `/app/projects/${JOB}/items/submittals/${SUB}` })]);
    const fromSub = await (await links('submittal', SUB)).json();
    expect(fromSub.items).toEqual([expect.objectContaining({ type: 'rfi', id: RFI, number: 'RFI #7', title: 'Door hardware at level 2' })]);
    expect((await link(['rfi', RFI], ['submittal', SUB])).status).toBe(409);
    expect((await link(['submittal', SUB], ['rfi', RFI])).status).toBe(409);
    expect((await link(['rfi', RFI], ['rfi', RFI])).status).toBe(400);
    expect((await link(['rfi', RFI], ['rfi', RFI_B])).status).toBe(404);
    expect((await link(['rfi', RFI], ['rfi', RFI_JOB2])).status).toBe(400);
    expect((await link(['rfi', RFI], ['bogus', SUB])).status).toBe(400);
    const del = await delLink(req(`/api/related-items?linkId=${fromSub.items[0].linkId}`, 'DELETE'));
    expect(del.status).toBe(200);
    expect((await (await links('rfi', RFI)).json()).items).toEqual([]);
    expect(fake.T('rfis').find((x) => x.id === RFI)).toBeTruthy();
  });

  test('another company cannot read, add or remove links on this company\'s records', async () => {
    currentUser = ADMIN;
    const add = await (await link(['rfi', RFI], ['punch_item', PUNCH])).json();
    currentUser = OTHER;
    expect((await links('rfi', RFI)).status).toBe(404);
    expect((await link(['rfi', RFI_B], ['rfi', RFI])).status).toBe(404);
    expect((await delLink(req(`/api/related-items?linkId=${add.link.id}`, 'DELETE'))).status).toBe(404);
    expect(fake.T('related_items')).toHaveLength(1);
  });

  test('a Foreman (RFIs and Submittals: View) cannot link; Sales (no RFIs) cannot see the RFI side', async () => {
    currentUser = FOREMAN;
    expect((await link(['rfi', RFI], ['submittal', SUB])).status).toBe(403);
    currentUser = ADMIN;
    await link(['punch_item', PUNCH], ['submittal', SUB]);
    await link(['punch_item', PUNCH], ['rfi', RFI]);
    currentUser = SALES;
    const seen = await (await links('punch_item', PUNCH)).json();
    expect(seen.items.map((i: { type: string }) => i.type)).toEqual([]); // Sales has neither RFIs nor Submittals
  });

  test('picker search finds records on this job by words or number, not itself, not other jobs or companies', async () => {
    currentUser = ADMIN;
    const j = await (await searchRelated(req(`/api/related-items/search?projectId=${JOB}&q=door&exclude=rfi:${RFI}`))).json();
    expect(j.items.map((i: { number: string; title: string }) => `${i.number} · ${i.title}`)).toEqual(['Submittal #08 71 00-1 · Door hardware package']);
    const byNumber = await (await searchRelated(req(`/api/related-items/search?projectId=${JOB}&q=${encodeURIComponent('Punch #3')}`))).json();
    expect(byNumber.items.map((i: { type: string; id: string }) => `${i.type}:${i.id}`)).toEqual([`punch_item:${PUNCH}`]);
    const all = await (await searchRelated(req(`/api/related-items/search?projectId=${JOB}&q=`))).json();
    expect(all.items).toHaveLength(3);
    currentUser = OTHER;
    expect((await searchRelated(req(`/api/related-items/search?projectId=${JOB}&q=door`))).status).toBe(404);
  });

  test('item search (drawing pin picker) still finds items by words', async () => {
    currentUser = ADMIN;
    const j = await (await search(req(`/api/items/search?projectId=${JOB}&q=door&exclude=rfis:${RFI}`))).json();
    expect(j.items.map((i: { name: string }) => i.name)).toEqual(['Submittal #08 71 00-1 · Door hardware package']);
  });
});

describe('item page — change orders and inspections', () => {
  const CO = 'aaaaaaaa-0000-4000-8000-0000000000c1';
  const INSP = 'aaaaaaaa-0000-4000-8000-0000000000e1';
  beforeEach(() => {
    fake.T('change_orders').push({ id: CO, tenant_id: A, project_id: JOB, co_number: 4, title: 'Added fire dampers', amount: 18250, status: 'pending', deleted_at: null, created_at: '2026-10-06T00:00:00Z' });
    fake.T('inspections').push({ id: INSP, tenant_id: A, project_id: JOB, inspection_type: 'Above-ceiling', permit_number: 'B-2291', status: 'scheduled', result: 'pending', created_at: '2026-10-07T00:00:00Z' });
  });
  test('approving a CO stamps approved_at and keeps the money exact', async () => {
    currentUser = ADMIN;
    const r = await patchItem(req(`/api/items/change_orders/${CO}`, 'PATCH', { status: 'approved', amount: '18250.40' }), p('change_orders', CO));
    expect(r.status).toBe(200);
    const row = fake.T('change_orders')[0];
    expect(row.amount).toBe(18250.4);
    expect(row.approved_at).toBeTruthy();
    expect(row.updated_at).toBeTruthy();
  });
  test('approving on the record page moves the contract and budget by exactly the CO, once; rejecting takes it back', async () => {
    currentUser = ADMIN;
    const job = fake.T('projects').find((r) => r.id === JOB)!;
    Object.assign(job, { contract_amount: 1000000, original_contract_amount: 1000000, revised_contract_value: 1000000 });
    fake.T('budget_lines').push({ id: 'bl-1', tenant_id: A, project_id: JOB, cost_code: '03-300', original_budget: 400000, approved_changes: 0 });
    const approve = () => patchItem(req(`/api/items/change_orders/${CO}`, 'PATCH', { status: 'approved' }), p('change_orders', CO));
    expect((await approve()).status).toBe(200);
    expect(job.contract_amount).toBe(1018250);
    expect(job.revised_contract_value).toBe(1018250);
    const unalloc = () => fake.T('budget_lines').find((l) => l.cost_code === 'CO-UNALLOCATED');
    expect(unalloc()?.approved_changes).toBe(18250);
    // Approving again changes nothing.
    expect((await approve()).status).toBe(200);
    expect(job.contract_amount).toBe(1018250);
    expect(unalloc()?.approved_changes).toBe(18250);
    // Reject takes it back off.
    expect((await patchItem(req(`/api/items/change_orders/${CO}`, 'PATCH', { status: 'rejected' }), p('change_orders', CO))).status).toBe(200);
    expect(job.contract_amount).toBe(1000000);
    expect(unalloc()?.approved_changes).toBe(0);
    expect(fake.T('change_orders')[0].rejected_at).toBeTruthy();
  });
  test('completing an inspection stamps inspected_at and never writes updated_at (no such column)', async () => {
    currentUser = ADMIN;
    const r = await patchItem(req(`/api/items/inspections/${INSP}`, 'PATCH', { status: 'completed', result: 'pass' }), p('inspections', INSP));
    expect(r.status).toBe(200);
    const row = fake.T('inspections')[0];
    expect(row.result).toBe('pass');
    expect(row.inspected_at).toBeTruthy();
    expect('updated_at' in row).toBe(false);
  });
  test('CO permissions: Foreman has no Change Orders access', async () => {
    currentUser = FOREMAN;
    expect((await getItem(req(`/api/items/change_orders/${CO}`), p('change_orders', CO))).status).toBe(403);
  });
  test('link a CO to an RFI and find it in search', async () => {
    currentUser = ADMIN;
    expect((await addLink(req('/api/related-items', 'POST', { from: { type: 'rfi', id: RFI }, to: { type: 'change_order', id: CO } }))).status).toBe(201);
    const fromCo = await (await listLinks(req(`/api/related-items?type=change_order&id=${CO}`))).json();
    expect(fromCo.items).toEqual([expect.objectContaining({ type: 'rfi', number: 'RFI #7', title: 'Door hardware at level 2' })]);
    const found = await (await search(req(`/api/items/search?projectId=${JOB}&q=dampers`))).json();
    expect(found.items.map((i: { name: string }) => i.name)).toEqual(['CO #4 · Added fire dampers']);
  });
});


describe('record page values read in plain English', () => {
  test('stored code words are humanized; free text is left exactly as typed', async () => {
    const { valueLabel } = await import('./value-label');
    expect(valueLabel('owner_request')).toBe('Owner request');
    expect(valueLabel('approved_as_noted')).toBe('Approved as noted');
    expect(valueLabel('Owner')).toBe('Owner');
    expect(valueLabel('Smith Electric')).toBe('Smith Electric');
    expect(valueLabel('pm@acme.com')).toBe('pm@acme.com');
    expect(valueLabel('09 21 00')).toBe('09 21 00');
    expect(valueLabel('Has_Caps')).toBe('Has_Caps');
  });
});
