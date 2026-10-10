/**
 * Saguaro → QuickBooks Online mapping. Pure: no network, no database.
 *
 * What is sent, and why each choice:
 *
 *   Pay application  → Invoice. Amount = current_payment_due, G702 line 8
 *                      ("current payment due" — this period's draw after
 *                      retainage and previous certificates). Never a running
 *                      total: the contract sum, completed-to-date and earned-
 *                      less-retainage figures are cumulative and would bill the
 *                      owner again for every prior period. net_payment_due is
 *                      written with the same value at create/edit and is only
 *                      read when current_payment_due is empty.
 *                      Only approved / certified / paid apps are invoiced.
 *   Job owner        → Customer (the invoice's CustomerRef). The project's
 *                      owner_entity (the company) wins over owner_name.
 *   Subcontractor    → Vendor.
 *
 * Bills are not sent: the bills table names its vendor as free text with no
 * link to a subcontractor and has no column to remember the QuickBooks id, so a
 * push could neither pick the right Vendor nor avoid duplicating on re-sync.
 */
import { dayIn } from '@/lib/time-zone';

export type SyncEntity = 'customers' | 'vendors' | 'invoices';
export const SYNC_ENTITIES: SyncEntity[] = ['customers', 'vendors', 'invoices'];

export const INVOICEABLE_STATUSES = ['approved', 'certified', 'paid'] as const;

/** QuickBooks limits (Intuit API reference). */
const MAX_NAME = 100;
const MAX_DOC_NUMBER = 21;
const MAX_PHONE = 30;
const MAX_EMAIL = 100;
const MAX_MEMO = 1000;
const MAX_LINE_DESC = 4000;

export type PayAppIn = {
  id: string;
  project_id: string;
  app_number: number | null;
  status: string | null;
  current_payment_due: number | string | null;
  net_payment_due: number | string | null;
  application_date: string | null;
  period_from: string | null;
  period_to: string | null;
  approved_at: string | null;
  certified_at: string | null;
  created_at: string | null;
  owner_name: string | null;
  qbo_invoice_id?: string | null;
  deleted_at?: string | null;
};

export type ProjectIn = {
  id: string;
  name: string | null;
  project_number: string | null;
  owner_entity: string | null;
  owner_name: string | null;
  owner_email: string | null;
  owner_phone: string | null;
  owner_address: string | null;
};

