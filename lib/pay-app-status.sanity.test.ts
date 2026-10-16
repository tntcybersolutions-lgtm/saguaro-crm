/**
 * @jest-environment node
 *
 * Pay-application status through the real routes:
 *   - every door (submit / approve / certify / paid / PATCH / owner link)
 *     writes its stamps and fires its cascade exactly once;
 *   - certifying an app that was never approved also approves it (waivers);
 *   - the owner's link shows real figures, refuses a second decision and says
 *     when the first one was made; an unknown link is a 404, never sample data;
 *   - the payment gate ignores deleted waivers;
 *   - printing a G702 for an app with no schedule of values leaves its money alone.
 */
import { makeFakeDb } from './__fixtures__/fake-db';
import { describe, test, expect, beforeEach } from '@jest/globals';
declare const jest: { mock: (m: string, f: () => unknown) => void };

const fake = makeFakeDb();
const fired: string[] = [];
const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const USER = { id: 'aaaaaaaa-0000-4000-8000-00000000ad01', tenantId: A, email: 'pm@a.test' };

jest.mock('@/lib/supabase-server', () => ({ createServerClient: () => fake.db, getUser: async () => USER, supabaseAdmin: {} }));
jest.mock('@/lib/permissions', () => ({
  requirePermission: async () => ({ ok: true, user: USER, db: fake.db }),
}));
jest.mock('@/lib/triggers', () => ({
  onPayAppSubmitted: async (id: string) => { fired.push(`submitted:${id}`); },
  onPayAppApproved: async (id: string) => { fired.push(`approved:${id}`); },
  onPayAppCertified: async (id: string) => { fired.push(`certified:${id}`); },
}));
jest.mock('@/lib/background', () => ({ runInBackground: (p: Promise<unknown>) => { void p; } }));
jest.mock('@/lib/pdf-engine', () => ({
  generateG702: async () => new Uint8Array([1]),
  generateG703: async () => new Uint8Array([2]),
  saveDocument: async (_p: string, kind: string) => `files/${kind}.pdf`,
  resolveBranding: async () => ({}),
}));

import { NextRequest } from 'next/server';
import { POST as submit } from '@/app/api/pay-apps/[id]/submit/route';
import { POST as approve } from '@/app/api/pay-apps/[id]/approve/route';
import { POST as certify } from '@/app/api/pay-apps/[id]/certify/route';
import { POST as paid } from '@/app/api/pay-apps/[id]/paid/route';
import { PATCH as patchPayApp } from '@/app/api/pay-apps/[id]/route';
import { GET as ownerGet, POST as ownerPost } from '@/app/api/owner-portal/approve/[token]/route';
import { POST as pdf } from '@/app/api/documents/pay-application/route';

