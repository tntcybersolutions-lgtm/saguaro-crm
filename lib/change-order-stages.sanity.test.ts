/**
 * @jest-environment node
 *
 * Change management, end to end through the real route handlers:
 * potential change → request to the owner → approved owner change order, the
 * company's approval tiers, the owner's link, and the rule that the money
 * moves exactly once. Only the database and the session are faked; the
 * permission check (lib/permissions), the tiers (lib/change-order-tiers), the
 * shared step (lib/change-order-status) and the cascade are the real ones.
 */
import { makeFakeDb } from './__fixtures__/fake-db';
import { describe, test, expect, beforeEach } from '@jest/globals';
declare const jest: { mock: (m: string, f: () => unknown) => void };

const fake = makeFakeDb();
let currentUser: { id: string; tenantId: string; email: string } | null = null;

// Some modules build their client at import (before `fake` exists): hand them a
// stand-in that reaches the fake database only when it is used.
jest.mock('@/lib/supabase-server', () => ({
  createServerClient: () => new Proxy({}, { get: (_t, k) => (fake.db as unknown as Record<string | symbol, unknown>)[k] }),
  getUser: async () => currentUser,
  supabaseAdmin: {},
}));

import { NextRequest } from 'next/server';
import { POST as createCo } from '@/app/api/change-orders/create/route';
import { POST as approveCo } from '@/app/api/change-orders/[id]/approve/route';
import { POST as rejectCo } from '@/app/api/change-orders/[id]/reject/route';
import { PATCH as updateCo } from '@/app/api/change-orders/[id]/update/route';
import { POST as stageCo } from '@/app/api/change-orders/[id]/stage/route';
import { POST as rollUp } from '@/app/api/change-orders/roll-up/route';
import { POST as sendOwner } from '@/app/api/change-orders/[id]/send-to-owner/route';
import { POST as ownerSignoff } from '@/app/api/change-orders/[id]/owner-signoff/route';
import { GET as workflow } from '@/app/api/change-orders/[id]/workflow/route';
import { GET as ownerGet, POST as ownerPost } from '@/app/api/owner-portal/approve/[token]/route';
import { PATCH as patchItem } from '@/app/api/items/[tool]/[id]/route';
import { GET as getTiers, PUT as putTiers } from '@/app/api/settings/co-approval-tiers/route';
import { SUGGESTED_TIERS, approvalState, tierFor, validateTiers, soloLimit } from './change-order-tiers';

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const JOB = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const ADMIN = { id: 'aaaaaaaa-0000-4000-8000-00000000ad01', tenantId: A, email: 'admin@a.test' };
const PM1 = { id: 'aaaaaaaa-0000-4000-8000-00000000b001', tenantId: A, email: 'pm1@a.test' };
const PM2 = { id: 'aaaaaaaa-0000-4000-8000-00000000b002', tenantId: A, email: 'pm2@a.test' };
const EDITOR = { id: 'aaaaaaaa-0000-4000-8000-00000000e001', tenantId: A, email: 'ed@a.test' };

