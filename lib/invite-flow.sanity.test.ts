/**
 * @jest-environment node
 *
 * End-to-end proof of the team-invite flow, run through the REAL route handlers
 * (send invite → open join page → set password / accept while signed in) against
 * an in-memory database, for EVERY role a company defines. Only the outside
 * world is faked: the database, the mail service and the push/notification
 * fan-out. The permission resolver is the real lib/permissions code, so the
 * access each invitee ends up with is exactly what the live app enforces.
 *
 * Roles come from the live role_definitions of two real companies
 * (lib/__fixtures__/role-definitions.json), so a role somebody configured is
 * tested as configured.
 */
import { describe, test, expect, beforeEach } from '@jest/globals';
// `jest` stays the global so the SWC transform hoists jest.mock above the imports.
declare const jest: { mock: (m: string, f: () => unknown) => void; requireActual: (m: string) => unknown };
import { NextRequest } from 'next/server';
import roleFixture from './__fixtures__/role-definitions.json';

// ── In-memory database ───────────────────────────────────────────────────────
type Row = Record<string, any>;
const tables: Record<string, Row[]> = {};
let idSeq = 0;
const uid = () => `00000000-0000-4000-8000-${String(++idSeq).padStart(12, '0')}`;
const T = (name: string) => (tables[name] ||= []);

function likeToRe(p: string) {
  let out = '';
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === '\\' && i + 1 < p.length) { out += p[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); continue; }
    if (c === '%') out += '.*'; else if (c === '_') out += '.'; else out += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`, 'i');
}

class Query {
  private filters: Array<(r: Row) => boolean> = [];
  private mode: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
  private payload: any;
  private onConflict = 'id';
  private returning = false;
  private singleMode: 'one' | 'maybe' | null = null;
  private orderBy: { col: string; asc: boolean } | null = null;
  private max: number | null = null;
  constructor(private table: string) {}
  select(_cols?: string) { if (this.mode !== 'select') this.returning = true; return this; }
  insert(rows: any) { this.mode = 'insert'; this.payload = rows; return this; }
  update(obj: any) { this.mode = 'update'; this.payload = obj; return this; }
  upsert(row: any, opts?: { onConflict?: string }) { this.mode = 'upsert'; this.payload = row; this.onConflict = opts?.onConflict || 'id'; return this; }
  delete() { this.mode = 'delete'; return this; }
  eq(c: string, v: any) { this.filters.push(r => r[c] === v); return this; }
  neq(c: string, v: any) { this.filters.push(r => r[c] !== v); return this; }
  is(c: string, v: any) { this.filters.push(r => (r[c] ?? null) === v); return this; }
  in(c: string, vs: any[]) { this.filters.push(r => vs.includes(r[c])); return this; }
  ilike(c: string, p: string) { const re = likeToRe(p); this.filters.push(r => re.test(String(r[c] ?? ''))); return this; }
  gte(c: string, v: any) { this.filters.push(r => r[c] >= v); return this; }
  order(col: string, o?: { ascending?: boolean }) { this.orderBy = { col, asc: o?.ascending !== false }; return this; }
  limit(n: number) { this.max = n; return this; }
  maybeSingle() { this.singleMode = 'maybe'; return this; }
  single() { this.singleMode = 'one'; return this; }
  private run(): { data: any; error: any } {
    const t = T(this.table);
    const match = (r: Row) => this.filters.every(f => f(r));
    let out: Row[] = [];
    if (this.mode === 'insert') {
      const rows = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((r: Row) => ({ id: uid(), created_at: new Date().toISOString(), ...r }));
      t.push(...rows); out = rows;
    } else if (this.mode === 'upsert') {
      const r = this.payload; const hit = t.find(x => x[this.onConflict] === r[this.onConflict]);
      if (hit) Object.assign(hit, r); else t.push({ ...r });
      out = [hit || r];
    } else if (this.mode === 'update') {
      out = t.filter(match); out.forEach(r => Object.assign(r, this.payload));
    } else if (this.mode === 'delete') {
      out = t.filter(match); tables[this.table] = t.filter(r => !match(r));
    } else {
      out = t.filter(match);
    }
    if (this.orderBy) { const { col, asc } = this.orderBy; out = [...out].sort((a, b) => (a[col] > b[col] ? 1 : -1) * (asc ? 1 : -1)); }
    if (this.max != null) out = out.slice(0, this.max);
    const copy = out.map(r => ({ ...r }));
    if (this.singleMode === 'maybe') return { data: copy[0] ?? null, error: null };
    if (this.singleMode === 'one') return copy.length === 1 ? { data: copy[0], error: null } : { data: null, error: { message: 'not one row' } };
    if (this.mode !== 'select' && !this.returning) return { data: null, error: null };
    return { data: copy, error: null };
  }
  then(ok?: (v: any) => unknown, bad?: (e: any) => unknown) { return Promise.resolve(this.run()).then(ok, bad); }
}

const authUsers: Row[] = [];
const fakeDb: any = {
  from: (t: string) => new Query(t),
  auth: {
    admin: {
      createUser: async ({ email, password, user_metadata }: any) => {
        if (authUsers.some(u => u.email === email)) return { data: null, error: { message: 'A user with this email address has already been registered' } };
        if (!password || password.length < 8) return { data: null, error: { message: 'Password should be at least 8 characters' } };
        const user = { id: uid(), email, password, user_metadata };
        authUsers.push(user);
        // handle_new_user trigger: profile in the tenant named by the metadata.
        T('profiles').push({ id: user.id, email, tenant_id: user_metadata?.tenant_id, full_name: user_metadata?.full_name, role: 'member' });
        return { data: { user }, error: null };
      },
    },
  },
};

// ── Module mocks: database, signed-in user, mail, notifications ─────────────
let currentUser: { id: string; email: string; tenantId: string } | null = null;
jest.mock('@/lib/supabase-server', () => ({
  createServerClient: () => fakeDb,
  getUser: async () => currentUser,
  supabaseAdmin: {},
}));
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: async ({ email, password }: any) => {
        const u = authUsers.find(x => x.email === email && x.password === password);
        return u ? { data: { session: { access_token: 'at', refresh_token: 'rt', expires_at: Math.floor(Date.now() / 1000) + 3600 } }, error: null }
                 : { data: { session: null }, error: { message: 'Invalid login' } };
      },
    },
  }),
}));
const sentMail: Array<{ to: string; role: string; url: string }> = [];
jest.mock('@/lib/email', () => ({
  sendInviteTeamMember: async (to: string, _n: string, _c: string, role: string, url: string) => { sentMail.push({ to, role, url }); return { sent: true }; },
}));
jest.mock('@/lib/notifications', () => ({ createNotification: async () => undefined }));
jest.mock('@/lib/permissions', () => {
  const actual = jest.requireActual('@/lib/permissions') as Record<string, unknown>;
  return {
    ...actual,
    requirePermission: async () => (currentUser ? { ok: true, user: currentUser } : { ok: false, res: new Response('no', { status: 401 }) }),
  };
});

// Imported after the mocks so they bind to the fakes.
import { POST as sendInvite } from '@/app/api/team/invite/route';
import { GET as openInvite, POST as acceptSignedIn } from '@/app/api/team/accept-invite/route';
import { POST as createAccount } from '@/app/api/team/accept-invite/create-account/route';
import { getEffectivePermissions, CATEGORIES } from '@/lib/permissions';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://db.test';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';

const req = (url: string, body?: unknown) =>
  new NextRequest(`https://saguarocontrol.net${url}`, body === undefined ? { method: 'GET' } : { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const tokenFrom = (url: string) => new URL(url).searchParams.get('token') as string;

