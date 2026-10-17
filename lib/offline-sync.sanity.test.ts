/**
 * @jest-environment node
 *
 * Offline field work, end to end through the real outbox (lib/offline/outbox)
 * and the real route handlers: a daily log, a clock-in/out and a photo written
 * with no signal are kept on the phone, sent when the signal is back, and —
 * when a send reaches the server but its answer is lost — sent again with the
 * same client id and accepted exactly once. Only IndexedDB, the database, file
 * storage and the session are faked.
 */
import { makeFakeDb } from './__fixtures__/fake-db';
import { installFakeIndexedDb } from './__fixtures__/fake-idb';
import { describe, test, expect, beforeEach } from '@jest/globals';
// `jest` stays the global so the SWC transform hoists jest.mock above the imports.
declare const jest: { mock: (m: string, f: () => unknown) => void };

const fake = makeFakeDb();
const idb = installFakeIndexedDb();
const TENANT = 'aaaaaaaa-0000-4000-8000-000000000001';
const JOB = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const user = { id: 'aaaaaaaa-0000-4000-8000-0000000000u1', tenantId: TENANT, email: 'super@example.com' };

jest.mock('@/lib/supabase-server', () => ({ createServerClient: () => fake.db, getUser: async () => user, supabaseAdmin: {} }));
jest.mock('@/lib/permissions', () => ({ requirePermission: async () => ({ ok: true, user, db: fake.db }) }));
jest.mock('@/lib/supabase-browser', () => ({ getAuthHeaders: async () => ({}), getSupabaseBrowser: () => null }));
jest.mock('@/lib/ui/status', () => ({ step: () => ({ done() {}, fail() {}, offline() {}, update() {} }), getStatusGroups: () => [] }));
jest.mock('@/lib/ui/status-labels', () => ({ describeRequest: () => null }));
jest.mock('@/lib/ui/status-fetch', () => ({ STATUS_HEADER: 'x-saguaro-status', reasonFromResponse: async () => '' }));
jest.mock('@/lib/media-upload', () => ({ uploadPhoto: async () => ({}), uploadVideo: async () => ({}) }));
jest.mock('@/lib/learning', () => ({ recordLearning: () => undefined }));
jest.mock('@/lib/storage-signing', () => ({ signFields: async (rows: Record<string, unknown>[]) => rows, signStoredUrl: async (_b: string, p: string) => p }));
jest.mock('@/lib/image-thumb', () => ({ UnsupportedImageError: class extends Error {} }));
jest.mock('@/lib/photo-store', () => {
  class PhotoStoreError extends Error { constructor(public status: number, m: string, public detail?: unknown) { super(m); } }
  return {
    PHOTO_BUCKET: 'project-photos',
    PhotoStoreError,
    safeObjectName: (n: string) => n.replace(/[^A-Za-z0-9._-]/g, '_'),
    downloadStaged: async () => Buffer.from('jpeg'),
    removeQuietly: async () => undefined,
    // The real insertPhotoRow's shape: core columns + `extra` spread in, unique client id enforced by the db.
    storePhoto: async (db: typeof fake.db, m: { tenantId: string; projectId: string; extra?: Record<string, unknown> }) => {
      const { data, error } = (await db.from('photos').insert({ tenant_id: m.tenantId, project_id: m.projectId, url: 'u', ...(m.extra || {}) }).select().single()) as { data: unknown; error: unknown };
      if (error) throw new PhotoStoreError(500, 'Failed to save photo', error);
      return { photo: data };
    },
  };
});

import { NextRequest } from 'next/server';
import { POST as createLog } from '@/app/api/daily-logs/create/route';
import { POST as clockIn } from '@/app/api/timeclock/in/route';
import { POST as clockOut } from '@/app/api/timeclock/out/route';
import { POST as photoUploadUrl } from '@/app/api/photos/upload-url/route';
import { POST as photoIngest } from '@/app/api/photos/ingest/route';
import { sendOrSave, drainOutbox, listSaved, refreshPending, getNetState, retryAllStuck, MAX_ATTEMPTS } from '@/lib/offline/outbox';
import { CLIENT_ID_HEADER } from '@/lib/offline/client-id';

