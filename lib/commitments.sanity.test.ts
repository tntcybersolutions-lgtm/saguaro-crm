/**
 * @jest-environment node
 *
 * Commitments through the real routes: subcontracts and POs land in one list
 * with revised, billed, paid and remaining worked out; a bid award's twin
 * commitments row is merged, not counted twice; prime contracts stay out;
 * bills count only when the vendor has one commitment; another company sees
 * nothing; a person without Budget access is refused; and a subcontract or PO
 * opens and saves on its full record page with the status stamps applied.
 */
import { makeFakeDb } from './__fixtures__/fake-db';
import { describe, test, expect, beforeEach } from '@jest/globals';
declare const jest: { mock: (m: string, f: () => unknown) => void };

const fake = makeFakeDb();
let currentUser: { id: string; tenantId: string; email: string } | null = null;
jest.mock('@/lib/supabase-server', () => ({ createServerClient: () => fake.db, getUser: async () => currentUser, supabaseAdmin: {} }));
jest.mock('@/lib/storage-signing', () => ({
  signStoredUrl: async (_b: string, p: string) => `signed:${p}`,
  signFields: async (rows: Record<string, unknown>[], keys: string[]) => rows.map((r) => ({ ...r, ...Object.fromEntries(keys.map((k) => [k, `signed:${r[k]}`])) })),
}));

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/projects/[projectId]/commitments/route';
import { GET as getItem, PATCH as patchItem } from '@/app/api/items/[tool]/[id]/route';

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';
const JOB = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const PKG = 'aaaaaaaa-0000-4000-8000-0000000000e1';
const SC1 = 'aaaaaaaa-0000-4000-8000-0000000000c1';
const SC2 = 'aaaaaaaa-0000-4000-8000-0000000000c2';
const PRIME = 'aaaaaaaa-0000-4000-8000-0000000000c3';
const VOID = 'aaaaaaaa-0000-4000-8000-0000000000c4';
const PO1 = 'aaaaaaaa-0000-4000-8000-0000000000d1';
const ADMIN = { id: 'aaaaaaaa-0000-4000-8000-00000000ad01', tenantId: A, email: 'admin@a.test' };
const FOREMAN = { id: 'aaaaaaaa-0000-4000-8000-00000000f001', tenantId: A, email: 'foreman@a.test' };