type RoleDef = { id: string; tenant_id: string; name: string; permissions: Record<string, string> };
const ROLES = roleFixture as RoleDef[];
const COMPANIES = Array.from(new Set(ROLES.map(r => r.tenant_id)));

/** What lib/permissions must resolve a role's stored map to (absent key → its inherit source, else None). */
function expectedFor(def: RoleDef) {
  if (def.name.toLowerCase() === 'admin') return Object.fromEntries(CATEGORIES.map(c => [c, 'Full']));
  return Object.fromEntries(CATEGORIES.map(c => {
    const v = c in def.permissions ? def.permissions[c] : c === 'Sales' ? (def.permissions['Projects'] ?? 'None') : 'None';
    return [c, ['None', 'View', 'Edit', 'Full'].includes(v) ? v : 'None'];
  }));
}

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  authUsers.length = 0; sentMail.length = 0; idSeq = 0;
  for (const tenantId of COMPANIES) {
    T('tenants').push({ id: tenantId, name: `Company ${tenantId}`, company_name: `Company ${tenantId}` });
    const ownerId = uid();
    T('profiles').push({ id: ownerId, email: `owner-${tenantId}@example.com`, tenant_id: tenantId, role: 'admin', full_name: 'Owner' });
    authUsers.push({ id: ownerId, email: `owner-${tenantId}@example.com`, password: 'x' });
  }
  T('role_definitions').push(...ROLES.map(r => ({ ...r })));
});