/* ── the phone ─────────────────────────────────────────────────────────── */
let online = true;
Object.defineProperty(globalThis, 'navigator', { value: { get onLine() { return online; } }, configurable: true, writable: true });
(globalThis as unknown as { window: EventTarget }).window = new EventTarget();

const ROUTES: Record<string, (r: NextRequest) => Promise<Response>> = {
  '/api/daily-logs/create': createLog,
  '/api/timeclock/in': clockIn,
  '/api/timeclock/out': clockOut,
};
/** How many of the next sends reach the server but lose their answer. */
let loseAnswers = 0;
const sent: Array<{ url: string; clientId: string | null }> = [];
(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (url: string, init: RequestInit = {}) => {
  if (!online) throw new TypeError('Failed to fetch');
  const handler = ROUTES[url];
  if (!handler) throw new Error(`no fake route for ${url}`);
  const req = new NextRequest(`https://app.test${url}`, { method: init.method, headers: init.headers as HeadersInit, body: init.body as BodyInit | undefined });
  sent.push({ url, clientId: req.headers.get(CLIENT_ID_HEADER) });
  const res = await handler(req);
  if (loseAnswers > 0) { loseAnswers--; throw new TypeError('Failed to fetch'); } // the server did it; the phone never heard
  return res;
}) as unknown as typeof fetch;

