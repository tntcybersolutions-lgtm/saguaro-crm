/**
 * @jest-environment node
 *
 * The Reports chart library: each tile's numbers from raw rows (pure), and the
 * route — company-wide or one job, other companies never counted, a tile the
 * person's role can't see comes back empty, and empty modules hide (null).
 */
import { makeFakeDb } from './__fixtures__/fake-db';
import { describe, test, expect, beforeEach } from '@jest/globals';
import { buildReportSummary, monthCount, rangeStart, parseRange } from './reports';
import { toCsv } from './report-csv';
declare const jest: { mock: (m: string, f: () => unknown) => void };

const fake = makeFakeDb();
let currentUser: { id: string; tenantId: string; email: string } | null = null;
jest.mock('@/lib/supabase-server', () => ({ createServerClient: () => fake.db, getUser: async () => currentUser, supabaseAdmin: {} }));
jest.mock('@/lib/time-zone', () => ({ requestDay: async () => ({ today: '2026-10-15', zone: 'America/Phoenix', source: 'company' }) }));

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/reports/summary/route';

const TODAY = '2026-10-15';
const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';
const J1 = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const J2 = 'aaaaaaaa-0000-4000-8000-0000000000a2';
const JB = 'bbbbbbbb-0000-4000-8000-0000000000b1';
const ADMIN = { id: 'aaaaaaaa-0000-4000-8000-00000000ad01', tenantId: A, email: 'a@a.test' };
const FIELD = { id: 'aaaaaaaa-0000-4000-8000-00000000f001', tenantId: A, email: 'f@a.test' };

describe('range helpers', () => {
  test('range start, month count, parse', () => {
    expect(rangeStart(TODAY, '90d')).toBe('2026-07-18');
    expect(rangeStart(TODAY, '12m')).toBe('2025-10-16');
    expect(rangeStart(TODAY, 'all')).toBeNull();
    expect(monthCount(TODAY, '90d', null)).toBe(3);
    expect(monthCount(TODAY, 'all', '2023-01')).toBe(46);
    expect(monthCount(TODAY, 'all', '2026-06')).toBe(12);
    expect(monthCount(TODAY, 'all', '1990-01')).toBe(60);
    expect(parseRange('junk')).toBe('12m');
  });

  test('csv quotes and defuses formulas', () => {
    expect(toCsv(['Job', 'Amount'], [['Smith, Main St', -1200], ['=HYPERLINK("x")', 5]]))
      .toBe('Job,Amount\r\n"Smith, Main St","-1200"\r\n"\'=HYPERLINK(""x"")",5\r\n');
  });
});

describe('tiles from rows', () => {
  const base = { today: TODAY, range: '12m' as const, projects: [{ id: J1, name: 'Tower', contract_amount: 1_000_000 }, { id: J2, name: 'Clinic', revised_contract_value: 400_000 }] };

  test('nothing anywhere → every tile null', () => {
    const s = buildReportSummary({ ...base, payApps: [], bills: [], budgetLines: [], changeOrders: [], rfis: [], submittals: [], punch: [], incidents: [], tasks: [] });
    expect([s.money, s.budget, s.rfis, s.submittals, s.punch, s.changeOrders, s.safety, s.schedule]).toEqual([null, null, null, null, null, null, null, null]);
    // Contract tile still shows: the jobs carry contracts, nothing billed yet.
    expect(s.contract?.totals).toEqual({ contract: 1_400_000, billed: 0, remaining: 1_400_000 });
  });

  test('a module the person cannot see stays null', () => {
    const s = buildReportSummary({ ...base, payApps: null, rfis: null });
    expect(s.money).toBeNull(); expect(s.contract).toBeNull(); expect(s.rfis).toBeNull();
  });

  test('each tile adds up', () => {
    const s = buildReportSummary({
      ...base,
      payApps: [
        { id: 'p1', project_id: J1, status: 'paid', current_payment_due: 50_000, payment_amount: 48_000, total_completed_stored: 300_000, submitted_at: '2026-08-31', payment_received_at: '2026-09-20' },
        { id: 'p2', project_id: J1, status: 'draft', current_payment_due: 99_999, total_completed_stored: 999_999, submitted_at: '2026-09-30' },
      ],
      bills: [{ project_id: J1, total: 12_000, status: 'approved', due_date: '2026-09-15' }],
      budgetLines: [
        { project_id: J1, original_budget: 100_000, approved_changes: 10_000, projected: 120_000 },
        { project_id: J2, original_budget: 50_000, approved_changes: 0, projected: 0, actual: 20_000 },
      ],
      changeOrders: [
        { project_id: J1, amount: 8_500, status: 'approved', approved_at: '2026-09-05' },
        { project_id: J1, amount: 4_000, status: 'pending' },
        { project_id: J2, amount: 1_000, status: 'rejected' },
      ],
      rfis: [
        { status: 'open', created_at: '2026-10-01' },
        { status: 'closed', submitted_at: '2026-09-01', closed_at: '2026-09-11' },
        { status: 'answered', created_at: '2026-09-10', answered_at: '2026-09-14' },
      ],
      submittals: [
        { status: 'approved', submitted_at: '2026-09-01', returned_at: '2026-09-15' },
        { status: 'pending', created_at: '2026-10-01' },
        { status: 'pending', created_at: '2024-01-01' },
      ],
      punch: [{ status: 'open', trade: 'Drywall' }, { status: 'in_progress', trade: 'Drywall' }, { status: 'completed', trade: 'Paint' }, { status: 'open', trade: '' }],
      incidents: [{ incident_date: '2026-09-25' }, { incident_date: '2026-10-10', near_miss: true }],
      tasks: [
        { project_id: J1, status: 'completed', end_date: '2026-09-01' },
        { project_id: J1, status: 'in_progress', end_date: '2026-10-01' },
        { project_id: J1, status: 'not_started', end_date: '2026-12-01', baseline_end: '2026-11-01' },
        { project_id: J2, status: 'not_started', end_date: '2026-12-01' },
      ],
    });
    expect(s.money?.totals).toEqual({ billed: 50_000, collected: 48_000, costs: 12_000, changes: 8_500 });
    expect(s.money?.months).toHaveLength(12);
    expect(s.contract?.rows[0]).toEqual({ projectId: J1, name: 'Tower', contract: 1_000_000, billed: 300_000, remaining: 700_000 });
    // J1: budget 110k, forecast 120k → 10k over. J2: no forecast → max(50k, 20k) = 50k → even.
    expect(s.budget?.rows.map((r) => [r.name, r.variance])).toEqual([['Tower', -10_000], ['Clinic', 0]]);
    expect(s.budget?.overCount).toBe(1);
    expect(s.rfis).toMatchObject({ openNow: 1, avgDays: 7, answered: 2 });
    expect(s.rfis?.months.find((m) => m.month === '2026-09')).toMatchObject({ opened: 2, closed: 2 });
    expect(s.submittals).toMatchObject({ total: 2, avgReviewDays: 14 });
    expect(s.submittals?.byStatus.map((x) => x.label)).toEqual(['Approved', 'Pending']);
    expect(s.punch).toEqual({ open: 3, byTrade: [{ trade: 'Drywall', count: 2 }, { trade: 'No trade', count: 1 }] });
    expect(s.changeOrders).toMatchObject({ approvedTotal: 8_500, pendingTotal: 4_000, pendingCount: 1 });
    expect(s.safety).toMatchObject({ total: 1, daysSinceLast: 20, lastDate: '2026-09-25' });
    // J1: 1 on time, 2 late (overdue; slipped past baseline). J2: 1 on time.
    expect(s.schedule).toMatchObject({ total: 4, late: 2, pctOnTime: 50 });
    expect(s.schedule?.rows[0]).toMatchObject({ name: 'Tower', onTime: 1, late: 2, pctOnTime: 33 });
  });
});

