/**
 * The one way to link to a record — for screens, in-app notifications, push
 * and email buttons. Each type maps to the page that really shows ONE record
 * (checked against app/app by lib/rfi.sanity.test.ts), or, for the few
 * tools with no record page, its list opened on that record where the list
 * supports ?open=, else its list.
 *
 * Why: notifications linked to /app/projects/:job/rfis/:id (no such page —
 * a 404) and every email button pointed at /app (the dashboard).
 *
 * Pure: no server imports.
 */

export type RecordType =
  | 'rfis' | 'submittals' | 'punch_list' | 'daily_logs' | 'change_orders' | 'inspections'
  | 'contracts' | 'purchase_orders'
  | 'pay_apps' | 'meetings' | 'drawings' | 'bid_packages'
  | 'invoices' | 'bills';

/** Tools shown on the shared item page: /app/projects/:job/items/:tool/:id. */
export const ITEM_PAGE_TYPES: readonly RecordType[] = [
  'rfis', 'submittals', 'punch_list', 'daily_logs', 'change_orders', 'inspections', 'contracts', 'purchase_orders',
];

/** Their own record pages: /app/projects/:job/<segment>/:id. */
export const OWN_PAGE_SEGMENT: Partial<Record<RecordType, string>> = {
  pay_apps: 'pay-apps',
  meetings: 'meetings',
  drawings: 'drawings',
  bid_packages: 'bid-packages',
};

/** Each type's list on the job. */
export const LIST_SEGMENT: Record<RecordType, string> = {
  rfis: 'rfis', submittals: 'submittals', punch_list: 'punch-list', daily_logs: 'daily-logs',
  change_orders: 'change-orders', inspections: 'inspections', contracts: 'contracts', purchase_orders: 'purchase-orders',
  pay_apps: 'pay-apps', meetings: 'meetings', drawings: 'drawings', bid_packages: 'bid-packages',
  invoices: 'invoices', bills: 'bills',
};

/**
 * Old record-style paths (/app/projects/:job/<segment>/:id) that never had a
 * page, and the type each one means. Each has a thin redirect page so links
 * already sent in notifications and emails keep working.
 */
export const LEGACY_RECORD_SEGMENTS: Record<string, RecordType> = {
  rfis: 'rfis', submittals: 'submittals', 'punch-list': 'punch_list', 'daily-logs': 'daily_logs',
  'change-orders': 'change_orders', inspections: 'inspections', 'purchase-orders': 'purchase_orders',
};

/** Spellings callers use for a type ('rfi', 'change-orders', 'punch', 'pay-app'…). */
const ALIASES: Record<string, RecordType> = {
  rfi: 'rfis', rfis: 'rfis',
  submittal: 'submittals', submittals: 'submittals',
  punch: 'punch_list', punch_item: 'punch_list', punch_list: 'punch_list', 'punch-list': 'punch_list',
  daily_log: 'daily_logs', daily_logs: 'daily_logs', 'daily-logs': 'daily_logs', dailylog: 'daily_logs',
  change_order: 'change_orders', change_orders: 'change_orders', 'change-orders': 'change_orders', co: 'change_orders',
  inspection: 'inspections', inspections: 'inspections',
  contract: 'contracts', contracts: 'contracts', subcontract: 'contracts',
  purchase_order: 'purchase_orders', purchase_orders: 'purchase_orders', 'purchase-orders': 'purchase_orders', po: 'purchase_orders',
  pay_app: 'pay_apps', pay_apps: 'pay_apps', 'pay-app': 'pay_apps', 'pay-apps': 'pay_apps', pay_application: 'pay_apps', pay_applications: 'pay_apps',
  meeting: 'meetings', meetings: 'meetings',
  drawing: 'drawings', drawings: 'drawings',
  bid_package: 'bid_packages', bid_packages: 'bid_packages', 'bid-packages': 'bid_packages',
  invoice: 'invoices', invoices: 'invoices',
  bill: 'bills', bills: 'bills',
};

export function recordType(v: unknown): RecordType | null {
  return ALIASES[String(v ?? '').trim().toLowerCase()] ?? null;
}

const ID = /^[0-9a-z-]{1,64}$/i;
const clean = (v: unknown) => String(v ?? '').trim();

function withQuery(path: string, query?: Record<string, string | null | undefined>): string {
  const q = Object.entries(query || {}).filter(([, v]) => v != null && v !== '');
  if (!q.length) return path;
  const sp = new URLSearchParams(q as [string, string][]);
  return `${path}${path.includes('?') ? '&' : '?'}${sp.toString()}`;
}

/** '/app/…' → 'https://saguarocontrol.net/app/…' when a base is given; trailing slashes on the base are fine. */
export function absoluteUrl(path: string, base?: string | null): string {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const b = clean(base).replace(/\/+$/, '');
  return b ? `${b}${path.startsWith('/') ? '' : '/'}${path}` : path;
}

/** The job's list for a type: '/app/projects/:job/rfis'. '' without a job. */
export function listHref(type: RecordType | string, projectId: unknown, opts: { base?: string | null; query?: Record<string, string | null | undefined> } = {}): string {
  const t = recordType(type);
  const pid = clean(projectId);
  if (!t || !ID.test(pid)) return '';
  return absoluteUrl(withQuery(`/app/projects/${pid}/${LIST_SEGMENT[t]}`, opts.query), opts.base);
}

/**
 * The page for one record. Falls back to the job's list (never the
 * dashboard) when the record id is missing, and to '' when the job is.
 */
export function recordHref(
  type: RecordType | string, projectId: unknown, id: unknown,
  opts: { base?: string | null; query?: Record<string, string | null | undefined> } = {},
): string {
  const t = recordType(type);
  const pid = clean(projectId);
  const rid = clean(id);
  if (!t || !ID.test(pid)) return '';
  if (!rid || !ID.test(rid)) return listHref(t, pid, opts);
  let path: string;
  if (ITEM_PAGE_TYPES.includes(t)) path = `/app/projects/${pid}/items/${t}/${rid}`;
  else if (OWN_PAGE_SEGMENT[t]) path = `/app/projects/${pid}/${OWN_PAGE_SEGMENT[t]}/${rid}`;
  // Invoices and bills have no one-record page yet: their list.
  else path = `/app/projects/${pid}/${LIST_SEGMENT[t]}`;
  return absoluteUrl(withQuery(path, opts.query), opts.base);
}

/** Where a legacy /app/projects/:job/<segment>/:id path should go now. */
export function legacyRecordTarget(segment: string, projectId: unknown, id: unknown): string {
  const t = LEGACY_RECORD_SEGMENTS[segment];
  return t ? recordHref(t, projectId, id) : '/app';
}

/**
 * Where sign-in sends someone afterwards: only a path on this site. A full
 * URL, '//evil.example', a backslash trick or a javascript: value falls back
 * to '/app' — the ?next= on the login link is anyone's to edit.
 */
export function safeNextPath(next: unknown, fallback = '/app'): string {
  const s = String(next ?? '').trim();
  if (!s || !s.startsWith('/') || s.startsWith('//') || s.startsWith('/\\') || /[\u0000-\u001f]/.test(s)) return fallback;
  if (/^\/(login|signup)(\/|\?|$)/.test(s)) return fallback;
  return s;
}
