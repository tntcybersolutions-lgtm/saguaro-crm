/**
 * @jest-environment node
 *
 * Budget roll-ups through the real budget route: Committed comes from the job's
 * commitments and purchase orders, Direct costs from its bills, voided and draft
 * paper is left out, cost codes match regardless of case/spacing, a bill on a
 * committed line draws the commitment down (only spend beyond it is direct
 * cost), and the forecast never sits below committed or spent.
 */
import { makeFakeDb } from './__fixtures__/fake-db';
import { describe, test, expect, beforeEach } from '@jest/globals';
declare const jest: { mock: (m: string, f: () => unknown) => void };

const fake = makeFakeDb();
let currentUser: { id: string; tenantId: string; email: string } | null = null;
jest.mock('@/lib/supabase-server', () => ({ createServerClient: () => fake.db, getUser: async () => currentUser, supabaseAdmin: {} }));

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/projects/[projectId]/budget/route';
import { budgetTotals } from './budget-rollup';

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';
const JOB = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const L1 = 'aaaaaaaa-0000-4000-8000-0000000000b1';
const L2 = 'aaaaaaaa-0000-4000-8000-0000000000b2';
const LI1 = 'aaaaaaaa-0000-4000-8000-0000000000c1';
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
  /* commitments.budget_line_item_id references budget_LINE_ITEMS (the live
     FK), never budget_lines — the line is found through that row's code. */
  fake.T('budget_line_items').push({ id: LI1, tenant_id: A, project_id: JOB, cost_code: '26 05 00', csi_division: '26' });
  fake.T('commitments').push(
    { id: 'c1', tenant_id: A, project_id: JOB, budget_line_item_id: LI1, current_amount: 180000, status: 'executed' },
    { id: 'c2', tenant_id: A, project_id: JOB, budget_line_item_id: null, csi_division: '26', original_amount: 20000, approved_changes: 2500, current_amount: null, status: 'approved' },
    { id: 'c3', tenant_id: A, project_id: JOB, budget_line_item_id: LI1, current_amount: 999999, status: 'void' },
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
    expect(e.billed_to_date).toBe(15000.55);
    expect(e.direct_costs).toBe(0); // billed against the commitment, not on top of it
    expect(e.projected_cost).toBe(210000);
    expect(e.revised_budget).toBe(210000);
    expect(e.forecast_cost).toBe(210000);
    expect(e.over_under).toBe(0);
  });

  test('a sub billed in full counts once; spend beyond the commitment is the overrun', async () => {
    fake.T('bills').push({ id: 'b5', tenant_id: A, project_id: JOB, cost_code: '26 05 00', amount: 200000, tax: 16500, total: 216500, status: 'paid' });
    const e = (await get()).lines.find((l: { id: string }) => l.id === L1);
    expect(e.billed_to_date).toBe(215000.55); // before tax
    expect(e.direct_costs).toBe(5000.55);
    expect(e.projected_cost).toBe(215000.55);
    expect(e.over_under).toBe(-5000.55);
  });

  test('bills on a line with nothing committed are all direct cost', async () => {
    fake.T('budget_lines').push({ id: 'L3', tenant_id: A, project_id: JOB, cost_code: '01 70 00', description: 'General conditions', original_budget: 50000, approved_changes: 0, committed: 0, actual: 0, projected: 0, percent_complete: 0 });
    fake.T('bills').push({ id: 'b6', tenant_id: A, project_id: JOB, cost_code: '01 70 00', amount: 2840, tax: 234.3, total: 3074.3, status: 'paid' });
    const g = (await get()).lines.find((l: { id: string }) => l.id === 'L3');
    expect(g.direct_costs).toBe(2840);
    expect(g.projected_cost).toBe(2840);
  });

  test("a bid award's commitment and its draft PO count once", async () => {
    const PKG = 'aaaaaaaa-0000-4000-8000-0000000000e1';
    // The award trigger leaves budget_line_item_id and csi_division empty when the
    // package has no division; the award PO carries the trade name instead.
    fake.T('commitments').push({ id: 'c4', tenant_id: A, project_id: JOB, budget_line_item_id: null, csi_division: null, original_amount: 60000, current_amount: 60000, status: 'active', bid_package_id: PKG });
    fake.T('purchase_orders').push({ id: 'p3', tenant_id: A, project_id: JOB, cost_code: 'Concrete', total: 60000, status: 'draft', notes: `Auto-generated on bid award (package ${PKG}). Committed cost.` });
    const c = (await get()).lines.find((l: { id: string }) => l.id === L2);
    expect(c.committed_cost).toBe(60000);
    expect(c.committed_source).toBe('commitments');
  });

  test('the contract is original + approved change orders (lib/job-contract)', async () => {
    fake.T('projects')[0].original_contract_amount = 950000;
    fake.T('change_orders').push(
      { id: 'co1', tenant_id: A, project_id: JOB, status: 'approved', amount: 50000 },
      { id: 'co2', tenant_id: A, project_id: JOB, status: 'pending', amount: 9999 },
    );
    expect((await get()).contract).toBe(1000000);
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
  test('totals measure Uncommitted and Remaining against the REVISED budget', async () => {
    const j = await get();
    const t = j.totals;
    expect(t.original).toBe(350000);
    expect(t.approvedChanges).toBe(10000);
    expect(t.revised).toBe(360000); // original + approved changes
    expect(t.committed).toBe(210000 + 90000);
    expect(t.uncommitted).toBe(360000 - 300000);
    expect(t.actual).toBe(50000);
    expect(t.remaining).toBe(360000 - 50000);
    // Budget screen's cost to complete: Σ revised − actual − committed not yet spent.
    expect(t.costToComplete).toBe((210000 - 40000 - (210000 - 40000)) + (150000 - 10000 - (90000 - 10000)));
  });
});

describe('budgetTotals — the Pima job (759aa973) as it stands on production', () => {
  // 10 budget lines; $127,650 of approved changes on 23-0900 and 23-0901.
  const L = (o: number, a: number, c: number, act: number) => ({ original_budget: o, approved_cos: a, revised_budget: o + a, committed_cost: c, actual_cost: act, forecast_cost: Math.max(o + a, c, act) });
  const pima = [
    L(226006, 0, 226006, 226006), L(108000, 0, 108000, 108000), L(23394, 0, 23394, 10850),
    L(164000, 0, 164000, 164000), L(486200, 52400, 538600, 534100), L(220000, 75250, 295250, 297400),
    L(38400, 0, 38400, 36900), L(612000, 0, 612000, 612000), L(438000, 0, 438000, 438000), L(96000, 0, 96000, 96000),
  ];
  const t = budgetTotals(pima);
  test('revised is original + approved changes', () => {
    expect(t.original).toBe(2412000);
    expect(t.revised).toBe(2539650);
  });
  test('Purchase orders Uncommitted is $0, not −$127,650', () => expect(t.uncommitted).toBe(0));
  test('Bills Budget remaining is $16,394, not −$111,256', () => expect(t.remaining).toBe(16394));
  test('Budget cost to complete is −$2,150, the same roll-up', () => expect(t.costToComplete).toBe(-2150));
});