const get = async (qs = '') => { const r = await GET(new NextRequest(`https://x.test/api/reports/summary${qs}`)); return { status: r.status, body: await r.json() }; };

describe('GET /api/reports/summary', () => {
  beforeEach(() => {
    fake.reset();
    currentUser = ADMIN;
    fake.T('projects').push({ id: J1, tenant_id: A, name: 'Tower', contract_amount: 1_000_000, deleted_at: null }, { id: J2, tenant_id: A, name: 'Clinic', contract_amount: 200_000, deleted_at: null }, { id: JB, tenant_id: B, name: 'Other co', contract_amount: 9_000_000, deleted_at: null });
    fake.T('profiles').push({ id: ADMIN.id, tenant_id: A, role: 'admin' }, { id: FIELD.id, tenant_id: A, role: 'Field' });
    fake.T('role_definitions').push({ id: 'fd', tenant_id: A, name: 'Field', permissions: { Projects: 'View', Reports: 'View', RFIs: 'View', Budget: 'None', 'Change Orders': 'None' } });
    fake.T('user_role_assignments').push({ id: 'u1', tenant_id: A, user_id: FIELD.id, role_id: 'fd', project_id: null });
    fake.T('rfis').push(
      { id: 'r1', tenant_id: A, project_id: J1, status: 'open', created_at: '2026-10-01', deleted_at: null },
      { id: 'r2', tenant_id: A, project_id: J2, status: 'open', created_at: '2026-10-02', deleted_at: null },
      { id: 'r3', tenant_id: B, project_id: JB, status: 'open', created_at: '2026-10-02', deleted_at: null },
    );
    fake.T('change_orders').push({ id: 'c1', tenant_id: A, project_id: J1, amount: 5000, status: 'pending', deleted_at: null });
  });

  test('company-wide: own company only; empty modules null', async () => {
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body.rfis.openNow).toBe(2);
    expect(body.contract.totals.contract).toBe(1_200_000);
    expect(body.changeOrders.pendingTotal).toBe(5000);
    expect(body.punch).toBeNull();
    expect(body.safety).toBeNull();
  });

  test('one job narrows every tile; another company’s job is not found', async () => {
    const one = await get(`?projectId=${J2}`);
    expect(one.body.rfis.openNow).toBe(1);
    expect(one.body.contract.rows.map((r: { name: string }) => r.name)).toEqual(['Clinic']);
    expect(one.body.changeOrders).toBeNull();
    expect((await get(`?projectId=${JB}`)).status).toBe(404);
    expect((await get('?projectId=nope')).status).toBe(400);
  });

  test('a role without Budget or Change Orders sees neither', async () => {
    currentUser = FIELD;
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body.rfis.openNow).toBe(2);
    expect(body.contract).toBeNull();
    expect(body.money).toBeNull();
    expect(body.changeOrders).toBeNull();
    currentUser = null;
    expect((await get()).status).toBe(401);
  });
});
