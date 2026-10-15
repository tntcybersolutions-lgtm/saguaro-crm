/**
 * @jest-environment node
 *
 * All 20 daily log sections through the real route: every section saves a row
 * and reads it back; bad input is refused with a plain reason; the older
 * columns the list, PDF and export read are kept in step; a log written by the
 * older screen shows its data in the sections; "copy from last log" copies.
 */
import { makeFakeDb } from './__fixtures__/fake-db';
import { describe, test, expect, beforeEach } from '@jest/globals';
declare const jest: { mock: (m: string, f: () => unknown) => void };

const fake = makeFakeDb();
let currentUser: { id: string; tenantId: string; email: string } | null = null;
jest.mock('@/lib/supabase-server', () => ({ createServerClient: () => fake.db, getUser: async () => currentUser, supabaseAdmin: {} }));
jest.mock('@/lib/storage-signing', () => ({ signStoredUrl: async (_b: string, p: string) => `signed:${p}` }));

import { NextRequest } from 'next/server';
import { GET, PUT, POST } from '@/app/api/items/[tool]/[id]/sections/route';
import { LOG_SECTIONS } from '@/lib/daily-log-sections';

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const JOB = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const LOG = 'aaaaaaaa-0000-4000-8000-0000000000d2';
const PREV = 'aaaaaaaa-0000-4000-8000-0000000000d1';
const ADMIN = { id: 'aaaaaaaa-0000-4000-8000-00000000ad01', tenantId: A, email: 'admin@a.test' };
const VIEWER = { id: 'aaaaaaaa-0000-4000-8000-00000000c001', tenantId: A, email: 'viewer@a.test' };

