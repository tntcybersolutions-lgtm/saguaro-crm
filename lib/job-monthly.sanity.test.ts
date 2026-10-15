/**
 * @jest-environment node
 *
 * A job's money by month through the real route: billed by the month the pay
 * app went out, collected by the month it was paid, costs from live bills,
 * approved change orders by approval month; drafts, rejected bills and other
 * companies left out; a role without Budget access is refused.
 */
import { makeFakeDb } from './__fixtures__/fake-db';
import { describe, test, expect, beforeEach } from '@jest/globals';
declare const jest: { mock: (m: string, f: () => unknown) => void };

const fake = makeFakeDb();
let currentUser: { id: string; tenantId: string; email: string } | null = null;
jest.mock('@/lib/supabase-server', () => ({ createServerClient: () => fake.db, getUser: async () => currentUser, supabaseAdmin: {} }));
jest.mock('@/lib/time-zone', () => ({ requestDay: async () => ({ today: '2026-10-15', zone: 'America/Phoenix', source: 'company' }) }));

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/projects/[projectId]/monthly/route';

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';
const JOB = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const ADMIN = { id: 'aaaaaaaa-0000-4000-8000-00000000ad01', tenantId: A, email: 'a@a.test' };
const FOREMAN = { id: 'aaaaaaaa-0000-4000-8000-00000000f001', tenantId: A, email: 'f@a.test' };
const get = async () => { const r = await GET(new NextRequest(`https://x.test/api/projects/${JOB}/monthly`), { params: { projectId: JOB } }); return { status: r.status, body: await r.json() }; };

beforeEach(() => {
  fake.reset();
  currentUser = ADMIN;
  fake.T('projects').push({ id: JOB, tenant_id: A });
  fake.T('profiles').push({ id: ADMIN.id, tenant_id: A, role: 'admin' }, { id: FOREMAN.id, tenant_id: A, role: 'Foreman' });
  fake.T('role_definitions').push({ id: 'fm', tenant_id: A, name: 'Foreman', permissions: { Projects: 'Edit', Budget: 'None' } });
  fake.T('user_role_assignments').push({ id: 'u1', tenant_id: A, user_id: FOREMAN.id, role_id: 'fm', project_id: null });
  fake.T('pay_applications').push(
    { id: 'p1', tenant_id: A, project_id: JOB, status: 'paid', current_payment_due: 50000, payment_amount: 48000, submitted_at: '2026-08-31T10:00:00Z', payment_received_at: '2026-09-20T00:00:00Z', deleted_at: null },
    { id: 'p2', tenant_id: A, project_id: JOB, status: 'submitted', current_payment_due: 30000, submitted_at: '2026-09-30T10:00:00Z', deleted_at: null },
    { id: 'p3', tenant_id: A, project_id: JOB, status: 'draft', current_payment_due: 99999, submitted_at: '2026-09-30T10:00:00Z', deleted_at: null },
    { id: 'p4', tenant_id: B, project_id: JOB, status: 'paid', current_payment_due: 77777, submitted_at: '2026-09-01T10:00:00Z', deleted_at: null },
    { id: 'p5', tenant_id: A, project_id: JOB, status: 'submitted', current_payment_due: 11111, submitted_at: '2025-08-01T10:00:00Z', deleted_at: null },
  );
  fake.T('bills').push(
    { id: 'b1', tenant_id: A, project_id: JOB, total: 12000, status: 'approved', due_date: '2026-09-15' },
    { id: 'b2', tenant_id: A, project_id: JOB, total: null, amount: 3000, status: 'unpaid', due_date: null, created_at: '2026-10-02T00:00:00Z' },
    { id: 'b3', tenant_id: A, project_id: JOB, total: 5000, status: 'rejected', due_date: '2026-09-15' },
  );
  fake.T('change_orders').push(
    { id: 'c1', tenant_id: A, project_id: JOB, amount: 8500, status: 'approved', approved_at: '2026-09-05T00:00:00Z', deleted_at: null },
    { id: 'c2', tenant_id: A, project_id: JOB, amount: 9999, status: 'pending', approved_at: null, deleted_at: null },
  );
});

describe('job money by month', () => {
  test('12 months ending this month, each figure in its own month', async () => {
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body.months).toHaveLength(12);
    expect(body.months[0].month).toBe('2025-11');
    expect(body.months[11].month).toBe('2026-10');
    const m = (k: string) => body.months.find((x: { month: string }) => x.month === k);
    expect(m('2026-08')).toMatchObject({ billed: 50000, collected: 0 });
    expect(m('2026-09')).toMatchObject({ billed: 30000, collected: 48000, costs: 12000, changes: 8500 });
    expect(m('2026-10')).toMatchObject({ costs: 3000 });
    expect(body.totals).toEqual({ billed: 80000, collected: 48000, costs: 15000, changes: 8500 });
  });

  test('no Budget access, no months; another company, not found', async () => {
    currentUser = FOREMAN;
    expect((await get()).status).toBe(403);
    currentUser = { id: 'x', tenantId: B, email: 'b@b.test' };
    expect((await get()).status).toBe(404);
  });
});