const req = (url: string, method = 'GET', body?: unknown) =>
  new NextRequest(`https://saguarocontrol.net${url}`, body === undefined ? { method } : { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const idp = (id: string) => ({ params: Promise.resolve({ id }) });
const as = (u: typeof ADMIN) => { currentUser = u; };

const job = () => fake.T('projects').find((p) => p.id === JOB)!;
const unalloc = () => Number(fake.T('budget_lines').find((l) => l.cost_code === 'CO-UNALLOCATED')?.approved_changes || 0);
const co = (id: string) => fake.T('change_orders').find((c) => c.id === id)!;

/** A priced request on the job, as the create route makes it. */
async function request(amount: number, title = 'Added fire dampers'): Promise<string> {
  as(PM1);
  const r = await createCo(req('/api/change-orders/create', 'POST', { projectId: JOB, title, costImpact: amount }));
  expect(r.status).toBe(200);
  return String((await r.json()).changeOrder.id);
}
const approve = async (u: typeof ADMIN, id: string) => { as(u); return approveCo(req(`/api/change-orders/${id}/approve`, 'POST', {}), idp(id)); };

beforeEach(() => {
  fake.reset();
  const { T } = fake;
  T('projects').push({ id: JOB, tenant_id: A, name: 'Copper Ridge', owner_email: 'owner@client.test', contract_amount: 1000000, original_contract_amount: 1000000, revised_contract_value: 1000000 });
  T('budget_lines').push({ id: 'bl-1', tenant_id: A, project_id: JOB, cost_code: '03-300', original_budget: 400000, approved_changes: 0 });
  T('profiles').push(
    { id: ADMIN.id, tenant_id: A, role: 'admin', full_name: 'Ada Admin' },
    { id: PM1.id, tenant_id: A, role: 'member', full_name: 'Pat Manager' },
    { id: PM2.id, tenant_id: A, role: 'member', full_name: 'Quinn Manager' },
    { id: EDITOR.id, tenant_id: A, role: 'member', full_name: 'Eli Editor' },
  );
  T('role_definitions').push(
    { id: 'role-pm', tenant_id: A, name: 'Project Manager', permissions: { 'Change Orders': 'Full', Documents: 'Full', Projects: 'Full', Admin: 'View' } },
    { id: 'role-ed', tenant_id: A, name: 'Coordinator', permissions: { 'Change Orders': 'Edit', Projects: 'View', Admin: 'None' } },
  );
  T('user_role_assignments').push(
    { id: 'ura-1', tenant_id: A, user_id: PM1.id, role_id: 'role-pm', project_id: null },
    { id: 'ura-2', tenant_id: A, user_id: PM2.id, role_id: 'role-pm', project_id: null },
    { id: 'ura-3', tenant_id: A, user_id: EDITOR.id, role_id: 'role-ed', project_id: null },
  );
  T('tenant_settings').push({ id: 'ts-1', tenant_id: A, company_name: 'Copper State Developments', co_approval_tiers: SUGGESTED_TIERS });
});

describe('tiers — the pure rules', () => {
  test('a size falls in the right tier, by absolute value', () => {
    expect(tierFor(10000, SUGGESTED_TIERS).index).toBe(0);
    expect(tierFor(10000.01, SUGGESTED_TIERS).index).toBe(1);
    expect(tierFor(-60000, SUGGESTED_TIERS).tier.level).toBe('Admin');
  });
  test('bad tiers are refused with the reason', () => {
    expect(validateTiers([{ upTo: 10000, level: 'Full', approvers: 1 }]).ok).toBe(false);
    expect(validateTiers([{ upTo: null, level: 'Boss', approvers: 1 }]).ok).toBe(false);
    expect(validateTiers([{ upTo: null, level: 'Full', approvers: 9 }]).ok).toBe(false);
    const v = validateTiers([{ upTo: null, level: 'Admin', approvers: 1 }, { upTo: 5000, level: 'Edit', approvers: 1 }]);
    expect(v.ok && v.tiers.map((t) => t.upTo)).toEqual([5000, null]);
  });
  test('a PM can approve up to $10,000 alone; an admin anything', () => {
    expect(soloLimit('Full', SUGGESTED_TIERS)).toBe(10000);
    expect(soloLimit('Admin', SUGGESTED_TIERS)).toBe(null);
    expect(soloLimit('Edit', SUGGESTED_TIERS)).toBe(0);
  });
  test('approvals at an old price, or before a rejection, do not count', () => {
    const d = [
      { decision: 'approved', decided_at: '2026-10-01T00:00:00Z', decided_by_id: 'u1', amount: 30000, approver_role: 'internal', approver_level: 'Full' },
      { decision: 'rejected', decided_at: '2026-10-02T00:00:00Z', decided_by: 'Owner: Kim' },
      { decision: 'approved', decided_at: '2026-10-03T00:00:00Z', decided_by_id: 'u2', amount: 30000, approver_role: 'internal', approver_level: 'Full' },
      { decision: 'approved', decided_at: '2026-10-04T00:00:00Z', decided_by_id: 'u3', amount: 29000, approver_role: 'internal', approver_level: 'Full' },
      { decision: 'approved', decided_at: '2026-10-05T00:00:00Z', decided_by_id: 'u2', amount: 30000, approver_role: 'internal', approver_level: 'Full' },
    ];
    const s = approvalState(d, 30000, SUGGESTED_TIERS);
    expect(s.approvers.map((a) => a.id)).toEqual(['u2']);
    expect(s.remaining).toBe(1);
  });
});

describe('stages — PCO → request → approved', () => {
  test('a potential change is logged with an estimate and moves no money', async () => {
    as(PM1);
    const r = await createCo(req('/api/change-orders/create', 'POST', { projectId: JOB, title: 'Rock at footing F4', stage: 'pco', estimatedMin: 8000, estimatedMax: 12000 }));
    const pco = (await r.json()).changeOrder;
    expect(pco.stage).toBe('pco');
    expect(pco.status).toBe('draft');
    expect(pco.amount).toBe(10000);
    expect(job().contract_amount).toBe(1000000);
    // Priced: it becomes a request, still no money.
    expect((await stageCo(req(`/api/change-orders/${pco.id}/stage`, 'POST', { to: 'cor', amount: 9400 }), idp(pco.id))).status).toBe(200);
    expect(co(pco.id).stage).toBe('cor');
    expect(co(pco.id).status).toBe('pending');
    expect(co(pco.id).amount).toBe(9400);
    expect(job().contract_amount).toBe(1000000);
    // Approved by a PM (under $10k): the money moves.
    expect((await approve(PM1, pco.id)).status).toBe(200);
    expect(job().contract_amount).toBe(1009400);
    expect(unalloc()).toBe(9400);
  });

  test('several PCOs roll into one request; the money is counted once, on the request', async () => {
    as(PM1);
    const mk = async (title: string, lo: number, hi: number) => (await (await createCo(req('/api/change-orders/create', 'POST', { projectId: JOB, title, stage: 'pco', estimatedMin: lo, estimatedMax: hi }))).json()).changeOrder.id as string;
    const p1 = await mk('Owner-added outlets', 3000, 3000);
    const p2 = await mk('Relocate panel', 4000, 6000);
    const r = await rollUp(req('/api/change-orders/roll-up', 'POST', { projectId: JOB, pcoIds: [p1, p2] }));
    expect(r.status).toBe(201);
    const cor = (await r.json()).changeOrder;
    expect(cor.amount).toBe(8000);
    expect(cor.stage).toBe('cor');
    expect(co(p1).cor_id).toBe(cor.id);
    expect(co(p2).cor_id).toBe(cor.id);
    // A PCO inside a request cannot be approved on its own.
    expect((await approve(ADMIN, p1)).status).toBe(409);
    expect(job().contract_amount).toBe(1000000);
    // Nor rolled in twice.
    expect((await rollUp(req('/api/change-orders/roll-up', 'POST', { projectId: JOB, pcoIds: [p1] }))).status).toBe(409);
    // The request cannot go back to a PCO while it carries PCOs.
    expect((await stageCo(req(`/api/change-orders/${cor.id}/stage`, 'POST', { to: 'pco' }), idp(cor.id))).status).toBe(409);
    // Approving the request books $8,000 — once.
    expect((await approve(PM1, cor.id)).status).toBe(200);
    expect(job().contract_amount).toBe(1008000);
    expect(unalloc()).toBe(8000);
    // The record page reads the PCOs inside it.
    as(PM1);
    const wf = (await (await workflow(req(`/api/change-orders/${cor.id}/workflow`), idp(cor.id))).json()).workflow;
    expect(wf.pcos.map((p: { amount: number }) => p.amount)).toEqual([3000, 5000]);
    expect(wf.stage).toBe('approved');
    expect(wf.money.contractNow).toBe(1008000);
  });
});

describe('approval tiers — enforced in the shared step', () => {
  test('under $10k: Change Orders: Edit is refused with the reason; a PM approves', async () => {
    const id = await request(8000);
    const r = await approve(EDITOR, id);
    expect(r.status).toBe(403);
    expect((await r.json()).error).toMatch(/Change Orders: Full/);
    expect(job().contract_amount).toBe(1000000);
    expect((await approve(PM1, id)).status).toBe(200);
    expect(job().contract_amount).toBe(1008000);
  });

  test('$10k–$50k needs two PMs: the first is held, the second books it, exactly once', async () => {
    const id = await request(30000);
    const first = await approve(PM1, id);
    expect(first.status).toBe(202);
    const j = await first.json();
    expect(j.held).toBe('approvers');
    expect(j.approval.remaining).toBe(1);
    expect(co(id).status).toBe('pending');
    expect(job().contract_amount).toBe(1000000);
    // The same person twice is still one approver.
    expect((await approve(PM1, id)).status).toBe(202);
    expect(job().contract_amount).toBe(1000000);
    expect((await approve(PM2, id)).status).toBe(200);
    expect(co(id).status).toBe('approved');
    expect(job().contract_amount).toBe(1030000);
    expect(unalloc()).toBe(30000);
    // Approving an approved CO changes nothing.
    expect((await approve(ADMIN, id)).status).toBe(200);
    expect(job().contract_amount).toBe(1030000);
    expect(unalloc()).toBe(30000);
    // Who approved, at which step, is on the record.
    const rows = fake.T('approval_decisions').filter((d) => d.entity_id === id && d.decision === 'approved');
    expect(rows.map((d) => d.decided_by)).toEqual(['Pat Manager', 'Quinn Manager']);
    expect(rows.every((d) => d.amount === 30000 && d.approver_level === 'Full')).toBe(true);
  });

  test('above $50k: a PM is refused; an admin approves', async () => {
    const id = await request(60000);
    const r = await approve(PM1, id);
    expect(r.status).toBe(403);
    expect((await r.json()).error).toMatch(/company admin.*up to \$10,000/);
    expect((await approve(ADMIN, id)).status).toBe(200);
    expect(job().contract_amount).toBe(1060000);
  });

  test('a company admin approves any tier below Admin alone', async () => {
    const id = await request(30000);
    expect((await approve(ADMIN, id)).status).toBe(200);
    expect(job().contract_amount).toBe(1030000);
  });

  test('the record page and its status picker go through the same tiers', async () => {
    const id = await request(30000);
    as(PM1);
    const r = await patchItem(req(`/api/items/change_orders/${id}`, 'PATCH', { status: 'approved' }), { params: Promise.resolve({ tool: 'change_orders', id }) });
    expect(r.status).toBe(202);
    expect(co(id).status).toBe('pending');
    expect(co(id).approved_at).toBeFalsy();
    expect(job().contract_amount).toBe(1000000);
  });

  test('re-pricing a request asks for the approvals again', async () => {
    const id = await request(30000);
    expect((await approve(PM1, id)).status).toBe(202);
    as(PM1);
    expect((await updateCo(req(`/api/change-orders/${id}/update`, 'PATCH', { cost_impact: 31000 }), idp(id))).status).toBe(200);
    expect((await approve(PM2, id)).status).toBe(202); // PM1's approval was at $30,000
    expect((await approve(PM1, id)).status).toBe(200);
    expect(job().contract_amount).toBe(1031000);
  });

  test('a rejection starts the approvals over', async () => {
    const id = await request(30000);
    await approve(PM1, id);
    as(ADMIN);
    expect((await rejectCo(req(`/api/change-orders/${id}/reject`, 'POST', { reason: 'Owner wants a second price' }), idp(id))).status).toBe(200);
    as(PM1);
    expect((await updateCo(req(`/api/change-orders/${id}/update`, 'PATCH', { status: 'pending' }), idp(id))).status).toBe(200);
    expect((await approve(PM2, id)).status).toBe(202);
    expect(job().contract_amount).toBe(1000000);
  });

  test('re-pricing an approved CO takes the new tier: into a two-approver tier it is refused, within a tier it moves by the difference', async () => {
    const id = await request(8000);
    expect((await approve(PM1, id)).status).toBe(200);
    as(PM1);
    const up = await updateCo(req(`/api/change-orders/${id}/update`, 'PATCH', { cost_impact: 40000 }), idp(id));
    expect(up.status).toBe(409);
    expect(job().contract_amount).toBe(1008000);
    expect((await updateCo(req(`/api/change-orders/${id}/update`, 'PATCH', { cost_impact: 9500 }), idp(id))).status).toBe(200);
    expect(job().contract_amount).toBe(1009500);
    expect(unalloc()).toBe(9500);
  });

  test('a company with no tiers keeps the old rule: one Full approver, any amount', async () => {
    fake.T('tenant_settings')[0].co_approval_tiers = null;
    const id = await request(250000);
    expect((await approve(PM1, id)).status).toBe(200);
    expect(job().contract_amount).toBe(1250000);
  });

  test('tiers are saved by an admin only, and read back', async () => {
    as(PM1);
    expect((await putTiers(req('/api/settings/co-approval-tiers', 'PUT', { tiers: SUGGESTED_TIERS }))).status).toBe(403);
    as(ADMIN);
    expect((await putTiers(req('/api/settings/co-approval-tiers', 'PUT', { tiers: [{ upTo: null, level: 'Full', approvers: 0 }] }))).status).toBe(400);
    expect((await putTiers(req('/api/settings/co-approval-tiers', 'PUT', { tiers: [{ upTo: 25000, level: 'Full', approvers: 1 }, { upTo: null, level: 'Admin', approvers: 2 }] }))).status).toBe(200);
    as(PM1);
    const j = await (await getTiers(req('/api/settings/co-approval-tiers'))).json();
    expect(j.tiers).toEqual([{ upTo: 25000, level: 'Full', approvers: 1 }, { upTo: null, level: 'Admin', approvers: 2 }]);
    expect(j.canEdit).toBe(false);
  });
});

describe("the owner's approval link", () => {
  const tokenOf = (id: string) => String(co(id).owner_approval_token);
  const ownerDecide = (token: string, action: string, extra: Record<string, unknown> = {}) =>
    ownerPost(req(`/api/owner-portal/approve/${token}`, 'POST', { action, name: 'Kim Owner', ...extra }), { params: Promise.resolve({ token }) });

  test('sent, approved inside the company, then the owner signs: it books once', async () => {
    const id = await request(8000);
    as(PM1);
    const s = await sendOwner(req(`/api/change-orders/${id}/send-to-owner`, 'POST', {}), idp(id));
    expect(s.status).toBe(200);
    const sj = await s.json();
    expect(sj.to).toBe('owner@client.test');
    expect(sj.link).toMatch(/\/portals\/owner\/co_/);
    // The company approves; the owner has the link, so it waits for the signature.
    const a = await approve(PM1, id);
    expect(a.status).toBe(202);
    expect((await a.json()).held).toBe('owner');
    expect(co(id).status).toBe('submitted');
    expect(job().contract_amount).toBe(1000000);
    // What the owner sees: the price and the change, none of the GC's internals.
    const token = tokenOf(id);
    const view = await (await ownerGet(req(`/api/owner-portal/approve/${token}`), { params: Promise.resolve({ token }) })).json();
    expect(view.changeOrder.amount).toBe(8000);
    expect(view.changeOrder.markup_overhead_pct).toBeUndefined();
    expect(view.review.open).toBe(true);
    // The owner signs: approved, on the contract, once.
    const o = await ownerDecide(token, 'approved');
    expect(o.status).toBe(200);
    expect((await o.json()).review.booked).toBe(true);
    expect(co(id).status).toBe('approved');
    expect(co(id).owner_signed_at).toBeTruthy();
    expect(job().contract_amount).toBe(1008000);
    expect(unalloc()).toBe(8000);
    // The link cannot decide twice.
    expect((await ownerDecide(token, 'approved')).status).toBe(409);
    expect(job().contract_amount).toBe(1008000);
  });

  test('the owner signs first: it waits for the tier, then books on the last approval', async () => {
    const id = await request(30000);
    as(PM1);
    await sendOwner(req(`/api/change-orders/${id}/send-to-owner`, 'POST', {}), idp(id));
    const token = tokenOf(id);
    const o = await ownerDecide(token, 'approved');
    expect(o.status).toBe(200);
    expect((await o.json()).review).toEqual(expect.objectContaining({ open: false, decision: 'approved', booked: false }));
    expect(job().contract_amount).toBe(1000000);
    expect((await approve(PM1, id)).status).toBe(202);
    expect((await approve(PM2, id)).status).toBe(200);
    expect(job().contract_amount).toBe(1030000);
  });

  test('the owner returns it with a reason; nothing moves', async () => {
    const id = await request(8000);
    as(PM1);
    await sendOwner(req(`/api/change-orders/${id}/send-to-owner`, 'POST', {}), idp(id));
    const token = tokenOf(id);
    expect((await ownerDecide(token, 'rejected')).status).toBe(400); // a reason is required
    expect((await ownerDecide(token, 'rejected', { note: 'Use the allowance' })).status).toBe(200);
    expect(co(id).status).toBe('rejected');
    expect(co(id).rejection_reason).toBe('Use the allowance');
    expect(job().contract_amount).toBe(1000000);
  });

  test("the GC records the owner's paper signature (Full only) and it books", async () => {
    const id = await request(8000);
    as(PM1);
    await sendOwner(req(`/api/change-orders/${id}/send-to-owner`, 'POST', {}), idp(id));
    expect((await approve(PM1, id)).status).toBe(202);
    as(EDITOR);
    expect((await ownerSignoff(req(`/api/change-orders/${id}/owner-signoff`, 'POST', { name: 'Kim Owner' }), idp(id))).status).toBe(403);
    as(PM1);
    expect((await ownerSignoff(req(`/api/change-orders/${id}/owner-signoff`, 'POST', { name: 'Kim Owner' }), idp(id))).status).toBe(200);
    expect(co(id).status).toBe('approved');
    expect(job().contract_amount).toBe(1008000);
  });

  test('an unknown link is not found', async () => {
    const token = 'co_doesnotexist0000000000000000';
    expect((await ownerGet(req(`/api/owner-portal/approve/${token}`), { params: Promise.resolve({ token }) })).status).toBe(404);
  });
});

describe('the record page view', () => {
  test('a request shows its tier, who approved, the contract before and after, and one next action', async () => {
    const id = await request(30000);
    await approve(PM1, id);
    as(PM2);
    const wf = (await (await workflow(req(`/api/change-orders/${id}/workflow`), idp(id))).json()).workflow;
    expect(wf.stage).toBe('cor');
    expect(wf.tier.needs).toBe('2 people with Change Orders: Full');
    expect(wf.approvers.map((a: { name: string }) => a.name)).toEqual(['Pat Manager']);
    expect(wf.money).toEqual(expect.objectContaining({ contractNow: 1000000, contractAfter: 1030000 }));
    expect(wf.next.action).toBe('approve');
    as(PM1);
    const mine = (await (await workflow(req(`/api/change-orders/${id}/workflow`), idp(id))).json()).workflow;
    expect(mine.next.action).toBe('none');
    expect(mine.you.alreadyApproved).toBe(true);
  });
});
