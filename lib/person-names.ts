/**
 * Who a "by" field means, as a name — never a raw id.
 *
 * WHY. Records keep people two ways: a uuid column (created_by, approved_by on
 * bills and POs…) or a text column that sometimes holds a name and sometimes a
 * user id (rfis.submitted_by, punch_list.completed_by, daily_logs.approved_by,
 * change_orders.approved_by, pay_applications.approved_by). Record pages
 * printed whatever was there, so "Created by" read
 * "692d8793-4d9f-4c43-a935-bf56cc637553". Measured on production 17 Oct 2026:
 * 39 of those ids across 7 columns.
 *
 * ONE PATH. The server resolves every person-looking value through
 * resolvePeople (profiles → users → employees, tenant-scoped) and hands the
 * page a { id → name } map; the page shows personName(value, people), which
 * gives the name, the text as typed when it is already a name, or null — and
 * null means the row is hidden. An id is never printed.
 *
 * Pure helpers here are safe on the client; resolvePeople takes the caller's
 * server client.
 */

type Rec = Record<string, unknown>;

export const PERSON_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A stored user id (as opposed to a typed name). */
export function isPersonId(v: unknown): boolean {
  return typeof v === 'string' && PERSON_ID_RE.test(v.trim());
}

/** Columns that hold a person: anything "…_by", "assigned_to", "assignee", "owner_id", "user_id". */
export function isPersonKey(key: string): boolean {
  return /_by$|_by_id$|^assigned_to(_id)?$|^assignee(_id)?$|^owner_id$|^user_id$|^requested_by$|^reported_by$/.test(key);
}

export type People = Record<string, string>;

/** Ids and emails worth resolving in these rows' person columns (or the keys given). */
export function personRefsIn(rows: ReadonlyArray<Rec | null | undefined>, keys?: readonly string[]): string[] {
  const out = new Set<string>();
  for (const r of rows) {
    if (!r) continue;
    for (const k of keys ?? Object.keys(r)) {
      if (!keys && !isPersonKey(k)) continue;
      const v = r[k];
      if (typeof v !== 'string') continue;
      const t = v.trim();
      if (isPersonId(t)) out.add(t.toLowerCase());
      else if (EMAIL_RE.test(t)) out.add(t.toLowerCase());
    }
  }
  return Array.from(out);
}

/**
 * What to show for a person value: their name, the text as typed when it is
 * already a name, or null (hide the row) — never an id. An email with no name
 * on file is shown as the email; it is still a way to reach the person.
 */
export function personName(value: unknown, people?: People | null): string | null {
  if (value == null) return null;
  const t = String(value).trim();
  if (!t) return null;
  const hit = people?.[t.toLowerCase()];
  if (hit) return hit;
  if (isPersonId(t)) return null;
  return t;
}

/** A display name from a profile / user / employee row. */
export function displayNameOf(r: Rec | null | undefined): string | null {
  if (!r) return null;
  const first = String(r.first_name ?? '').trim();
  const last = String(r.last_name ?? '').trim();
  const name = String(r.preferred_name ?? '').trim() || String(r.full_name ?? '').trim() || [first, last].filter(Boolean).join(' ');
  return name || null;
}

/* ── server ──────────────────────────────────────────────────────────── */

type Db = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Names for the given ids / emails, from the tenant's people: profiles (who
 * signs in), users, then employees (crew without a login). Keys are lower-cased.
 * Anything not found is simply absent — personName then hides it.
 */
export async function resolvePeople(db: Db, tenantId: string, refs: readonly string[]): Promise<People> {
  const people: People = {};
  const ids = Array.from(new Set(refs.filter(isPersonId).map((r) => r.toLowerCase()))).slice(0, 500);
  const emails = Array.from(new Set(refs.filter((r) => !isPersonId(r) && EMAIL_RE.test(r)).map((r) => r.toLowerCase()))).slice(0, 200);
  if (!ids.length && !emails.length) return people;

  const take = (rows: Rec[] | null | undefined) => {
    for (const r of rows || []) {
      const name = displayNameOf(r);
      if (!name) continue;
      const id = String(r.id ?? '').toLowerCase();
      const email = String(r.email ?? '').trim().toLowerCase();
      if (id && ids.includes(id) && !people[id]) people[id] = name;
      if (email && emails.includes(email) && !people[email]) people[email] = name;
    }
  };
  const missing = () => ids.filter((i) => !people[i]);
  const missingEmails = () => emails.filter((e) => !people[e]);

  for (const [table, cols] of [
    ['profiles', 'id, email, full_name, preferred_name, first_name'],
    ['users', 'id, email, full_name'],
    ['employees', 'id, email, full_name, first_name, last_name'],
  ] as const) {
    const wantIds = missing();
    const wantEmails = missingEmails();
    if (!wantIds.length && !wantEmails.length) break;
    if (wantIds.length) {
      const { data, error } = await db.from(table).select(cols).eq('tenant_id', tenantId).in('id', wantIds);
      if (error) throw error;
      take(data as Rec[]);
    }
    if (wantEmails.length) {
      const { data, error } = await db.from(table).select(cols).eq('tenant_id', tenantId).in('email', wantEmails);
      if (error) throw error;
      take(data as Rec[]);
    }
  }
  return people;
}

/** The { id → name } map for the person columns in these rows. */
export async function peopleFor(db: Db, tenantId: string, rows: ReadonlyArray<Rec | null | undefined>, keys?: readonly string[]): Promise<People> {
  return resolvePeople(db, tenantId, personRefsIn(rows, keys));
}
