/**
 * @jest-environment node
 *
 * Budget roll-ups through the real budget route: Committed comes from the job's
 * commitments and purchase orders, Direct costs from its bills, voided and draft
 * paper is left out, cost codes match regardless of case/spacing, and the
 * forecast never sits below what is committed plus spent.
 */
import { makeFakeDb } from './__fixtures__/fake-db';
import { describe, test, expect, beforeEach } from '@jest/globals';
declare const jest: { mock: (m: string, f: () => unknown) => void };

const fake = makeFakeDb();
let currentUser: { id: string; tenantId: string; email: string } | null = null;
jest.mock('@/lib/supabase-server', () => ({ createServerClient: () => fake.db, getUser: async () => currentUser, supabaseAdmin: {} }));

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/projects/[projectId]/budget/route';

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';
const JOB = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const L1 = 'aaaaaaaa-0000-4000-8000-0000000000b1';
const L2 = 'aaaaaaaa-0000-4000-8000-0000000000b2';
const ADMIN = { id: 'aaaaaaaa-0000-4000-8000-00000000ad01', tenantId: A, email: 'admin@a.test' };

const get = async () => (await GET(new NextRequest(`https://saguarocontrol.net/api/projects/${JOB}/budget`), { params: { projectId: JOB } })).json();

beforeEach(() => {
  fake.reset();
  currentUser = ADMIN;
  fake.T('projects').push({ id: JOB, tenant_id: A, contract_amount: 1000000 });
  fake.T('budget_lines').push(
    { id: L1, tenant_id: A, project_id: JOB, cost_code: '26 05 00', description: 'Electrical', original_budget: 200000, approved_changes: 10000, committed: 5000, actual: 40000, projected: 0, percent_complete: 20 },
    { id: L2, tenant_id: A, project_id: JOB, cost_code: '03 30 00', description: 'Concrete', original_budget: 150000, approved_changes: 0, committed: 90000, actual: 10000, projected: 120000, percent_complete: 10 },
  );
  fake.T('commitments').push(
    { id: 'c1', tenant_id: A, project_id: JOB, budget_line_item_id: L1, current_amount: 180000, status: 'executed' },
    { id: 'c2', tenant_id: A, project_id: JOB, budget_line_item_id: L1, original_amount: 20000, approved_changes: 2500, current_amount: null, status: 'approved' },
    { id: 'c3', tenant_id: A, project_id: JOB, budget_line_item_id: L1, current_amount: 999999, status: 'void' },
  );
  fake.T('purchase_orders').push(
    { id: 'p1', tenant_id: A, project_id: JOB, cost_code: ' 26 05 00 ', total: 7500, status: 'issued' },
    { id: 'p2', tenant_id: A, project_id: JOB, cost_code: '26 05 00', total: 50000, status: 'draft' },
  );
  fake.T('bills').push(
    { id: 'b1', tenant_id: A, project_id: JOB, cost_code: '26 05 00', total: 12000.55, status: 'approved' },
    { id: 'b2', tenant_id: A, project_id: JOB, cost_code: '26 05 00', total: null, amount: 3000, status: 'paid' },
    { id: 'b3', tenant_id: A, project_id: JOB, cost_code: '26 05 00', total: 50000, status: 'rejected' },
    { id: 'b4', tenant_id: B, project_id: JOB, cost_code: '26 05 00', total: 77777, status: 'approved' },
  );
});

describe('budget roll-ups', () => {
  test('committed and direct costs come from live paper, dead paper and other companies left out', async () => {
    const j = await get();
    const e = j.lines.find((l: { id: string }) => l.id === L1);
    expect(e.committed_cost).toBe(180000 + 22500 + 7500);
    expect(e.committed_source).toBe('commitments');
    expect(e.direct_costs).toBe(15000.55);
    expect(e.projected_cost).toBe(225000.55);
    expect(e.revised_budget).toBe(210000);
    expect(e.forecast_cost).toBe(225000.55); // never below committed + direct
    expect(e.over_under).toBe(-15000.55);
  });

  test('a line with no commitments keeps what was entered', async () => {
    const j = await get();
    const c = j.lines.find((l: { id: string }) => l.id === L2);
    expect(c.committed_cost).toBe(90000);
    expect(c.committed_source).toBe('entered');
    expect(c.direct_costs).toBe(0);
    expect(c.forecast_cost).toBe(120000);
    expect(c.over_under).toBe(30000);
  });

  test("another company can't read the budget", async () => {
    currentUser = { id: 'x', tenantId: B, email: 'b@b.test' };
    const r = await GET(new NextRequest(`https://saguarocontrol.net/api/projects/${JOB}/budget`), { params: { projectId: JOB } });
    expect(r.status).toBe(404);
  });
});