const req = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(`https://app.test${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

beforeEach(() => {
  fake.reset();
  idb.reset();
  online = true;
  loseAnswers = 0;
  sent.length = 0;
  fake.T('projects').push({ id: JOB, tenant_id: TENANT, name: 'Main St', updated_at: '2026-10-01' });
  fake.T('employees').push({ id: 'aaaaaaaa-0000-4000-8000-0000000000e1', tenant_id: TENANT, user_id: user.id, email: user.email, first_name: 'Pat', last_name: 'Lee', full_name: 'Pat Lee' });
  fake.T('tenants').push({ id: TENANT, time_zone: 'America/Phoenix' });
});

describe('daily log written with no signal', () => {
  test('kept on the phone, then sent once — a lost answer is replayed with the same client id and makes no second row', async () => {
    online = false;
    const r = await sendOrSave({ url: '/api/daily-logs/create', method: 'POST', body: { projectId: JOB, logDate: '2026-10-16', weather: 'Clear', workPerformed: 'Footings' }, projectId: JOB, kind: 'daily-log', label: 'Daily log' });
    expect(r.saved).toBe(true);
    expect(fake.T('daily_logs')).toHaveLength(0);
    await refreshPending();
    expect(getNetState().pending).toBe(1);

    // Signal back, but the first send's answer is lost on the way back.
    online = true;
    loseAnswers = 1;
    await drainOutbox();
    expect(fake.T('daily_logs')).toHaveLength(1);
    expect(await listSaved()).toHaveLength(1); // the phone doesn't know it landed

    // Next try: same client id, the server says "already have it".
    await drainOutbox();
    expect(await listSaved()).toHaveLength(0);
    expect(fake.T('daily_logs')).toHaveLength(1);
    expect(sent).toHaveLength(2);
    expect(sent[0].clientId).toBeTruthy();
    expect(sent[1].clientId).toBe(sent[0].clientId);
    expect(fake.T('daily_logs')[0].client_id).toBe(sent[0].clientId);
    expect(getNetState().failed).toBe(0);
  });

  test('route: the same client id twice → one row, the second answer is the first log', async () => {
    const h = { [CLIENT_ID_HEADER]: 'log-0001-aaaa' };
    const body = { projectId: JOB, logDate: '2026-10-15', weather: 'Clear' };
    const a = await createLog(req('/api/daily-logs/create', body, h));
    const b = await createLog(req('/api/daily-logs/create', body, h));
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const [ja, jb] = [await a.json(), await b.json()];
    expect(jb.replayed).toBe(true);
    expect(jb.log.id).toBe(ja.log.id);
    expect(fake.T('daily_logs')).toHaveLength(1);
  });
});

describe('clock in / out with no signal', () => {
  test('both punches kept, sent in order at the tapped time; replays of either never open or close a second shift', async () => {
    online = false;
    await sendOrSave({ url: '/api/timeclock/in', method: 'POST', body: { projectId: JOB }, kind: 'time', label: 'Clock in' });
    await new Promise((r) => setTimeout(r, 5));
    await sendOrSave({ url: '/api/timeclock/out', method: 'POST', body: {}, kind: 'time', label: 'Clock out' });
    const [tapIn, tapOut] = await listSaved(null, 'time');

    online = true;
    loseAnswers = 1; // the clock-in landed, its answer didn't
    await drainOutbox();
    expect(fake.T('time_entries')).toHaveLength(1);
    await drainOutbox(); // in (replayed) → out
    expect(await listSaved()).toHaveLength(0);
    const rows = fake.T('time_entries');
    expect(rows).toHaveLength(1);
    expect(rows[0].clock_in).toBe(new Date(tapIn.createdAt).toISOString());
    expect(rows[0].clock_out).toBe(new Date(tapOut.createdAt).toISOString());
    expect(rows[0].client_id).toBe(tapIn.clientId);
    expect(rows[0].client_out_id).toBe(tapOut.clientId);

    // The same clock-in arriving again after the shift closed: no new shift.
    const again = await clockIn(req('/api/timeclock/in', { projectId: JOB }, { [CLIENT_ID_HEADER]: tapIn.clientId! }));
    expect(again.status).toBe(200);
    expect((await again.json()).replayed).toBe(true);
    // The same clock-out again: the shift it closed, not "you are not on the clock".
    const out2 = await clockOut(req('/api/timeclock/out', {}, { [CLIENT_ID_HEADER]: tapOut.clientId! }));
    expect(out2.status).toBe(200);
    expect(fake.T('time_entries')).toHaveLength(1);
    expect(fake.T('time_entries').filter((r) => !r.clock_out)).toHaveLength(0);
  });
});

describe('photo kept on the phone', () => {
  test('route: upload-url and ingest answer with the photo already filed for that client id — one row', async () => {
    (fake.db as unknown as { storage: unknown }).storage = { from: () => ({ createSignedUploadUrl: async () => ({ data: { token: 't', signedUrl: 's' }, error: null }) }) };
    const h = { [CLIENT_ID_HEADER]: 'photo-0001-bbbb' };
    const path = `${TENANT}/projects/${JOB}/photo-staging/1-a-photo.jpg`;
    const first = await photoIngest(req('/api/photos/ingest', { projectId: JOB, path, fileName: 'photo.jpg' }, h));
    expect(first.status).toBe(200);
    expect(fake.T('photos')).toHaveLength(1);

    const start = await photoUploadUrl(req('/api/photos/upload-url', { projectId: JOB, fileName: 'photo.jpg' }, h));
    expect((await start.json()).existing?.client_id).toBe('photo-0001-bbbb'); // the phone skips the upload

    const second = await photoIngest(req('/api/photos/ingest', { projectId: JOB, path: path.replace('1-a', '2-b'), fileName: 'photo.jpg' }, h));
    expect((await second.json()).replayed).toBe(true);
    expect(fake.T('photos')).toHaveLength(1);

    const other = await photoUploadUrl(req('/api/photos/upload-url', { projectId: JOB, fileName: 'photo.jpg' }, { [CLIENT_ID_HEADER]: 'photo-0002-cccc' }));
    expect((await other.json()).existing).toBeUndefined();
  });
});

describe('the queue', () => {
  test('a write the server keeps refusing stops after MAX_ATTEMPTS, counts as failed, and Retry puts it back', async () => {
    online = false;
    // No projectId: the route answers 400 every time.
    await sendOrSave({ url: '/api/daily-logs/create', method: 'POST', body: { logDate: '2026-10-14' }, kind: 'daily-log', label: 'Daily log' });
    online = true;
    for (let i = 0; i < MAX_ATTEMPTS + 1; i++) await drainOutbox();
    expect(sent).toHaveLength(MAX_ATTEMPTS);
    await refreshPending();
    expect(getNetState()).toMatchObject({ pending: 0, failed: 1 });
    await retryAllStuck();
    await new Promise((r) => setTimeout(r, 20));
    await refreshPending();
    expect(sent.length).toBe(MAX_ATTEMPTS + 1);
    expect(fake.T('daily_logs')).toHaveLength(0);
  });
});