const req = (method: string, body?: unknown) =>
  new NextRequest(`https://saguarocontrol.net/api/items/daily_logs/${LOG}/sections`, body === undefined ? { method } : { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const p = (id = LOG) => ({ params: Promise.resolve({ tool: 'daily_logs', id }) });

/** One valid row per section, every field filled with a value of its kind. */
function sampleRow(key: string): Record<string, unknown> {
  const sec = LOG_SECTIONS.find((s) => s.key === key)!;
  return Object.fromEntries(sec.fields.map((f) => [f.key,
    f.kind === 'number' ? 4 : f.kind === 'bool' ? true : f.kind === 'time' ? '07:30' : f.kind === 'select' ? f.options![0] : `${f.label} value`]));
}

beforeEach(() => {
  fake.reset();
  fake.T('projects').push({ id: JOB, tenant_id: A, name: 'Copper Ridge' });
  fake.T('profiles').push({ id: ADMIN.id, tenant_id: A, role: 'admin' }, { id: VIEWER.id, tenant_id: A, role: 'Read-Only' });
  fake.T('role_definitions').push({ id: 'ro', tenant_id: A, name: 'Read-Only', permissions: { Projects: 'View' } });
  fake.T('user_role_assignments').push({ id: 'u1', tenant_id: A, user_id: VIEWER.id, role_id: 'ro', project_id: null });
  fake.T('daily_logs').push(
    { id: PREV, tenant_id: A, project_id: JOB, log_date: '2026-10-14', deleted_at: null, log_sections: { manpower: [{ company: 'Desert Electric', trade: 'Electrical', workers: 6, hours: 8, location: 'L2', notes: null }], equipment: [{ name: 'Scissor lift', company: null, hours_used: 6, hours_idle: 2, cost_code: null, inspected: true, notes: null }] } },
    // Written by the older daily-log screen: data in the original columns only.
    { id: LOG, tenant_id: A, project_id: JOB, log_date: '2026-10-15', deleted_at: null, log_sections: {}, weather: 'Clear', high_temp: '94', manpower_by_trade: [{ trade: 'Concrete', count: 5 }], equipment_on_site: ['Excavator'], visitors: 'City inspector', notes: 'Pour moved to Friday', work_performed: 'Formed level 3 deck', delays: 'Rain AM', delay_hours: 2 },
  );
  currentUser = ADMIN;
});

describe('daily log — all 20 sections', () => {
  test('there are exactly 20 sections', () => {
    expect(LOG_SECTIONS).toHaveLength(20);
  });

  test.each(LOG_SECTIONS.filter((s) => !s.photos).map((s) => [s.label, s.key]))('%s saves and reads back', async (_label, key) => {
    const row = sampleRow(key);
    const put = await PUT(req('PUT', { section: key, rows: [row] }), p());
    expect(put.status).toBe(200);
    const got = await (await GET(req('GET'), p())).json();
    expect(got.sections[key]).toEqual([row]);
    expect(fake.T('daily_logs').find((l) => l.id === LOG)!.log_sections[key]).toEqual([row]);
  });

  test('older logs show their data in the sections', async () => {
    const got = await (await GET(req('GET'), p())).json();
    expect(got.sections.manpower).toEqual([expect.objectContaining({ trade: 'Concrete', workers: 5 })]);
    expect(got.sections.equipment).toEqual([expect.objectContaining({ name: 'Excavator' })]);
    expect(got.sections.visitors).toEqual([expect.objectContaining({ name: 'City inspector' })]);
    expect(got.sections.notes).toEqual([expect.objectContaining({ note: 'Pour moved to Friday' })]);
    expect(got.sections.daily_report).toEqual([expect.objectContaining({ work_performed: 'Formed level 3 deck' })]);
    expect(got.sections.delays).toEqual([expect.objectContaining({ hours: 2, description: 'Rain AM' })]);
    expect(got.sections.timecards).toEqual([]);
  });

  test('saving keeps the original columns in step', async () => {
    await PUT(req('PUT', { section: 'manpower', rows: [{ company: 'Desert Electric', trade: 'Electrical', workers: 6, hours: 8 }, { company: 'AZ Concrete', trade: 'Concrete', workers: '4', hours: 10 }] }), p());
    await PUT(req('PUT', { section: 'weather', rows: [{ time_of_day: 'Morning', conditions: 'Rain', temp_f: 71, delay: true }, { time_of_day: 'Afternoon', conditions: 'Clear', temp_f: 96 }] }), p());
    await PUT(req('PUT', { section: 'delays', rows: [{ type: 'Weather', hours: 2.5, description: 'Rain stopped the pour' }] }), p());
    const log = fake.T('daily_logs').find((l) => l.id === LOG)!;
    expect(log.manpower_count).toBe(10);
    expect(log.manpower_by_trade).toEqual([{ trade: 'Electrical', company: 'Desert Electric', count: 6, hours: 8 }, { trade: 'Concrete', company: 'AZ Concrete', count: 4, hours: 10 }]);
    expect(log.weather).toBe('Rain');
    expect(log.high_temp).toBe('96');
    expect(log.low_temp).toBe('71');
    expect(log.work_stopped).toBe(true);
    expect(log.delay_hours).toBe(2.5);
    expect(log.delays).toContain('Rain stopped the pour');
  });

  test('bad input is refused with a plain reason; blank rows are dropped', async () => {
    const bad = async (body: unknown) => { const r = await PUT(req('PUT', body), p()); return { status: r.status, error: (await r.json()).error as string }; };
    expect(await bad({ section: 'nope', rows: [] })).toEqual({ status: 400, error: 'Unknown section' });
    expect((await bad({ section: 'manpower', rows: [{ company: 'X', workers: 'six' }] })).error).toBe('Manpower row 1: Workers must be a number.');
    expect((await bad({ section: 'manpower', rows: [{ trade: 'Electrical', workers: 3 }] })).error).toBe('Manpower row 1: Company is required.');
    expect((await bad({ section: 'visitors', rows: [{ name: 'Inspector', time_in: '7am' }] })).error).toBe('Visitors row 1: In must be a time like 07:30.');
    expect((await bad({ section: 'inspections', rows: [{ type: 'Fire', result: 'Maybe' }] })).error).toBe('Inspections row 1: pick a result from the list.');
    const ok = await PUT(req('PUT', { section: 'phone_calls', rows: [{}, { with: 'Owner rep', direction: 'Incoming' }] }), p());
    expect((await ok.json()).rows).toHaveLength(1);
  });

  test('copy crew and equipment from the last log', async () => {
    const r = await POST(req('POST', { copyFrom: 'previous', sections: ['manpower', 'equipment', 'scheduled_work'] }), p());
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.copiedFrom).toBe('2026-10-14');
    expect(j.sections.manpower).toEqual([expect.objectContaining({ company: 'Desert Electric', workers: 6 })]);
    expect(j.sections.equipment).toEqual([expect.objectContaining({ name: 'Scissor lift' })]);
    expect(fake.T('daily_logs').find((l) => l.id === LOG)!.manpower_count).toBe(6);
    const none = await POST(req('POST', { copyFrom: 'previous', sections: ['manpower'] }), p(PREV));
    expect(none.status).toBe(404);
  });

  test('a read-only person can see the log but not change it', async () => {
    currentUser = VIEWER;
    expect((await GET(req('GET'), p())).status).toBe(200);
    expect((await PUT(req('PUT', { section: 'notes', rows: [{ note: 'x' }] }), p())).status).toBe(403);
  });
});
