/**
 * @jest-environment node
 *
 * RFIs: one number format, links that open the record (never the dashboard
 * or a 404), numbering per job, who a reassignment emails, one thread of
 * responses, and an official answer that answers the RFI and stays answered.
 * The route tests run the real handlers; only the database, the session and
 * the email/notification side effects are faked.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, test, expect, beforeEach } from '@jest/globals';
import { makeFakeDb } from './__fixtures__/fake-db';
import {
  formatRfiNumber, rfiLabel, rfiSeq, rfiTitle, nextRfiSeq, nextRfiNumber, rfiHref,
  assignmentToNotify, pickAssigneeEmail, mergeRfiThread,
} from './rfi';
import {
  recordHref, listHref, legacyRecordTarget, LEGACY_RECORD_SEGMENTS, ITEM_PAGE_TYPES, OWN_PAGE_SEGMENT, LIST_SEGMENT,
  safeNextPath, type RecordType,
} from './record-links';
import { ITEM_TOOLS } from './items/registry';

// `jest` stays the global so the SWC transform hoists jest.mock above the imports.
declare const jest: { mock: (m: string, f: () => unknown) => void; requireActual: <T>(m: string) => T };

const fake = makeFakeDb();
let currentUser: { id: string; tenantId: string; email: string } | null = null;
const assigned: Array<{ id: string; who: { name: string; email: string | null } }> = [];
const answered: string[] = [];

jest.mock('@/lib/supabase-server', () => ({
  createServerClient: () => fake.db,
  getUser: async () => currentUser,
  supabaseAdmin: {},
}));
jest.mock('@/lib/storage-signing', () => ({ signStoredUrl: async (_b: string, p: string) => `signed:${p}`, signFields: async (rows: Record<string, unknown>[]) => rows }));
const sentMail: Array<{ to: string[]; subject: string; html: string; replyTo?: string; from: string }> = [];
jest.mock('resend', () => ({
  Resend: class { emails = { send: async (m: { to: string[]; subject: string; html: string; replyTo?: string; from: string }) => { sentMail.push(m); return { error: null }; } }; },
}));
jest.mock('@/lib/triggers', () => ({
  onRFIAssigned: async (id: string, who: { name: string; email: string | null }) => { assigned.push({ id, who }); },
  onRFIAnswered: async (id: string) => { answered.push(id); },
  onSubmittalSentForReview: async () => undefined,
}));

import { NextRequest } from 'next/server';
import { PATCH as patchRfi } from '@/app/api/rfis/[id]/route';
import { GET as listThread, POST as postToThread, PATCH as markOfficial } from '@/app/api/items/[tool]/[id]/comments/route';

const ROOT = path.resolve(__dirname, '..');
const JOB = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const ID = 'aaaaaaaa-0000-4000-8000-0000000000f1';

describe('RFI number — one format everywhere', () => {
  test('stored, bare and old forms all read RFI-012; never RFI RFI-012', () => {
    expect(formatRfiNumber('RFI-012')).toBe('RFI-012');
    expect(formatRfiNumber('12')).toBe('RFI-012');
    expect(formatRfiNumber(12)).toBe('RFI-012');
    expect(formatRfiNumber('#12')).toBe('RFI-012');
    expect(formatRfiNumber('RFI #12')).toBe('RFI-012');
    expect(formatRfiNumber('rfi 7')).toBe('RFI-007');
    expect(formatRfiNumber('RFI-1234')).toBe('RFI-1234');
    expect(formatRfiNumber('RFI-SUB-003')).toBe('RFI-SUB-003');
    expect(formatRfiNumber('A-5')).toBe('RFI A-5');
    expect(formatRfiNumber('')).toBe('');
    expect(formatRfiNumber(null)).toBe('');
    for (const v of ['RFI-012', '12', 'RFI #12', 12]) expect(formatRfiNumber(v)).not.toMatch(/RFI.*RFI|#/);
  });
  test('labels, titles and sequence', () => {
    expect(rfiLabel(null)).toBe('RFI');
    expect(rfiLabel('', 'the RFI')).toBe('the RFI');
    expect(rfiTitle('RFI-004', 'Door hardware')).toBe('RFI-004 · Door hardware');
    expect(rfiTitle(null, 'Door hardware')).toBe('Door hardware');
    expect(rfiSeq('RFI-012')).toBe(12);
    expect(rfiSeq('RFI-SUB-003')).toBe(3);
    expect(rfiSeq('none')).toBeNull();
  });
  test('the email subject a template builds carries the number once', () => {
    const subject = `${rfiLabel('RFI-012')} Submitted — Pima County`;
    expect(subject).toBe('RFI-012 Submitted — Pima County');
    expect(subject.match(/RFI/g)).toHaveLength(1);
  });
});

describe('RFI numbers are per job', () => {
  test('a new job starts at RFI-001, whatever other jobs have', () => {
    expect(nextRfiSeq([])).toBe(1);
    expect(nextRfiNumber([])).toBe('RFI-001');
  });
  test('the next number is the job\'s highest + 1; gaps are never reused', () => {
    expect(nextRfiNumber(['RFI-001', 'RFI-002', 'RFI-004'])).toBe('RFI-005');
    expect(nextRfiNumber(['RFI-003', null, 'x'])).toBe('RFI-004');
    expect(nextRfiNumber([7, '2'])).toBe('RFI-008');
  });
  test('the trigger the database runs is per job, locked, and backed by a unique index', () => {
    const sql = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20261017j_rfi_number_per_job.sql'), 'utf8');
    expect(sql).toMatch(/pg_advisory_xact_lock/);
    expect(sql).toMatch(/r\.project_id IS NOT DISTINCT FROM NEW\.project_id/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS rfis_project_rfi_number_key/);
    expect(sql).not.toMatch(/\bDROP\b/i);
  });
  test('no create route counts the company\'s RFIs any more', () => {
    for (const f of ['app/api/rfis/create/route.ts', 'app/api/projects/[projectId]/rfis/route.ts', 'app/api/radio/promote/route.ts']) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      expect(src).not.toMatch(/count: 'exact'[^\n]*\n[^\n]*\.eq\('tenant_id'[^\n]*\);\s*\n\s*const rfi_number/);
      expect(src).not.toMatch(/const rfi_number = `RFI-/);
    }
  });
});

describe('links open the record', () => {
  test('an RFI links to its own page, absolute for email', () => {
    expect(rfiHref(JOB, ID)).toBe(`/app/projects/${JOB}/items/rfis/${ID}`);
    expect(rfiHref(JOB, ID, { base: 'https://saguarocontrol.net/', tab: 'responses' }))
      .toBe(`https://saguarocontrol.net/app/projects/${JOB}/items/rfis/${ID}?tab=responses`);
    expect(rfiHref(JOB, '')).toBe('');
    expect(rfiHref('', ID)).toBe('');
  });
  test('every record type lands on a page that exists in app/app', () => {
    const all = Object.keys(LIST_SEGMENT) as RecordType[];
    for (const t of all) {
      const href = recordHref(t, JOB, ID);
      expect(href.startsWith(`/app/projects/${JOB}/`)).toBe(true);
      const rel = href.replace(`/app/projects/${JOB}/`, '').split('?')[0];
      const parts = rel.split('/');
      let route: string;
      if (parts[0] === 'items') route = 'app/app/projects/[projectId]/items/[tool]/[id]/page.tsx';
      else if (parts.length === 2) route = `app/app/projects/[projectId]/${parts[0]}/[${parts[0] === 'drawings' ? 'drawingId' : 'id'}]/page.tsx`;
      else route = `app/app/projects/[projectId]/${parts[0]}/page.tsx`;
      expect([t, fs.existsSync(path.join(ROOT, route))]).toEqual([t, true]);
      // The list each one falls back to exists too.
      expect([t, fs.existsSync(path.join(ROOT, `app/app/projects/[projectId]/${LIST_SEGMENT[t]}/page.tsx`))]).toEqual([t, true]);
    }
    for (const t of ITEM_PAGE_TYPES) expect(ITEM_TOOLS[t]).toBeDefined();
    expect(Object.keys(OWN_PAGE_SEGMENT).length).toBeGreaterThan(0);
  });
  test('aliases, a missing id falls back to the list, a missing job to nothing', () => {
    expect(recordHref('change-orders', JOB, ID)).toBe(`/app/projects/${JOB}/items/change_orders/${ID}`);
    expect(recordHref('pay_app', JOB, ID, { base: 'https://x.test' })).toBe(`https://x.test/app/projects/${JOB}/pay-apps/${ID}`);
    expect(recordHref('punch', JOB, null)).toBe(`/app/projects/${JOB}/punch-list`);
    expect(recordHref('rfis', '', ID)).toBe('');
    expect(listHref('rfis', JOB, { query: { open: ID } })).toBe(`/app/projects/${JOB}/rfis?open=${ID}`);
  });
  test('old /<tool>/:id links (already in inboxes) redirect to the real page', () => {
    expect(legacyRecordTarget('rfis', JOB, ID)).toBe(`/app/projects/${JOB}/items/rfis/${ID}`);
    for (const seg of Object.keys(LEGACY_RECORD_SEGMENTS)) {
      const page = path.join(ROOT, `app/app/projects/[projectId]/${seg}/[id]/page.tsx`);
      expect([seg, fs.existsSync(page)]).toEqual([seg, true]);
      expect(fs.readFileSync(page, 'utf8')).toContain(`legacyRecordTarget('${seg}'`);
      expect(legacyRecordTarget(seg, JOB, ID)).toMatch(new RegExp(`^/app/projects/${JOB}/items/`));
    }
  });
  test('no notification or email links to a record route that does not exist', () => {
    const triggers = fs.readFileSync(path.join(ROOT, 'lib/triggers.ts'), 'utf8');
    expect(triggers).not.toMatch(/\/rfis\/\$\{rfiId\}/);
    const email = fs.readFileSync(path.join(ROOT, 'lib/email.ts'), 'utf8');
    const rfiSection = email.slice(email.indexOf('export async function sendRFISubmitted'), email.indexOf('export async function sendChangeOrderApproved'));
    expect(rfiSection).not.toMatch(/`\$\{APP_URL\}\/app`\)/);
    expect(rfiSection).not.toMatch(/RFI #\$\{/);
  });
  test('sign-in returns only to a path on this site', () => {
    expect(safeNextPath(`/app/projects/${JOB}/items/rfis/${ID}?tab=responses`)).toBe(`/app/projects/${JOB}/items/rfis/${ID}?tab=responses`);
    for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', '', null, '/login?next=/app']) {
      expect(safeNextPath(bad)).toBe('/app');
    }
    const mw = fs.readFileSync(path.join(ROOT, 'middleware.ts'), 'utf8');
    expect(mw).toMatch(/searchParams\.set\('next', pathname \+ \(request\.nextUrl\.search/);
  });
});

describe('reassignment — who gets the email', () => {
  const before = { assigned_to_name: 'Jane Architect', assigned_to_email: 'jane@studio.com', ball_in_court: 'Jane Architect', status: 'open' };
  test('a new person is told, with the email that came with them', () => {
    expect(assignmentToNotify(before, { assigned_to_name: 'Bob Engineer', ball_in_court: 'Bob Engineer', assigned_to_email: 'bob@eng.com' }, 'gc@builder.com'))
      .toEqual({ name: 'Bob Engineer', email: 'bob@eng.com' });
    expect(assignmentToNotify(before, { assigned_to_name: 'Bob Engineer' }, null)).toEqual({ name: 'Bob Engineer', email: null });
    expect(assignmentToNotify({}, { ball_in_court: 'sam@sub.com' }, null)).toEqual({ name: 'sam@sub.com', email: 'sam@sub.com' });
  });
  test('nobody is emailed for the same person, us, a status word, a closed RFI, or yourself', () => {
    expect(assignmentToNotify(before, { assigned_to_name: 'jane architect' }, null)).toBeNull();
    expect(assignmentToNotify(before, { assigned_to_email: 'JANE@studio.com' }, null)).toBeNull();
    expect(assignmentToNotify(before, { ball_in_court: 'GC' }, null)).toBeNull();
    expect(assignmentToNotify(before, { ball_in_court: 'closed' }, null)).toBeNull();
    expect(assignmentToNotify({ ...before, status: 'closed' }, { assigned_to_name: 'Bob' }, null)).toBeNull();
    expect(assignmentToNotify(before, { assigned_to_name: 'Bob', status: 'closed' }, null)).toBeNull();
    expect(assignmentToNotify(before, { assigned_to_name: 'Me', assigned_to_email: 'gc@builder.com' }, 'GC@builder.com')).toBeNull();
    expect(assignmentToNotify(before, { due_date: '2026-11-01' }, null)).toBeNull();
    expect(assignmentToNotify(before, { assigned_to_name: '' }, null)).toBeNull();
  });
  test('a name finds its email on the job — directory first, then team, users, subs', () => {
    const people = [
      { name: 'Bob Engineer', email: 'bob@eng.com', company: 'Eng Co' },
      { name: 'Bob Engineer', email: 'bob@other.com' },
      { contactName: 'Sam Sub', company: 'Desert Electric', email: 'sam@desertelectric.com' },
      { name: 'No Email', email: '' },
    ];
    expect(pickAssigneeEmail('bob engineer', people)).toBe('bob@eng.com');
    expect(pickAssigneeEmail('Desert Electric', people)).toBe('sam@desertelectric.com');
    expect(pickAssigneeEmail('Sam Sub', people)).toBe('sam@desertelectric.com');
    expect(pickAssigneeEmail('No Email', people)).toBeNull();
    expect(pickAssigneeEmail('Nobody', people)).toBeNull();
    expect(pickAssigneeEmail({ name: 'x', email: 'typed@x.com' }, people)).toBe('typed@x.com');
  });
});

describe('responses — one thread', () => {
  test('comments and responses merge oldest first; mirrors show once; one official', () => {
    const comments = [
      { id: 'c1', body: 'Use LCN 4040XP', author_name: 'Ada', created_at: '2026-10-02T10:00:00Z', is_official: true, author_id: 'u1' },
      { id: 'c2', body: 'Via email reply', author_name: 'Jane', created_at: '2026-10-03T10:00:00Z', source: 'email', source_email: 'jane@studio.com' },
      { id: 'c3', body: 'removed', author_name: 'Ada', created_at: '2026-10-04T10:00:00Z', deleted_at: '2026-10-04T11:00:00Z' },
    ];
    const responses = [
      { id: 'r0', response_text: 'Field answer', responder_name: 'Foreman', responded_at: '2026-10-01T09:00:00Z', is_official: false, attachments: [{ name: 'photo.jpg', url: 'https://x/p.jpg' }] },
      { id: 'r1', response_text: 'Use LCN 4040XP', responder_name: 'Ada', responded_at: '2026-10-02T10:00:00Z', comment_id: 'c1', is_official: true },
      { id: 'r2', response_text: 'Via email reply', responder_email: 'jane@studio.com', responder_name: 'Jane', source: 'email', responded_at: '2026-10-03T10:00:00Z', is_official: true },
      { id: 'r3', response_text: 'removed', comment_id: 'c3', responded_at: '2026-10-04T10:00:00Z' },
    ];
    const t = mergeRfiThread(comments, responses, 'u1');
    expect(t.map((e) => e.id)).toEqual(['r0', 'c1', 'c2']);
    expect(t[0]).toEqual(expect.objectContaining({ kind: 'response', author_name: 'Foreman', attachments: [{ name: 'photo.jpg', url: 'https://x/p.jpg' }] }));
    expect(t[1]).toEqual(expect.objectContaining({ kind: 'comment', mine: true, is_official: true }));
    expect(t[2]).toEqual(expect.objectContaining({ source: 'email' }));
    expect(t.filter((e) => e.is_official)).toHaveLength(1);
  });
});

/* ── Through the real routes ─────────────────────────────────────────────── */

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const ADMIN = { id: 'aaaaaaaa-0000-4000-8000-0000000000c1', tenantId: A, email: 'ada@builder.com' };
const req = (url: string, method = 'GET', body?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, ...(body ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {}) });
const p = (id: string) => ({ params: Promise.resolve({ id }) });
const pi = (tool: string, id: string) => ({ params: Promise.resolve({ tool, id }) });