const ownerOf = (tenantId: string) => {
  const p = T('profiles').find(x => x.tenant_id === tenantId && x.role === 'admin')!;
  return { id: p.id, email: p.email, tenantId };
};

describe('team invite — new person sets a password and joins', () => {
  const cases = ROLES.map(r => [r.name, r.tenant_id, r] as const)
    .concat(COMPANIES.map(t => ['Member (no role)', t, { id: '', tenant_id: t, name: '', permissions: {} }] as const));

  test.each(cases)('%s @ company %s', async (_label, _co, def) => {
    const owner = ownerOf(def.tenant_id);
    currentUser = owner;
    const email = `new.${def.name.replace(/\W+/g, '').toLowerCase() || 'member'}@example.com`;

    // 1. Admin sends the invite (exactly what the Invite User form posts).
    const sent = await sendInvite(req('/api/team/invite', { email, name: 'New Person', role: def.name }));
    const sj = await sent.json();
    expect(sent.status).toBe(200);
    expect(sj.emailed).toBe(true);
    expect(sentMail).toHaveLength(1);
    expect(sentMail[0].to).toBe(email);
    const token = tokenFrom(sj.acceptUrl);

    // 2. Invitee opens the link (signed out): sees company, role and their name.
    currentUser = null;
    const opened = await (await openInvite(req(`/api/team/accept-invite?token=${token}`))).json();
    expect(opened.valid).toBe(true);
    expect(opened.reason).toBe('pending');
    expect(opened.role).toBe(def.name || 'member');
    expect(opened.name).toBe('New Person');

    // 3. Sets a password and joins.
    const made = await createAccount(req('/api/team/accept-invite/create-account', { token, password: 'Str0ng-pass!', fullName: 'New Person' }));
    const mj = await made.json();
    expect(made.status).toBe(200);
    expect(mj.signedIn).toBe(true);

    // 4. Landed in the INVITING company with the right role and access.
    const user = authUsers.find(u => u.email === email)!;
    const profile = T('profiles').find(p => p.id === user.id)!;
    expect(profile.tenant_id).toBe(def.tenant_id);
    const perms = await getEffectivePermissions(fakeDb, user.id, def.tenant_id);
    if (def.name) {
      expect(profile.role).toBe(def.name);
      expect(perms).toEqual(expectedFor(def as RoleDef));
    } else {
      // No role picked: read-only member, no admin.
      expect(perms.Admin).toBe('None');
      expect(perms.Projects).toBe('View');
    }

    // 5. Link is single-use.
    const again = await createAccount(req('/api/team/accept-invite/create-account', { token, password: 'Str0ng-pass!' }));
    expect(again.status).toBe(409);
  });
});

describe('team invite — person who already has an account accepts while signed in', () => {
  test.each(ROLES.map(r => [r.name, r.tenant_id, r] as const))('%s @ company %s', async (_l, _c, def) => {
    const owner = ownerOf(def.tenant_id);
    // Someone with an account in another company.
    const otherTenant = COMPANIES.find(t => t !== def.tenant_id)!;
    const existing = { id: uid(), email: `existing.${def.name.replace(/\W+/g, '').toLowerCase()}@example.com` };
    T('profiles').push({ id: existing.id, email: existing.email, tenant_id: otherTenant, role: 'member', full_name: 'Existing Person' });
    authUsers.push({ ...existing, password: 'pw-existing' });

    currentUser = owner;
    const sj = await (await sendInvite(req('/api/team/invite', { email: existing.email, role: def.name }))).json();
    const token = tokenFrom(sj.acceptUrl);

    // A new account for that address is refused and points them to sign in.
    currentUser = null;
    const dup = await createAccount(req('/api/team/accept-invite/create-account', { token, password: 'Str0ng-pass!' }));
    expect(dup.status).toBe(409);
    expect((await dup.json()).reason).toBe('has_account');

    // Signed in as the invited address → Accept works.
    currentUser = { id: existing.id, email: existing.email, tenantId: otherTenant };
    const res = await acceptSignedIn(req('/api/team/accept-invite', { token }));
    expect(res.status).toBe(200);
    const profile = T('profiles').find(p => p.id === existing.id)!;
    expect(profile.tenant_id).toBe(def.tenant_id);
    expect(profile.role).toBe(def.name);
    expect(await getEffectivePermissions(fakeDb, existing.id, def.tenant_id)).toEqual(expectedFor(def));
  });

  test('signed in as a different address is refused', async () => {
    const tenantId = COMPANIES[0];
    currentUser = ownerOf(tenantId);
    const sj = await (await sendInvite(req('/api/team/invite', { email: 'right@example.com', role: 'Foreman' }))).json();
    currentUser = { id: uid(), email: 'wrong@example.com', tenantId: COMPANIES[1] };
    const res = await acceptSignedIn(req('/api/team/accept-invite', { token: tokenFrom(sj.acceptUrl) }));
    expect(res.status).toBe(403);
    expect((await res.json()).reason).toBe('email_mismatch');
  });
});

