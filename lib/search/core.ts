/**
 * Search everything — the vocabulary and the ranking, shared by the route
 * (app/api/search) and the screens that show its results (the ⌘K palette and
 * /app/search).
 *
 * A leaf module on purpose: no server imports, so a client component can read
 * the type labels and order from the same place the route ranks with.
 *
 * How a query is read:
 *   "RFI-005", "rfi 5", "RFI #5"   → a typed number: RFI number 5, ranked first
 *   "CO 3", "PA 2", "INV 88"       → the same for change orders, pay apps, invoices
 *   "5"                            → a bare number: every numbered record #5 first
 *   "A-101", "a101"                → a code: an exact sheet/number match first
 *   "smoke damper"                 → words, in order, anywhere in the field
 * Then within a type: exact number → exact name → starts with → contains.
 */
import { meetsLevel, type PermCategory, type PermLevel } from '@/lib/permission-categories';

export type SearchType =
  | 'job' | 'lead' | 'customer' | 'contact' | 'sub'
  | 'rfi' | 'submittal' | 'change_order' | 'punch' | 'daily_log'
  | 'drawing' | 'file' | 'photo' | 'invoice' | 'pay_app' | 'person';

export interface SearchHit {
  type: SearchType;
  id: string;
  /** The record's number as people say it ("RFI-005", "CO-003", "A-101"). */
  number?: string;
  label: string;
  /** One quiet line: status, trade, company, date. */
  sub?: string;
  project?: { id: string; name: string } | null;
  href: string;
  /** Higher is better; see rankHit. */
  rank: number;
}

export interface SearchGroup {
  type: SearchType;
  label: string;
  /** Every match in the database for this type, not just the rows returned. */
  count: number;
  hits: SearchHit[];
}

export interface SearchResponse {
  q: string;
  groups: SearchGroup[];
  /** Flat, best-first — kept for callers that list hits without groups. */
  results: SearchHit[];
  total: number;
}

/** Display order when two groups rank the same, and the filter chip order. */
export const TYPE_ORDER: SearchType[] = [
  'job', 'rfi', 'submittal', 'change_order', 'punch', 'drawing', 'daily_log', 'file', 'photo',
  'invoice', 'pay_app', 'lead', 'customer', 'contact', 'sub', 'person',
];

export const TYPE_LABEL: Record<SearchType, { one: string; many: string }> = {
  job: { one: 'Job', many: 'Jobs' },
  lead: { one: 'Lead', many: 'Leads & deals' },
  customer: { one: 'Customer', many: 'Customers' },
  contact: { one: 'Contact', many: 'Contacts' },
  sub: { one: 'Sub', many: 'Subs & vendors' },
  rfi: { one: 'RFI', many: 'RFIs' },
  submittal: { one: 'Submittal', many: 'Submittals' },
  change_order: { one: 'Change order', many: 'Change orders' },
  punch: { one: 'Punch item', many: 'Punch items' },
  daily_log: { one: 'Daily log', many: 'Daily logs' },
  drawing: { one: 'Drawing', many: 'Drawings' },
  file: { one: 'File', many: 'Files' },
  photo: { one: 'Photo', many: 'Photos' },
  invoice: { one: 'Invoice', many: 'Invoices' },
  pay_app: { one: 'Pay app', many: 'Pay apps' },
  person: { one: 'Person', many: 'People' },
};

/** The permission (at View) a user needs to see a type in search — the same
 *  category its own screens and routes check. */
export const TYPE_PERMISSION: Record<SearchType, PermCategory> = {
  job: 'Projects',
  lead: 'Sales',
  customer: 'Sales',
  contact: 'Projects',
  sub: 'Projects',
  rfi: 'RFIs',
  submittal: 'Submittals',
  change_order: 'Change Orders',
  punch: 'Projects',
  daily_log: 'Projects',
  drawing: 'Documents',
  file: 'Documents',
  photo: 'Projects',
  invoice: 'Budget',
  pay_app: 'Pay Apps',
  person: 'Projects',
};

/** Words people type in front of a record number, per numbered type. */
export const NUMBER_PREFIXES: Partial<Record<SearchType, string[]>> = {
  rfi: ['rfi'],
  submittal: ['submittal', 'sub', 'smt', 'sm'],
  change_order: ['co', 'cor', 'changeorder', 'change'],
  punch: ['punch', 'pl', 'pi', 'item'],
  pay_app: ['pa', 'payapp', 'payapplication', 'app', 'application', 'payapplicaton'],
  invoice: ['inv', 'invoice'],
  job: ['job', 'project', 'proj'],
};

/** The types a permission map may search: View on each type's category.
 *  A role with Budget: None never sees an invoice hit — not a count, not a row. */
export function allowedSearchTypes(perms: Partial<Record<PermCategory, PermLevel>>): SearchType[] {
  return TYPE_ORDER.filter((t) => meetsLevel(perms[TYPE_PERMISSION[t]], 'View'));
}

export function isSearchType(v: string): v is SearchType {
  return (TYPE_ORDER as string[]).includes(v);
}

/** Keep letters, digits and the few marks that appear in record codes, names
 *  and emails; everything else becomes a space. That removes every character
 *  that could steer a PostgREST filter (, ( ) " \) or act as an ilike wildcard
 *  (% _ *), and bounds the length. What is left is plain text. */
