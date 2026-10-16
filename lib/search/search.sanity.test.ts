/**
 * @jest-environment node
 *
 * Search everything — proof of the parts that decide what a user sees:
 *   1. the query reader (typed numbers, bare numbers, codes, dates, cleaning);
 *   2. the ranking (exact number first);
 *   3. the REAL /api/search handler, run against a recording fake database
 *      with the REAL permission resolver (lib/permissions) and the live
 *      role definitions (lib/__fixtures__/role-definitions.json): a Foreman
 *      never causes an invoice, pay-app or change-order table to be read.
 */
import { describe, test, expect, beforeEach } from '@jest/globals';
declare const jest: { mock: (m: string, f: () => unknown) => void };
import { NextRequest } from 'next/server';
import roleFixture from '../__fixtures__/role-definitions.json';
import { allowedSearchTypes, cleanQuery, norm, parseQuery, rankHit, trailingNumber } from './core';

type Row = Record<string, any>;
let roleName = 'Admin';
let baseRole = 'member';
const queried: string[] = [];
const orFilters: string[] = [];

const DATA: Record<string, Row[]> = {
  rfis: [
    { id: 'r15', rfi_number: 'RFI-015', subject: 'Roof drain 5 location', status: 'open', project_id: 'p1', project: { id: 'p1', name: 'Pima County ADC' } },
    { id: 'r5', rfi_number: 'RFI-005', subject: 'Smoke damper sequence', status: 'open', project_id: 'p1', project: { id: 'p1', name: 'Pima County ADC' } },
  ],
  invoices: [{ id: 'i1', invoice_number: 'INV-2026-0005', vendor_name: 'Sonoran Electric LLC', status: 'paid', project_id: 'p1' }],
  pay_applications: [{ id: 'pa1', app_number: 5, contract_name: 'BAS', status: 'approved', project_id: 'p1' }],
  change_orders: [{ id: 'c1', co_number: 5, title: 'Generator package', status: 'approved', project_id: 'p1' }],
  drawings: [{ id: 'd1', sheet_number: 'A-101', name: 'Floor plan', project_id: 'p1' }],
  subcontractors: [{ id: 's1', company_name: 'Valley Sheet Metal Co.', trade: 'HVAC', status: 'active' }],
};

function fakeDb() {
  return {
    from(table: string) {
      const st = { table, single: false, number: null as null | { col: string; val: unknown } };
      const qb: any = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === 'then') {
            return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result(st)).then(res, rej);
          }
          return (...args: unknown[]) => {
            if (prop === 'maybeSingle') st.single = true;
            if (prop === 'or') orFilters.push(`${table}:${String(args[0])}`);
            return qb;
          };
        },
      });
      return qb;
    },
  };
}

function result(st: { table: string; single: boolean }) {
  if (st.table === 'profiles' && st.single) return { data: { role: baseRole }, error: null };
  if (st.table === 'user_role_assignments') return { data: [{ role_id: `role-${roleName}`, project_id: null }], error: null };
  if (st.table === 'role_definitions') {
    const def = (roleFixture as Row[]).find((r) => r.tenant_id === 'company-a' && r.name === roleName);
    return { data: def ? [{ id: `role-${roleName}`, permissions: def.permissions }] : [], error: null };
  }
  queried.push(st.table);
  const rows = DATA[st.table] ?? [];
  return { data: rows, error: null, count: rows.length };
}

const db = fakeDb();
jest.mock('@/lib/supabase-server', () => ({
  createServerClient: () => db,
  getUser: async () => ({ id: 'u1', tenantId: 't1', email: 'u1@example.com' }),
  supabaseAdmin: {},
}));

// eslint-disable-next-line import/first
import { GET } from '@/app/api/search/route';

async function search(q: string) {
  queried.length = 0;
  orFilters.length = 0;
  const res = await GET(new NextRequest(`http://x/api/search?q=${encodeURIComponent(q)}`));
  return { status: res.status, body: (await res.json()) as any };
}

describe('query reader', () => {
  test('typed numbers name their type', () => {
    expect(parseQuery('RFI-005')).toMatchObject({ number: 5, numberTypes: ['rfi'] });
    expect(parseQuery('rfi 5')).toMatchObject({ number: 5, numberTypes: ['rfi'] });
    expect(parseQuery('CO 3')).toMatchObject({ number: 3, numberTypes: ['change_order'] });
    expect(parseQuery('pay app 2')).toMatchObject({ number: 2, numberTypes: ['pay_app'] });
    expect(parseQuery('#4')).toMatchObject({ number: 4, numberTypes: [] });
  });
  test('a sheet code is a code, not a typed number', () => {
    const p = parseQuery('A-101');
    expect(p.number).toBeNull();
    expect(p.like).toBe('%A%101%');
    expect(norm('A-101')).toBe(norm('a101'));
  });
  test('cleaning removes filter syntax and wildcards', () => {
    expect(cleanQuery('x%,name.eq.1)(*"_\\')).toBe('x name.eq.1');
    expect(parseQuery('a_b%c').like).toBe('%a%b%c%');
    expect(parseQuery('10/3/2026').date).toBe('2026-10-03');
    expect(trailingNumber('INV-2026-0088')).toBe(88);
  });
  test('exact number outranks a contains match', () => {
    const p = parseQuery('RFI-005');
    expect(rankHit(p, 'rfi', { number: 'RFI-005', label: 'Smoke damper' })).toBe(100);
    expect(rankHit(p, 'rfi', { number: 'RFI-015', label: 'Roof drain' })).toBeLessThan(100);
  });
});

describe('permission gate', () => {
  test('Foreman cannot search invoices, pay apps or change orders', () => {
    const foreman = (roleFixture as Row[]).find((r) => r.name === 'Foreman')!.permissions;
    const types = allowedSearchTypes(foreman);
    expect(types).not.toContain('invoice');
    expect(types).not.toContain('pay_app');
    expect(types).not.toContain('change_order');
    expect(types).toContain('rfi');
    expect(types).toContain('drawing');
  });
});

describe('GET /api/search (real handler)', () => {
  beforeEach(() => { baseRole = 'member'; });

  test('Foreman: money tables are never read, money types never returned', async () => {
    roleName = 'Foreman';
    const { status, body } = await search('5');
    expect(status).toBe(200);
    expect(queried).not.toContain('invoices');
    expect(queried).not.toContain('pay_applications');
    expect(queried).not.toContain('change_orders');
    const types = body.groups.map((g: Row) => g.type);
    expect(types).not.toContain('invoice');
    expect(types).not.toContain('pay_app');
    expect(types).toContain('rfi');
  });

  test('Admin: "RFI 5" puts RFI-005 first, with its job and a deep link', async () => {
    roleName = 'Admin';
    baseRole = 'admin';
    const { body } = await search('RFI 5');
    expect(queried).toContain('invoices');
    expect(body.groups[0].type).toBe('rfi');
    const top = body.groups[0].hits[0];
    expect(top.number).toBe('RFI-005');
    expect(top.project).toEqual({ id: 'p1', name: 'Pima County ADC' });
    expect(top.href).toBe('/app/projects/p1/rfis?open=r5');
  });

  test('every filter value is quoted and tenant-scoped input cannot inject', async () => {
    roleName = 'Admin';
    baseRole = 'admin';
    await search('smoke),tenant_id.neq.(x');
    expect(orFilters.length).toBeGreaterThan(0);
    for (const f of orFilters) {
      expect(f).not.toMatch(/tenant_id/);
      expect(f).not.toMatch(/[()]/);
    }
  });
});
