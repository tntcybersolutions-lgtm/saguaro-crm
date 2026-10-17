/**
 * @jest-environment node
 *
 * Name resolver: a person field shows the person's name, the text as typed
 * when it is already a name, or nothing — never a raw id.
 */
import { describe, test, expect } from '@jest/globals';
import { isPersonId, isPersonKey, personName, personRefsIn, displayNameOf, resolvePeople } from './person-names';

const ID = '692d8793-4d9f-4c43-a935-bf56cc637553';
const OTHER = '11111111-2222-4333-8444-555555555555';

describe('person keys and ids', () => {
  test('person columns are recognised', () => {
    for (const k of ['created_by', 'updated_by', 'approved_by', 'submitted_by', 'assigned_to', 'assignee', 'closed_by', 'minutes_approved_by', 'requested_by']) expect(isPersonKey(k)).toBe(true);
    for (const k of ['status', 'title', 'assigned_to_name', 'created_at', 'by_week']) expect(isPersonKey(k)).toBe(false);
  });
  test('an id is an id', () => {
    expect(isPersonId(ID)).toBe(true);
    expect(isPersonId(` ${ID.toUpperCase()} `)).toBe(true);
    expect(isPersonId('Elena Cordova')).toBe(false);
    expect(isPersonId(null)).toBe(false);
  });
});

describe('personName', () => {
  const people = { [ID]: 'Chad Derocher', 'pm@acme.test': 'Pat Morgan' };
  test('resolves an id to the name', () => expect(personName(ID, people)).toBe('Chad Derocher'));
  test('case of the id does not matter', () => expect(personName(ID.toUpperCase(), people)).toBe('Chad Derocher'));
  test('an unknown id is hidden, never printed', () => {
    expect(personName(OTHER, people)).toBeNull();
    expect(personName(OTHER, null)).toBeNull();
  });
  test('a typed name stays as typed', () => expect(personName('Elena Cordova', people)).toBe('Elena Cordova'));
  test('an email resolves to the name, else stays readable', () => {
    expect(personName('PM@acme.test', people)).toBe('Pat Morgan');
    expect(personName('field@acme.test', people)).toBe('field@acme.test');
  });
  test('blank is hidden', () => {
    expect(personName('', people)).toBeNull();
    expect(personName('   ', people)).toBeNull();
    expect(personName(undefined, people)).toBeNull();
  });
});

describe('refs and display names', () => {
  test('collects ids and emails from person columns only', () => {
    const refs = personRefsIn([{ created_by: ID, title: OTHER, approved_by: 'x@y.co', assigned_to: 'Elena' }, null]);
    expect(refs.sort()).toEqual([ID, 'x@y.co'].sort());
  });
  test('named keys are read even when not person-shaped', () => {
    expect(personRefsIn([{ uploaded_by: ID, owner: OTHER }], ['owner'])).toEqual([OTHER]);
  });
  test('display name prefers preferred, then full, then first + last', () => {
    expect(displayNameOf({ preferred_name: 'CJ', full_name: 'Chad Derocher' })).toBe('CJ');
    expect(displayNameOf({ full_name: 'Chad Derocher' })).toBe('Chad Derocher');
    expect(displayNameOf({ first_name: 'Ana', last_name: 'Ruiz' })).toBe('Ana Ruiz');
    expect(displayNameOf({ email: 'a@b.co' })).toBeNull();
  });
});

describe('resolvePeople', () => {
  /** A tiny stand-in for the Supabase client: tables of rows, eq/in filters. */
  function fakeDb(tables: Record<string, Array<Record<string, unknown>>>) {
    const calls: Array<{ table: string; filters: Array<[string, unknown]> }> = [];
    return {
      calls,
      from(table: string) {
        const filters: Array<[string, unknown]> = [];
        calls.push({ table, filters });
        const q = {
          select: () => q,
          eq: (c: string, v: unknown) => { filters.push([c, v]); return q; },
          in: (c: string, v: unknown[]) => { filters.push([c, v]); return q; },
          then: (res: (r: { data: unknown; error: null }) => unknown) => {
            const rows = (tables[table] || []).filter((r) => filters.every(([c, v]) => (Array.isArray(v) ? v.map(String).includes(String(r[c]).toLowerCase()) : r[c] === v)));
            return Promise.resolve({ data: rows, error: null }).then(res);
          },
        };
        return q;
      },
    };
  }

  test('profiles first, then employees; other tenants never', async () => {
    const db = fakeDb({
      profiles: [{ id: ID, tenant_id: 't1', full_name: 'Chad Derocher', email: 'chad@x.co' }, { id: OTHER, tenant_id: 't2', full_name: 'Someone Else' }],
      users: [],
      employees: [{ id: OTHER, tenant_id: 't1', first_name: 'Ana', last_name: 'Ruiz' }],
    });
    const people = await resolvePeople(db, 't1', [ID, OTHER, 'chad@x.co', 'Elena']);
    expect(people[ID]).toBe('Chad Derocher');
    expect(people[OTHER]).toBe('Ana Ruiz');
    expect(people['chad@x.co']).toBe('Chad Derocher');
    expect(db.calls.every((c) => c.filters.some(([k, v]) => k === 'tenant_id' && v === 't1'))).toBe(true);
  });

  test('nothing to look up → no reads', async () => {
    const db = fakeDb({});
    expect(await resolvePeople(db, 't1', ['Elena Cordova'])).toEqual({});
    expect(db.calls.length).toBe(0);
  });
});