export type SubIn = {
  id: string;
  company_name: string | null;
  dba_name?: string | null;
  email: string | null;
  contact_email: string | null;
  phone: string | null;
  contact_phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

export type Owner = { name: string; email: string; phone: string; address: string };

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const cap = (s: string, n: number) => (s.length > n ? s.slice(0, n).trim() : s);

/** QuickBooks DisplayName: no colon (it is the Customer:Job separator), tab or newline. */
export function cleanName(v: unknown): string {
  return cap(str(v).replace(/[\t\r\n]+/g, ' ').replace(/:/g, '-').replace(/\s{2,}/g, ' ').trim(), MAX_NAME);
}

/** Case-insensitive key for remembering a QuickBooks id by name. */
export const nameKey = (name: string) => cleanName(name).toLowerCase();

/** A single-quoted literal for QuickBooks' query language. */
export function qboQuote(v: string): string {
  return `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

export function validEmail(v: unknown): string {
  const s = str(v);
  return s.length <= MAX_EMAIL && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : '';
}

/** Dollars rounded to the cent, or null when the value is not a number. */
export function toMoney(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  // Shift by the decimal string, not by multiplying: 2500.555 * 100 is
  // 250055.49999… in binary and would round down a cent.
  const s = String(n);
  const cents = s.includes('e') ? Math.round(n * 100) : Math.round(Number(`${s}e2`));
  return cents / 100;
}

/** G702 line 8 for this period. */
export function payAppAmount(pa: Pick<PayAppIn, 'current_payment_due' | 'net_payment_due'>): number | null {
  const current = toMoney(pa.current_payment_due);
  if (current !== null) return current;
  return toMoney(pa.net_payment_due);
}

/** 'YYYY-MM-DD' for a date column as stored, or the company's day for a timestamp. */
export function dayOf(v: unknown, zone: string): string {
  const s = str(v);
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : dayIn(zone, d);
}

/** The invoice date: the application date, else the period end, else when it was certified/approved/created. */
export function payAppTxnDate(pa: PayAppIn, zone: string, now: Date = new Date()): string {
  return dayOf(pa.application_date, zone)
    || dayOf(pa.period_to, zone)
    || dayOf(pa.certified_at, zone)
    || dayOf(pa.approved_at, zone)
    || dayOf(pa.created_at, zone)
    || dayIn(zone, now);
}

/** Why a pay app is not sent this run, or null when it should be. */
export function payAppSkipReason(pa: PayAppIn, startDay: string | null, zone: string): string | null {
  if (pa.deleted_at) return 'deleted';
  if (str(pa.qbo_invoice_id)) return 'already in QuickBooks';
  const status = str(pa.status).toLowerCase();
  if (!(INVOICEABLE_STATUSES as readonly string[]).includes(status)) return `status is ${status || 'blank'} — only approved, certified or paid apps are invoiced`;
  if (startDay) {
    const d = payAppTxnDate(pa, zone);
    if (d < startDay) return `dated ${d}, before the ${startDay} start date`;
  }
  return null;
}

/**
 * The job's owner — the invoice's customer. owner_entity is TEXT and on some
 * jobs holds JSON ("{}" or {"name":…}); the company name wins over the person.
 */
export function ownerOf(project: ProjectIn | null | undefined, payApp?: Pick<PayAppIn, 'owner_name'> | null): Owner | null {
  const p = project;
  let name = str(p?.owner_entity);
  let email = str(p?.owner_email);
  let address = str(p?.owner_address);
  if (name.startsWith('{')) {
    let o: Record<string, unknown> | null = null;
    try { o = JSON.parse(name) as Record<string, unknown>; } catch { o = null; /* not JSON: keep the text as the name */ }
    if (o && typeof o === 'object') {
      name = str(o.name);
      email = email || str(o.email);
      address = address || str(o.address);
    }
  }
  name = cleanName(name || str(p?.owner_name) || str(payApp?.owner_name));
  if (!name) return null;
  return { name, email: validEmail(email), phone: cap(str(p?.owner_phone), MAX_PHONE), address: cap(address, 500) };
}

export function customerPayload(owner: Owner): Record<string, unknown> {
  const out: Record<string, unknown> = { DisplayName: owner.name, CompanyName: owner.name };
  if (owner.email) out.PrimaryEmailAddr = { Address: owner.email };
  if (owner.phone) out.PrimaryPhone = { FreeFormNumber: owner.phone };
  if (owner.address) out.BillAddr = { Line1: owner.address };
  return out;
}

export function vendorPayload(sub: SubIn): { ok: true; name: string; payload: Record<string, unknown> } | { ok: false; reason: string } {
  const name = cleanName(sub.company_name || sub.dba_name);
  if (!name) return { ok: false, reason: 'no company name on the sub' };
  const payload: Record<string, unknown> = { DisplayName: name, CompanyName: name, PrintOnCheckName: name };
  const email = validEmail(sub.email) || validEmail(sub.contact_email);
  if (email) payload.PrimaryEmailAddr = { Address: email };
  const phone = cap(str(sub.phone) || str(sub.contact_phone), MAX_PHONE);
  if (phone) payload.PrimaryPhone = { FreeFormNumber: phone };
  const addr: Record<string, string> = {};
  if (str(sub.address)) addr.Line1 = cap(str(sub.address), 500);
  if (str(sub.city)) addr.City = cap(str(sub.city), 255);
  if (str(sub.state)) addr.CountrySubDivisionCode = cap(str(sub.state), 255);
  if (str(sub.zip)) addr.PostalCode = cap(str(sub.zip), 30);
  if (Object.keys(addr).length) payload.BillAddr = addr;
  return { ok: true, name, payload };
}

/** Written into every invoice's private note, so a lost id can be found again instead of duplicated. */
export const invoiceMarker = (payAppId: string) => `Saguaro pay app ${payAppId}`;

/**
 * Invoice number: "<job number>-PA<n>" (QuickBooks caps it at 21 characters).
 * Two jobs each have a pay app #3, so the app number alone would collide.
 */
export function invoiceDocNumber(pa: Pick<PayAppIn, 'app_number' | 'project_id'>, project: Pick<ProjectIn, 'project_number'> | null): string {
  const suffix = `PA${pa.app_number ?? 0}`;
  const job = str(project?.project_number).replace(/[^A-Za-z0-9-]+/g, '').replace(/^-+|-+$/g, '')
    || str(pa.project_id).replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase();
  const room = MAX_DOC_NUMBER - suffix.length - 1;
  return room > 0 && job ? `${job.slice(0, room)}-${suffix}` : suffix.slice(0, MAX_DOC_NUMBER);
}

export function invoicePayload(p: {
  payApp: PayAppIn;
  project: ProjectIn | null;
  customerId: string;
  itemId: string;
  zone: string;
  now?: Date;
}): { ok: true; amount: number; docNumber: string; payload: Record<string, unknown> } | { ok: false; reason: string } {
  const { payApp: pa, project } = p;
  const amount = payAppAmount(pa);
  if (amount === null) return { ok: false, reason: 'no current payment due (G702 line 8) on the pay app' };
  if (amount <= 0) return { ok: false, reason: `current payment due is ${amount.toFixed(2)} — nothing to invoice` };
  if (!p.customerId) return { ok: false, reason: 'no QuickBooks customer for the job owner' };
  if (!p.itemId) return { ok: false, reason: 'no QuickBooks item to bill against' };

  const job = str(project?.name) || 'Project';
  const n = pa.app_number ?? 0;
  const from = dayOf(pa.period_from, p.zone);
  const to = dayOf(pa.period_to, p.zone);
  const period = from && to ? `, period ${from} to ${to}` : to ? `, period to ${to}` : '';
  const title = `${job} — Pay Application #${n}${period}`;
  const docNumber = invoiceDocNumber(pa, project);

  return {
    ok: true,
    amount,
    docNumber,
    payload: {
      CustomerRef: { value: p.customerId },
      TxnDate: payAppTxnDate(pa, p.zone, p.now),
      DocNumber: docNumber,
      PrivateNote: cap(`${invoiceMarker(pa.id)} · ${title}`, 4000),
      CustomerMemo: { value: cap(title, MAX_MEMO) },
      Line: [{
        Amount: amount,
        DetailType: 'SalesItemLineDetail',
        Description: cap(`${title} — current payment due (G702 line 8)`, MAX_LINE_DESC),
        SalesItemLineDetail: { ItemRef: { value: p.itemId } },
      }],
    },
  };
}

/** Pick the income account a new "Progress Billing" item posts to. Never Uncategorized Income. */
export function pickIncomeAccount(accounts: { Id: string; Name?: string; Active?: boolean }[]): { Id: string; Name: string } | null {
  const usable = accounts.filter((a) => a && a.Id && a.Active !== false && !/uncategori[sz]ed/i.test(a.Name ?? ''));
  const rank = (name: string) =>
    /contract|construction|progress|billing/i.test(name) ? 0
      : /services?/i.test(name) ? 1
        : /sales|revenue|income/i.test(name) ? 2
          : 3;
  const best = usable.slice().sort((a, b) => rank(a.Name ?? '') - rank(b.Name ?? ''))[0];
  return best ? { Id: best.Id, Name: best.Name ?? '' } : null;
}

/** Intuit's error body → one readable line plus its code. Handles both `Fault` and `fault` shapes. */
export function parseQboFault(text: string): { message: string; code: string } {
  type J = Record<string, unknown>;
  const obj = (v: unknown): J | null => (v && typeof v === 'object' ? (v as J) : null);
  let parsed: unknown = null;
  try { parsed = JSON.parse(text); } catch { parsed = null; /* not JSON: fall back to the raw text */ }
  const body = obj(parsed);
  const fault = obj(body?.Fault ?? body?.fault);
  const list = fault?.Error ?? fault?.error;
  const err = Array.isArray(list) ? obj(list[0]) : null;
  if (err) {
    const message = str(err.Message ?? err.message);
    const detail = str(err.Detail ?? err.detail);
    const code = err.code === undefined || err.code === null ? '' : String(err.code).trim();
    const line = detail && detail !== message ? `${message}${message ? ' — ' : ''}${detail}` : message || detail;
    return { message: cap(line || 'QuickBooks rejected the request', 300), code };
  }
  if (body && (body.error || body.error_description)) {
    return { message: cap(str(body.error_description) || str(body.error), 300), code: str(body.error) };
  }
  return { message: cap(str(text) || 'QuickBooks rejected the request', 300), code: '' };
}

export type SyncOutcome = 'created' | 'linked' | 'skipped' | 'failed';
export type SyncRecordResult = {
  entity: 'customer' | 'vendor' | 'invoice';
  /** Saguaro id (pay app / sub / project). */
  id: string;
  label: string;
  outcome: SyncOutcome;
  qboId?: string;
  message?: string;
};

export type SyncCounts = { created: number; linked: number; skipped: number; failed: number };

export function countOutcomes(results: SyncRecordResult[]): SyncCounts & { byEntity: Record<string, SyncCounts> } {
  const zero = (): SyncCounts => ({ created: 0, linked: 0, skipped: 0, failed: 0 });
  const total = zero();
  const byEntity: Record<string, SyncCounts> = {};
  for (const r of results) {
    total[r.outcome]++;
    (byEntity[r.entity] ??= zero())[r.outcome]++;
  }
  return { ...total, byEntity };
}

/** The entities a request named, deduplicated and in dependency order (customers before invoices). */
export function normalizeEntities(input: unknown): SyncEntity[] {
  const asked = new Set(Array.isArray(input) ? input.map((x) => String(x)) : []);
  return SYNC_ENTITIES.filter((e) => asked.has(e));
}

/** A start date the page sent: 'YYYY-MM-DD' that is a real calendar day, or null. */
export function parseStartDay(v: unknown): string | null {
  const s = str(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : null;
}