describe('team invite — re-sent invites, cancelled and expired links', () => {
  test('the first email still works after the invite is sent again', async () => {
    const tenantId = COMPANIES[0];
    currentUser = ownerOf(tenantId);
    const first = await (await sendInvite(req('/api/team/invite', { email: 'twice@example.com', name: 'Twice', role: 'Superintendent' }))).json();
    const second = await (await sendInvite(req('/api/team/invite', { email: 'TWICE@example.com', name: 'Twice', role: 'Superintendent' }))).json();
    expect(T('team_invites').filter(i => i.status === 'pending')).toHaveLength(1);

    currentUser = null;
    const opened = await (await openInvite(req(`/api/team/accept-invite?token=${tokenFrom(first.acceptUrl)}`))).json();
    expect(opened.valid).toBe(true);
    const made = await createAccount(req('/api/team/accept-invite/create-account', { token: tokenFrom(first.acceptUrl), password: 'Str0ng-pass!' }));
    expect(made.status).toBe(200);
    // The newer link is now used up too: one person, one account.
    const again = await createAccount(req('/api/team/accept-invite/create-account', { token: tokenFrom(second.acceptUrl), password: 'Str0ng-pass!' }));
    expect(again.status).toBe(409);
  });

  test('a cancelled invite with no newer one says so instead of offering to join', async () => {
    const tenantId = COMPANIES[0];
    currentUser = ownerOf(tenantId);
    const sj = await (await sendInvite(req('/api/team/invite', { email: 'gone@example.com', role: 'Foreman' }))).json();
    T('team_invites').forEach(i => { if (i.email === 'gone@example.com') i.status = 'cancelled'; });
    currentUser = null;
    const opened = await (await openInvite(req(`/api/team/accept-invite?token=${tokenFrom(sj.acceptUrl)}`))).json();
    expect(opened.valid).toBe(false);
    expect(opened.reason).toBe('invalid');
    const made = await createAccount(req('/api/team/accept-invite/create-account', { token: tokenFrom(sj.acceptUrl), password: 'Str0ng-pass!' }));
    expect(made.status).toBe(404);
    expect(authUsers.some(u => u.email === 'gone@example.com')).toBe(false);
  });

  test('an invite older than 7 days is expired', async () => {
    const tenantId = COMPANIES[0];
    currentUser = ownerOf(tenantId);
    const sj = await (await sendInvite(req('/api/team/invite', { email: 'late@example.com', role: 'Foreman' }))).json();
    T('team_invites').forEach(i => { if (i.email === 'late@example.com') i.created_at = new Date(Date.now() - 8 * 864e5).toISOString(); });
    currentUser = null;
    const opened = await (await openInvite(req(`/api/team/accept-invite?token=${tokenFrom(sj.acceptUrl)}`))).json();
    expect(opened.reason).toBe('expired');
    const made = await createAccount(req('/api/team/accept-invite/create-account', { token: tokenFrom(sj.acceptUrl), password: 'Str0ng-pass!' }));
    expect(made.status).toBe(410);
  });

  test('bad input is refused with a plain reason', async () => {
    currentUser = ownerOf(COMPANIES[0]);
    expect((await sendInvite(req('/api/team/invite', { email: '' }))).status).toBe(400);
    expect((await sendInvite(req('/api/team/invite', { email: 'not-an-email' }))).status).toBe(400);
    currentUser = null;
    expect((await openInvite(req('/api/team/accept-invite?token=nope'))).status).toBe(404);
    const sj = { acceptUrl: '' };
    currentUser = ownerOf(COMPANIES[0]);
    Object.assign(sj, await (await sendInvite(req('/api/team/invite', { email: 'short@example.com', role: 'Foreman' }))).json());
    currentUser = null;
    const weak = await createAccount(req('/api/team/accept-invite/create-account', { token: tokenFrom(sj.acceptUrl), password: 'short' }));
    expect(weak.status).toBe(400);
  });
});