export function cleanQuery(raw: string): string {
  return String(raw ?? '')
    .replace(/[^\p{L}\p{N}\s&@+.\-/#:]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64);
}

/** Lowercase, alphanumerics only, leading zeros dropped from every digit run:
 *  "RFI-005" → "rfi5", "A-101" → "a101", "INV-2026-0088" → "inv202688". */
export function norm(s: string | null | undefined): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .replace(/(^|[^0-9])0+(?=[0-9])/g, '$1');
}

/** The trailing number of a record code: "RFI-005" → 5, "INV-2026-0088" → 88. */
export function trailingNumber(s: string | number | null | undefined): number | null {
  if (typeof s === 'number') return Number.isFinite(s) ? s : null;
  const m = String(s ?? '').match(/(\d+)\D*$/);
  return m ? parseInt(m[1], 10) : null;
}

export interface ParsedQuery {
  /** The cleaned text. */
  text: string;
  /** "%smoke%damper%" — every separator becomes "any run of characters". */
  like: string;
  /** Types the typed prefix names ("rfi 5" → ['rfi']); empty for a bare number. */
  numberTypes: SearchType[];
  /** The record number asked for, when the query is "[prefix] number". */
  number: number | null;
  /** Normalized form for exact-code comparison. */
  normalized: string;
  /** A calendar date the query names (daily logs), as YYYY-MM-DD. */
  date: string | null;
  /** A single word, lowercased — used for exact tag matches. */
  word: string | null;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

function parseDate(text: string, now = new Date()): string | null {
  let m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = text.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (m) {
    let y = m[3] ? +m[3] : now.getFullYear();
    if (y < 100) y += 2000;
    return valid(y, +m[1], +m[2]);
  }
  return null;
  function valid(y: number, mo: number, d: number): string | null {
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCMonth() !== mo - 1) return null;
    return `${y}-${pad2(mo)}-${pad2(d)}`;
  }
}

export function parseQuery(raw: string): ParsedQuery {
  const text = cleanQuery(raw);
  const parts = text.split(/[\s\-./#:]+/).filter(Boolean);
  const like = parts.length ? `%${parts.join('%')}%` : '';

  let number: number | null = null;
  let numberTypes: SearchType[] = [];
  const m = text.match(/^([a-z][a-z ]*?)?[\s#:.-]*0*(\d{1,9})$/i);
  if (m) {
    const prefix = (m[1] || '').replace(/\s+/g, '').toLowerCase();
    const n = parseInt(m[2], 10);
    if (!prefix) {
      number = n;
    } else {
      const named = (Object.keys(NUMBER_PREFIXES) as SearchType[]).filter((t) => NUMBER_PREFIXES[t]!.includes(prefix));
      if (named.length) { number = n; numberTypes = named; }
    }
  }

  const word = /^[a-z][a-z0-9-]{1,30}$/i.test(text) ? text.toLowerCase() : null;
  return { text, like, numberTypes, number, normalized: norm(text), date: parseDate(text), word };
}

/** Does this query ask for type `t` by number? A bare number asks every
 *  numbered type; "rfi 5" asks only RFIs. */
export function asksNumberOf(p: ParsedQuery, t: SearchType): boolean {
  if (p.number == null || !NUMBER_PREFIXES[t]) return false;
  return p.numberTypes.length === 0 || p.numberTypes.includes(t);
}

/**
 * Score one hit against the query. 100 exact number/code, 90 the bare number,
 * 70 exact name, 50 name starts with it, 40 a word in the name starts with it,
 * 30 name contains it, 10 matched another field (the database found it there).
 */
export function rankHit(
  p: ParsedQuery,
  t: SearchType,
  fields: { number?: string | number | null; label: string; extra?: Array<string | null | undefined> },
): number {
  const q = p.text.toLowerCase();
  const qn = p.normalized;
  const num = fields.number == null ? '' : String(fields.number);
  if (num) {
    const nn = norm(num);
    if (qn && nn === qn) return 100;
    if (asksNumberOf(p, t) && trailingNumber(fields.number) === p.number) return p.numberTypes.length ? 100 : 90;
  }
  const label = (fields.label || '').toLowerCase();
  if (label && (label === q || norm(label) === qn)) return 70;
  if (num && qn && norm(num).startsWith(qn)) return 55;
  if (label.startsWith(q)) return 50;
  if (label.split(/[\s\-/(),.]+/).some((w) => w && w.startsWith(q))) return 40;
  if (label.includes(q)) return 30;
  if (num && num.toLowerCase().includes(q)) return 30;
  return 10;
}

/** Order groups: the group holding the best hit first, ties by TYPE_ORDER. */
export function orderGroups(groups: SearchGroup[]): SearchGroup[] {
  const top = (g: SearchGroup) => (g.hits[0]?.rank ?? 0);
  return [...groups].sort((a, b) => top(b) - top(a) || TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type));
}

/** Best-first, stable on the incoming (newest-first) order. */
export function sortHits(hits: SearchHit[]): SearchHit[] {
  return hits.map((h, i) => ({ h, i })).sort((a, b) => b.h.rank - a.h.rank || a.i - b.i).map(({ h }) => h);
}

/** "CO-003" from 3; "PA #2" etc. */
export const padNum = (n: number | null | undefined, width = 3) =>
  n == null ? '' : String(n).padStart(width, '0');