function seed() {
  fake.reset();
  assigned.length = 0;
  answered.length = 0;
  fake.T('profiles').push({ id: ADMIN.id, tenant_id: A, email: ADMIN.email, full_name: 'Ada Admin', role: 'admin' });
  fake.T('projects').push({ id: JOB, tenant_id: A, name: 'Pima County', architect_name: 'Jane Architect', architect_email: 'jane@studio.com' });
  fake.T('contacts').push({ id: 'k1', tenant_id: A, project_id: JOB, name: 'Bob Engineer', email: 'bob@eng.com', company: 'Eng Co' });
  fake.T('rfis').push({
    id: ID, tenant_id: A, project_id: JOB, rfi_number: 'RFI-001', subject: 'Door hardware', question: 'Which closer?',
    status: 'open', assigned_to_name: 'Jane Architect', assigned_to_email: 'jane@studio.com', ball_in_court: 'Jane Architect',
    submitted_by: 'ada@builder.com', deleted_at: null, created_at: '2026-10-01T00:00:00Z',
  });
}

describe('routes — reassign emails the new person; official answer sticks', () => {
  beforeEach(() => { seed(); currentUser = ADMIN; });

  test('reassigning by name fills in the email from the job directory and tells them', async () => {
    const r = await patchRfi(req(`/api/rfis/${ID}`, 'PATCH', { assigned_to_name: 'Bob Engineer', ball_in_court: 'Bob Engineer' }), p(ID));
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.assigned).toEqual({ name: 'Bob Engineer', emailed: 'bob@eng.com' });
    const row = fake.T('rfis').find((x) => x.id === ID)!;
    expect(row.assigned_to_email).toBe('bob@eng.com');
    await new Promise((res) => setTimeout(res, 0));
    expect(assigned).toEqual([{ id: ID, who: { name: 'Bob Engineer', email: 'bob@eng.com' } }]);
  });

  test('a name the job does not know clears the old email and says nobody was emailed', async () => {
    const j = await (await patchRfi(req(`/api/rfis/${ID}`, 'PATCH', { assigned_to_name: 'Pat Unknown' }), p(ID))).json();
    expect(j.assigned).toEqual({ name: 'Pat Unknown', emailed: null });
    expect(fake.T('rfis').find((x) => x.id === ID)!.assigned_to_email).toBeNull();
  });

  test('a due-date change or the same person sends nothing', async () => {
    expect((await (await patchRfi(req(`/api/rfis/${ID}`, 'PATCH', { due_date: '2026-11-01' }), p(ID))).json()).assigned).toBeNull();
    expect((await (await patchRfi(req(`/api/rfis/${ID}`, 'PATCH', { assigned_to_name: 'Jane Architect' }), p(ID))).json()).assigned).toBeNull();
    await new Promise((res) => setTimeout(res, 0));
    expect(assigned).toHaveLength(0);
  });

  test('posting an official answer answers the RFI, survives reload, and is the only official one', async () => {
    const first = await postToThread(req(`/api/items/rfis/${ID}/comments`, 'POST', { body: 'Use the LCN 4040XP.', official: true }), pi('rfis', ID));
    expect(first.status).toBe(201);
    let rfi = fake.T('rfis').find((x) => x.id === ID)!;
    expect(rfi).toEqual(expect.objectContaining({ status: 'answered', answer: 'Use the LCN 4040XP.', answered_by: 'Ada Admin', ball_in_court: 'ada@builder.com' }));

    // A field response (rfi_responses only) shows on the thread too.
    fake.T('rfi_responses').push({ id: 'resp-field', tenant_id: A, rfi_id: ID, responder_name: 'Foreman', response_text: 'Closer installed per answer.', is_official: false, responded_at: '2030-01-01T00:00:00Z', attachments: [] });

    const thread = await (await listThread(req(`/api/items/rfis/${ID}/comments`), pi('rfis', ID))).json();
    expect(thread.comments.map((c: { body: string }) => c.body)).toEqual(['Use the LCN 4040XP.', 'Closer installed per answer.']);
    expect(thread.comments[0].is_official).toBe(true);

    // Mark the other one official instead: exactly one official, the RFI's answer follows it.
    const m = await markOfficial(req(`/api/items/rfis/${ID}/comments`, 'PATCH', { entryId: 'resp-field', kind: 'response', official: true }), pi('rfis', ID));
    expect(m.status).toBe(200);
    const again = await (await listThread(req(`/api/items/rfis/${ID}/comments`), pi('rfis', ID))).json();
    expect(again.comments.filter((c: { is_official: boolean }) => c.is_official).map((c: { id: string }) => c.id)).toEqual(['resp-field']);
    rfi = fake.T('rfis').find((x) => x.id === ID)!;
    expect(rfi.answer).toBe('Closer installed per answer.');
    expect(rfi.status).toBe('answered');

    // Take the mark off: open again, no answer.
    await markOfficial(req(`/api/items/rfis/${ID}/comments`, 'PATCH', { entryId: 'resp-field', kind: 'response', official: false }), pi('rfis', ID));
    rfi = fake.T('rfis').find((x) => x.id === ID)!;
    expect(rfi.status).toBe('open');
    expect(rfi.answer).toBeNull();
    const none = await (await listThread(req(`/api/items/rfis/${ID}/comments`), pi('rfis', ID))).json();
    expect(none.comments.some((c: { is_official: boolean }) => c.is_official)).toBe(false);
  });
});