const list = async () => {
  const r = await GET(new NextRequest(`https://saguarocontrol.net/api/projects/${JOB}/commitments`), { params: { projectId: JOB } });
  return { status: r.status, body: await r.json() };
};
const ireq = (url: string, method = 'GET', body?: unknown) =>
  new NextRequest(`https://saguarocontrol.net${url}`, body === undefined ? { method } : { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const ip = (tool: string, id: string) => ({ params: Promise.resolve({ tool, id }) });

beforeEach(() => {
  fake.reset();
  const { T } = fake;
  T('projects').push({ id: JOB, tenant_id: A, name: 'Copper Ridge' });
  T('profiles').push({ id: ADMIN.id, tenant_id: A, role: 'admin' }, { id: FOREMAN.id, tenant_id: A, role: 'Foreman' });
  T('role_definitions').push({ id: 'fm', tenant_id: A, name: 'Foreman', permissions: { Projects: 'Edit', Budget: 'None' } });
  T('user_role_assignments').push({ id: 'u1', tenant_id: A, user_id: FOREMAN.id, role_id: 'fm', project_id: null });
  T('contracts').push(
    { id: SC1, tenant_id: A, project_id: JOB, contract_type: 'subcontract', contract_number: 'SC-001', party_name: 'Desert Air Systems', trade: 'HVAC', status: 'executed', amount: 100000, approved_changes: 5000, invoiced_amount: 10000, retainage_pct: 10, bid_package_id: PKG, pdf_url: 'project-files/sc1.pdf', signing_token: 'secret-token', updated_at: null, executed_at: '2026-10-01T00:00:00Z' },
    { id: SC2, tenant_id: A, project_id: JOB, contract_type: null, contract_number: 'SC-002', party_name: 'Mesa Electric', status: 'draft', amount: 40000, updated_at: null },
    { id: PRIME, tenant_id: A, project_id: JOB, contract_type: 'prime', contract_number: 'PC-1', party_name: 'Owner LLC', status: 'executed', amount: 2000000 },
    { id: VOID, tenant_id: A, project_id: JOB, contract_type: 'subcontract', contract_number: 'SC-003', party_name: 'Gone Drywall', status: 'void', amount: 9999 },
    { id: 'cb', tenant_id: B, project_id: JOB, contract_type: 'subcontract', party_name: 'Other Co Sub', status: 'executed', amount: 1 },
  );
  // Written by the bid award for the same deal as SC1.
  T('commitments').push({ id: 'cm1', tenant_id: A, project_id: JOB, bid_package_id: PKG, vendor_name: 'Desert Air Systems', commitment_number: 'SC-001', commitment_type: 'subcontract', original_amount: 100000, status: 'active', retainage_held: 0 });
  T('purchase_orders').push({ id: PO1, tenant_id: A, project_id: JOB, po_number: 'PO-7', vendor_name: 'Copper Supply', status: 'sent', total: null, subtotal: 1000, tax: 80, shipping: 20, updated_at: null });
  T('bills').push(
    { id: 'b1', tenant_id: A, project_id: JOB, vendor_name: 'desert air  systems', total: 30000, status: 'approved' },
    { id: 'b2', tenant_id: A, project_id: JOB, vendor_name: 'Desert Air Systems', total: 5000, status: 'paid' },
    { id: 'b3', tenant_id: A, project_id: JOB, vendor_name: 'Desert Air Systems', total: 99999, status: 'rejected' },
    { id: 'b4', tenant_id: A, project_id: JOB, vendor_name: 'Copper Supply', total: 1100, paid_amount: 1100, status: 'paid' },
    { id: 'b5', tenant_id: B, project_id: JOB, vendor_name: 'Desert Air Systems', total: 77777, status: 'approved' },
  );
  currentUser = ADMIN;
});

describe('commitments list', () => {
  test('one list of subcontracts and POs, twin award row merged, prime contract left out', async () => {
    const { status, body } = await list();
    expect(status).toBe(200);
    const ids = body.commitments.map((r: { id: string }) => r.id).sort();
    expect(ids).toEqual([SC1, SC2, VOID, PO1].sort());
  });

  test("the award's draft PO for the same deal is not counted again", async () => {
    fake.T('purchase_orders').push({ id: 'po-award', tenant_id: A, project_id: JOB, vendor_name: 'Desert Air Systems', description: 'HVAC — awarded subcontract', status: 'draft', total: 100000, notes: `Auto-generated on bid award (package ${PKG}). Committed cost.` });
    const rows = (await list()).body.commitments;
    expect(rows.find((r: { id: string }) => r.id === 'po-award')).toBeUndefined();
    expect(rows.filter((r: { vendor: string }) => r.vendor === 'Desert Air Systems')).toHaveLength(1);
  });

  test('revised, billed, paid, remaining and retainage on a subcontract', async () => {
    const sc = (await list()).body.commitments.find((r: { id: string }) => r.id === SC1);
    expect(sc).toMatchObject({ kind: 'Subcontract', number: 'SC-001', vendor: 'Desert Air Systems', original: 100000, approved_changes: 5000, revised: 105000 });
    expect(sc.billed).toBe(35000); // approved + paid bills; rejected and the other company's left out
    expect(sc.billed_source).toBe('bills');
    expect(sc.paid).toBe(5000);
    expect(sc.remaining).toBe(70000);
    expect(sc.percent_billed).toBe(33.3);
    expect(sc.retainage_held).toBe(3500);
    expect(sc.href).toBe(`/app/projects/${JOB}/items/contracts/${SC1}`);
  });

  test('a PO with no total uses subtotal + tax + shipping, and its bill', async () => {
    const po = (await list()).body.commitments.find((r: { id: string }) => r.id === PO1);
    expect(po).toMatchObject({ kind: 'Purchase order', number: 'PO-7', revised: 1100, billed: 1100, paid: 1100, remaining: 0 });
  });

  test('two commitments with one vendor: bills are not guessed', async () => {
    fake.T('purchase_orders').push({ id: 'po2', tenant_id: A, project_id: JOB, po_number: 'PO-8', vendor_name: 'Desert Air Systems', status: 'sent', total: 2000 });
    const sc = (await list()).body.commitments.find((r: { id: string }) => r.id === SC1);
    expect(sc.billed).toBe(10000);
    expect(sc.billed_source).toBe('entered');
  });

  test("another company sees none of it; a role without Budget is refused", async () => {
    currentUser = { id: 'x', tenantId: B, email: 'b@b.test' };
    expect((await list()).status).toBe(404);
    currentUser = FOREMAN;
    const r = await list();
    expect(r.status).toBe(403);
    expect(r.body.error).toMatch(/Budget/);
  });
});

describe('subcontract and PO record pages', () => {
  test('a subcontract opens with its signed PDF and without the signing token', async () => {
    const r = await getItem(ireq(`/api/items/contracts/${SC1}`), ip('contracts', SC1));
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.item.party_name).toBe('Desert Air Systems');
    expect(j.item.signing_token).toBeUndefined();
    expect(j.files[0]).toMatchObject({ name: 'Subcontract document (PDF)', url: 'signed:project-files/sc1.pdf' });
  });

  test('executing a subcontract stamps the date and keeps amount columns in step', async () => {
    const r = await patchItem(ireq(`/api/items/contracts/${SC2}`, 'PATCH', { status: 'executed', amount: '42500', party_name: 'Mesa Ridge Electric', tenant_id: B, signing_token: 'x' }), ip('contracts', SC2));
    expect(r.status).toBe(200);
    const row = fake.T('contracts').find((c) => c.id === SC2)!;
    expect(row).toMatchObject({ status: 'executed', amount: 42500, contract_amount: 42500, party_name: 'Mesa Ridge Electric', vendor_name: 'Mesa Ridge Electric', tenant_id: A });
    expect(row.signing_token).toBeUndefined();
    expect(String(row.executed_at)).toMatch(/^\d{4}-/);
    expect(row.executed_date).toBe(String(row.executed_at).slice(0, 10));
    const sc = (await list()).body.commitments.find((x: { id: string }) => x.id === SC2);
    expect(sc).toMatchObject({ status: 'executed', revised: 42500, vendor: 'Mesa Ridge Electric' });
  });

  test('approving a PO stamps who and when; receiving stamps delivery', async () => {
    await patchItem(ireq(`/api/items/purchase_orders/${PO1}`, 'PATCH', { status: 'approved' }), ip('purchase_orders', PO1));
    let po = fake.T('purchase_orders').find((x) => x.id === PO1)!;
    expect(po.approved_by).toBe(ADMIN.id);
    expect(po.approved_at).toBeTruthy();
    await patchItem(ireq(`/api/items/purchase_orders/${PO1}`, 'PATCH', { status: 'received' }), ip('purchase_orders', PO1));
    po = fake.T('purchase_orders').find((x) => x.id === PO1)!;
    expect(po.delivered_at).toBeTruthy();
  });

  test('a foreman without Budget access cannot open or change a subcontract', async () => {
    currentUser = FOREMAN;
    expect((await getItem(ireq(`/api/items/contracts/${SC1}`), ip('contracts', SC1))).status).toBe(403);
    expect((await patchItem(ireq(`/api/items/contracts/${SC1}`, 'PATCH', { amount: 1 }), ip('contracts', SC1))).status).toBe(403);
  });
});