const JOB = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const PA = 'aaaaaaaa-0000-4000-8000-0000000000b1';
const req = (url: string, method = 'POST', body?: unknown) =>
  new NextRequest(`https://saguarocontrol.net${url}`, body === undefined ? { method } : { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const p = (id: string) => ({ params: Promise.resolve({ id }) });
const tok = (token: string) => ({ params: Promise.resolve({ token }) });
const row = () => fake.T('pay_applications').find((r) => r.id === PA)!;

beforeEach(() => {
  fake.reset();
  fired.length = 0;
  fake.T('projects').push({ id: JOB, tenant_id: A, name: 'Copper Ridge Clinic', address: '1 Main' });
  fake.T('pay_applications').push({
    id: PA, tenant_id: A, project_id: JOB, app_number: 3, status: 'draft', deleted_at: null,
    contract_sum: 500000, change_orders_total: 0, current_payment_due: 42750.5,
    total_completed_stored: 50000, total_retainage: 5000, total_earned_less_retainage: 45000,
    less_previous_certificates: 2249.5, percent_complete: 10, retainage_percent: 10,
    prev_completed: 20000, this_period: 30000, stored_materials: 0,
    internal_notes: 'GC margin 18%', approved_at: null, certified_at: null, owner_approval_token: null,
  });
  fake.T('contracts').push({ id: 'prime', tenant_id: A, project_id: JOB, contract_type: 'prime', paid_amount: 0 });
});

describe('one transition for every door', () => {
  test('submit issues the owner token and fires the owner email once', async () => {
    const r = await submit(req(`/api/pay-apps/${PA}/submit`), p(PA));
    expect(r.status).toBe(200);
    expect(row().status).toBe('submitted');
    expect(row().submitted_at).toBeTruthy();
    expect(row().owner_approval_token).toBeTruthy();
    expect(fired).toEqual([`submitted:${PA}`]);
  });

  test('PATCH status=approved stamps approved_at and runs the waiver cascade; a second PATCH is a no-op', async () => {
    row().status = 'submitted';
    const r = await patchPayApp(req(`/api/pay-apps/${PA}`, 'PATCH', { status: 'approved' }), p(PA));
    expect(r.status).toBe(200);
    expect(row().approved_at).toBeTruthy();
    expect(fired).toEqual([`approved:${PA}`]);
    await patchPayApp(req(`/api/pay-apps/${PA}`, 'PATCH', { status: 'approved' }), p(PA));
    expect(fired).toEqual([`approved:${PA}`]);
  });

  test('PATCH status=certified on a submitted app approves it too (waivers) and stamps certified_at', async () => {
    row().status = 'submitted';
    const r = await patchPayApp(req(`/api/pay-apps/${PA}`, 'PATCH', { status: 'certified' }), p(PA));
    expect(r.status).toBe(200);
    expect(row().approved_at).toBeTruthy();
    expect(row().certified_at).toBeTruthy();
    expect(fired.sort()).toEqual([`approved:${PA}`, `certified:${PA}`].sort());
  });

  test('certify via its endpoint after approve fires certify only', async () => {
    row().status = 'submitted';
    await approve(req(`/api/pay-apps/${PA}/approve`), p(PA));
    await certify(req(`/api/pay-apps/${PA}/certify`), p(PA));
    expect(fired).toEqual([`approved:${PA}`, `certified:${PA}`]);
  });

  test('PATCH status=paid stamps the paid date and updates the prime contract once; paying again is refused', async () => {
    row().status = 'certified';
    const r = await patchPayApp(req(`/api/pay-apps/${PA}`, 'PATCH', { status: 'paid' }), p(PA));
    expect(r.status).toBe(200);
    expect(row().payment_received_at).toBeTruthy();
    expect(fake.T('contracts')[0].paid_amount).toBe(42750.5);
    const again = await paid(req(`/api/pay-apps/${PA}/paid`), p(PA));
    expect(again.status).toBe(200);
    expect((await again.json()).changed).toBe(false);
    expect(fake.T('contracts')[0].paid_amount).toBe(42750.5);
  });

  test('a draft cannot jump to paid', async () => {
    const r = await paid(req(`/api/pay-apps/${PA}/paid`), p(PA));
    expect(r.status).toBe(409);
    expect(row().status).toBe('draft');
  });

  test('the payment gate ignores a deleted unsigned waiver but holds on a live one', async () => {
    row().status = 'certified';
    fake.T('lien_waivers').push({ id: 'w1', tenant_id: A, pay_application_id: PA, status: 'pending', deleted_at: '2026-10-01T00:00:00Z', blocks_payment: true });
    const ok = await paid(req(`/api/pay-apps/${PA}/paid`), p(PA));
    expect(ok.status).toBe(200);
    row().status = 'certified';
    fake.T('lien_waivers').push({ id: 'w2', tenant_id: A, pay_application_id: PA, status: 'pending', deleted_at: null, blocks_payment: true, company_name: 'Mesa Electric' });
    const held = await paid(req(`/api/pay-apps/${PA}/paid`), p(PA));
    expect(held.status).toBe(409);
    expect((await held.json()).waiverBlock).toBe(true);
  });
});

describe("the owner's link", () => {
  test('an unknown token is a 404 with no figures', async () => {
    const r = await ownerGet(req('/api/owner-portal/approve/nope', 'GET'), tok('nope'));
    expect(r.status).toBe(404);
    const body = await r.json();
    expect(JSON.stringify(body)).not.toMatch(/Riverdale|257,?400/);
    expect(body.payApp).toBeUndefined();
  });

  test('shows the real figures, never internal notes, and is open while submitted', async () => {
    await submit(req(`/api/pay-apps/${PA}/submit`), p(PA));
    const token = String(row().owner_approval_token);
    const r = await ownerGet(req(`/api/owner-portal/approve/${token}`, 'GET'), tok(token));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.payApp.current_payment_due).toBe(42750.5);
    expect(body.project.name).toBe('Copper Ridge Clinic');
    expect(body.payApp.internal_notes).toBeUndefined();
    expect(body.payApp.tenant_id).toBeUndefined();
    expect(body.review).toEqual({ open: true, decision: null, decidedAt: null });
  });

  test('approve once runs the approval; the second decision is refused with the date of the first', async () => {
    await submit(req(`/api/pay-apps/${PA}/submit`), p(PA));
    const token = String(row().owner_approval_token);
    fired.length = 0;
    const r = await ownerPost(req(`/api/owner-portal/approve/${token}`, 'POST', { action: 'approved', note: 'Looks right' }), tok(token));
    expect(r.status).toBe(200);
    expect(row().status).toBe('approved');
    expect(row().approval_notes).toBe('Looks right');
    expect(fired).toEqual([`approved:${PA}`]);
    const again = await ownerPost(req(`/api/owner-portal/approve/${token}`, 'POST', { action: 'rejected' }), tok(token));
    expect(again.status).toBe(409);
    const b = await again.json();
    expect(b.review.decision).toBe('approved');
    expect(b.review.decidedAt).toBe(row().approved_at);
    const view = await (await ownerGet(req(`/api/owner-portal/approve/${token}`, 'GET'), tok(token))).json();
    expect(view.review.open).toBe(false);
  });

  test('a return goes back to the GC with the reason, and a resubmission reopens the same link', async () => {
    await submit(req(`/api/pay-apps/${PA}/submit`), p(PA));
    const token = String(row().owner_approval_token);
    await ownerPost(req(`/api/owner-portal/approve/${token}`, 'POST', { action: 'rejected', note: 'Line 4 is high' }), tok(token));
    expect(row().status).toBe('rejected');
    expect(row().rejection_reason).toBe('Line 4 is high');
    expect(row().approved_at).toBeNull();
    await submit(req(`/api/pay-apps/${PA}/submit`), p(PA));
    expect(row().owner_approval_token).toBe(token);
    const view = await (await ownerGet(req(`/api/owner-portal/approve/${token}`, 'GET'), tok(token))).json();
    expect(view.review.open).toBe(true);
  });
});

describe('G702 PDF never rewrites money from an empty schedule of values', () => {
  test('no SOV lines: PDF links saved, every money column untouched', async () => {
    const before = { ...row() };
    const r = await pdf(req('/api/documents/pay-application', 'POST', { payAppId: PA, projectId: JOB }));
    expect(r.status).toBe(200);
    expect(row().g702_pdf_url).toBe('files/g702.pdf');
    for (const k of ['current_payment_due', 'total_retainage', 'total_earned_less_retainage', 'less_previous_certificates', 'percent_complete', 'total_completed_stored']) {
      expect(row()[k]).toBe(before[k]);
    }
  });

  test('with SOV lines on a draft, the computed totals are stored', async () => {
    fake.T('schedule_of_values').push({ id: 's1', tenant_id: A, pay_app_id: PA, line_number: 1, description: 'Concrete', scheduled_value: 100000, prev_completed: 0, this_period: 10000, stored_materials: 0 });
    fake.T('pay_applications').push({ id: 'prior', tenant_id: A, project_id: JOB, app_number: 2, total_earned_less_retainage: 0, total_retainage: 0, deleted_at: null });
    const r = await pdf(req('/api/documents/pay-application', 'POST', { payAppId: PA, projectId: JOB }));
    expect(r.status).toBe(200);
    expect(row().total_retainage).toBe(1000);
    expect(row().current_payment_due).toBe(9000);
  });
});