describe('the emails themselves', () => {
  beforeEach(() => {
    seed();
    sentMail.length = 0;
    process.env.RESEND_API_KEY = 'test-key';
    process.env.INBOUND_REPLY_SECRET = 'test-inbound-secret-0123456789';
    process.env.INBOUND_REPLY_DOMAIN = 'reply.saguarocontrol.net';
  });

  test('the new assignee gets "RFI-001 assigned to you", the RFI link and a reply-by-email Reply-To; in the app too', async () => {
    fake.T('profiles').push({ id: 'bob-user', tenant_id: A, email: 'Bob@Eng.com', full_name: 'Bob Engineer' });
    const real = jest.requireActual<typeof import('./triggers')>('./triggers');
    await real.onRFIAssigned(ID, { name: 'Bob Engineer', email: 'bob@eng.com' }, { email: ADMIN.email, name: 'Ada Admin' });
    expect(sentMail).toHaveLength(1);
    const m = sentMail[0];
    expect(m.to).toEqual(['bob@eng.com']);
    expect(m.subject).toBe('RFI-001 assigned to you — Pima County');
    expect(m.subject).not.toMatch(/RFI.*RFI/);
    expect(m.html).toContain(`/app/projects/${JOB}/items/rfis/${ID}`);
    expect(m.html).not.toMatch(/href="https:\/\/saguarocontrol\.net\/app"/);
    expect(m.replyTo).toMatch(/^reply\+[a-z0-9]+@reply\.saguarocontrol\.net$/);
    expect(m.from).toMatch(/^Ada Admin via Saguaro </);
    const n = fake.T('notifications').find((x) => x.type === 'rfi_assigned');
    expect(n).toEqual(expect.objectContaining({ user_id: 'bob-user', title: 'RFI-001 assigned to you', link: expect.stringContaining(`/items/rfis/${ID}`) }));
  });

  test('a new RFI emails its assignee and the architect once each, subject numbered once, button to the RFI', async () => {
    fake.T('rfis')[0].assigned_to_name = 'Bob Engineer';
    fake.T('rfis')[0].assigned_to_email = null;
    const real = jest.requireActual<typeof import('./triggers')>('./triggers');
    await real.onRFICreated(ID);
    const rfiMail = sentMail.filter((m) => m.subject.startsWith('RFI-001 Submitted'));
    expect(rfiMail.map((m) => m.to[0]).sort()).toEqual(['bob@eng.com', 'jane@studio.com']);
    for (const m of rfiMail) {
      expect(m.subject).toBe('RFI-001 Submitted — Pima County');
      expect(m.html).toContain(`/app/projects/${JOB}/items/rfis/${ID}`);
    }
    // The resolved email is kept on the RFI (so a reply from Bob is recognized).
    expect(fake.T('rfis')[0].assigned_to_email).toBe('bob@eng.com');
    const n = fake.T('notifications').find((x) => x.type === 'rfi_submitted');
    expect(n).toEqual(expect.objectContaining({ title: 'RFI-001 submitted', link: expect.stringContaining(`/items/rfis/${ID}`) }));
  });
});
