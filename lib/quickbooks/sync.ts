/**
 * QuickBooks push — Saguaro records → QuickBooks Online, idempotently.
 *
 * Idempotency, per record:
 *   Pay app → Invoice   pay_applications.qbo_invoice_id. Only rows without one
 *                       are read. Before creating, the invoice number is looked
 *                       up and an invoice carrying this pay app's marker in its
 *                       private note is LINKED, not duplicated — so a crash
 *                       between "Intuit created it" and "Saguaro saved the id"
 *                       heals on the next run.
 *   Sub → Vendor        subcontractors.qbo_vendor_id; a vendor already in
 *                       QuickBooks under the same name is linked, not duplicated.
 *   Owner → Customer    remembered by name in the row's settings (per company);
 *                       an existing customer with the name is linked.
 *
 * Every record reports its own outcome. Nothing is swallowed: a failure is a
 * 'failed' result with Intuit's reason, and the run carries on with the next.
 * A lost authorization stops the run (QboReconnectError) — the caller reports
 * the results so far.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { must } from '@/lib/db-write';
import { QboApiError, QboReconnectError, type QboClient } from './client';
import {
  INVOICEABLE_STATUSES, customerPayload, invoiceMarker, invoicePayload, nameKey, ownerOf,
  payAppSkipReason, pickIncomeAccount, qboQuote, vendorPayload,
  type Owner, type PayAppIn, type ProjectIn, type SubIn, type SyncEntity, type SyncRecordResult,
} from './mapping';
import type { QboCache } from './settings';

type Db = SupabaseClient<Database>;

/** Per run, so one press of Sync finishes inside the function's time limit. */
export const BATCH = { invoices: 25, vendors: 60, customers: 60 } as const;

const PAY_APP_COLUMNS = 'id, project_id, app_number, status, current_payment_due, net_payment_due, application_date, period_from, period_to, approved_at, certified_at, created_at, owner_name, qbo_invoice_id, deleted_at';
const PROJECT_COLUMNS = 'id, name, project_number, owner_entity, owner_name, owner_email, owner_phone, owner_address';
const SUB_COLUMNS = 'id, company_name, dba_name, email, contact_email, phone, contact_phone, address, city, state, zip';

export const ITEM_NAMES = ['Progress Billing', 'Services'] as const;

type QboRef = { Id: string; Name?: string; DisplayName?: string; Active?: boolean; PrivateNote?: string };

export type SyncRun = {
  results: SyncRecordResult[];
  /** Records left for the next press of Sync (batch limit reached). */
  remaining: Record<SyncEntity, number>;
  /** Pay apps dated before the start date — not sent, by design. */
  beforeStart: number;
  /** Set when the authorization was lost mid-run. */
  reconnect: string | null;
  cache: QboCache;
};

const errText = (e: unknown) =>
  e instanceof QboApiError ? e.message : e instanceof Error ? e.message : 'unknown error';

/** Pay apps the next run would invoice, and how many are held back by the start date. */
export async function pendingInvoices(db: Db, tenantId: string, startDay: string | null, zone: string): Promise<{ ready: PayAppIn[]; beforeStart: number }> {
  const { data, error } = await db
    .from('pay_applications')
    .select(PAY_APP_COLUMNS)
    .eq('tenant_id', tenantId)
    .in('status', INVOICEABLE_STATUSES as unknown as string[])
    .is('qbo_invoice_id', null)
    .is('deleted_at', null)
    .order('application_date', { ascending: true, nullsFirst: false })
    .order('app_number', { ascending: true })
    .limit(1000);
  if (error) throw error;
  const ready: PayAppIn[] = [];
  let beforeStart = 0;
  for (const pa of (data ?? []) as PayAppIn[]) {
    const why = payAppSkipReason(pa, startDay, zone);
    if (!why) ready.push(pa);
    else if (why.includes('start date')) beforeStart++;
  }
  return { ready, beforeStart };
}

export async function pendingVendors(db: Db, tenantId: string, limit: number): Promise<{ rows: SubIn[]; total: number }> {
  const { data, error, count } = await db
    .from('subcontractors')
    .select(SUB_COLUMNS, { count: 'exact' })
    .eq('tenant_id', tenantId)
    .is('qbo_vendor_id', null)
    .or('blacklisted.is.null,blacklisted.eq.false')
    .order('company_name', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return { rows: (data ?? []) as SubIn[], total: count ?? (data ?? []).length };
}

/** Distinct job owners (by QuickBooks name) across the company's live jobs. */
export async function jobOwners(db: Db, tenantId: string): Promise<{ owner: Owner; projectId: string }[]> {
  const { data, error } = await db
    .from('projects')
    .select(PROJECT_COLUMNS)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1000);
  if (error) throw error;
  const seen = new Map<string, { owner: Owner; projectId: string }>();
  for (const p of (data ?? []) as ProjectIn[]) {
    const o = ownerOf(p);
    if (o && !seen.has(nameKey(o.name))) seen.set(nameKey(o.name), { owner: o, projectId: p.id });
  }
  return [...seen.values()];
}

export async function runQuickBooksPush(p: {
  db: Db;
  tenantId: string;
  client: QboClient;
  entities: SyncEntity[];
  zone: string;
  startDay: string | null;
  cache: QboCache;
}): Promise<SyncRun> {
  const { db, tenantId, client, zone } = p;
  const cache: QboCache = { realm: p.cache.realm, item: p.cache.item, customers: { ...p.cache.customers } };
  const results: SyncRecordResult[] = [];
  const remaining: Record<SyncEntity, number> = { customers: 0, vendors: 0, invoices: 0 };
  let beforeStart = 0;
  const reported = new Set<string>(); // customers already listed in results this run

  /* ── shared resolvers ─────────────────────────────────────────────── */

  async function resolveCustomer(owner: Owner, projectId: string): Promise<string> {
    const key = nameKey(owner.name);
    if (cache.customers[key]) return cache.customers[key];
    const found = await client.query<QboRef>('Customer', `DisplayName = ${qboQuote(owner.name)}`);
    let id: string;
    let outcome: 'linked' | 'created';
    if (found[0]?.Id) {
      id = found[0].Id;
      outcome = 'linked';
    } else {
      id = (await client.create<QboRef>('Customer', customerPayload(owner))).Id;
      outcome = 'created';
    }
    cache.customers[key] = id;
    if (!reported.has(key)) {
      reported.add(key);
      results.push({ entity: 'customer', id: projectId, label: owner.name, outcome, qboId: id, message: outcome === 'linked' ? 'already in QuickBooks — linked' : undefined });
    }
    return id;
  }

  async function resolveItem(): Promise<string> {
    if (cache.item?.id) return cache.item.id;
    for (const name of ITEM_NAMES) {
      const found = await client.query<QboRef>('Item', `Name = ${qboQuote(name)}`);
      const hit = found.find((r) => r.Id && r.Active !== false);
      if (hit) {
        cache.item = { id: hit.Id, name };
        return hit.Id;
      }
    }
    const accounts = await client.query<QboRef>('Account', `AccountType = 'Income'`);
    const acct = pickIncomeAccount(accounts);
    if (!acct) {
      throw new QboApiError(0, 'QuickBooks has no income account for progress billings. Create a service item named "Progress Billing" in QuickBooks, then sync again.', 'no_income_account');
    }
    const item = await client.create<QboRef>('Item', {
      Name: ITEM_NAMES[0],
      Type: 'Service',
      IncomeAccountRef: { value: acct.Id, name: acct.Name },
    });
    cache.item = { id: item.Id, name: ITEM_NAMES[0] };
    return item.Id;
  }

  try {
    /* ── customers: every job owner ─────────────────────────────────── */
    if (p.entities.includes('customers')) {
      const owners = (await jobOwners(db, tenantId)).filter((o) => !cache.customers[nameKey(o.owner.name)]);
      remaining.customers = Math.max(0, owners.length - BATCH.customers);
      for (const { owner, projectId } of owners.slice(0, BATCH.customers)) {
        try {
          await resolveCustomer(owner, projectId);
        } catch (e) {
          if (e instanceof QboReconnectError) throw e;
          results.push({ entity: 'customer', id: projectId, label: owner.name, outcome: 'failed', message: errText(e) });
        }
      }
    }

    /* ── vendors: subcontractors ────────────────────────────────────── */
    if (p.entities.includes('vendors')) {
      const { rows, total } = await pendingVendors(db, tenantId, BATCH.vendors);
      remaining.vendors = Math.max(0, total - rows.length);
      for (const sub of rows) {
        const v = vendorPayload(sub);
        const label = (sub.company_name || sub.dba_name || 'Unnamed sub').trim();
        if (!v.ok) {
          results.push({ entity: 'vendor', id: sub.id, label, outcome: 'skipped', message: v.reason });
          continue;
        }
        let qboId = '';
        let outcome: 'linked' | 'created' = 'created';
        try {
          const found = await client.query<QboRef>('Vendor', `DisplayName = ${qboQuote(v.name)}`);
          if (found[0]?.Id) {
            qboId = found[0].Id;
            outcome = 'linked';
          } else {
            qboId = (await client.create<QboRef>('Vendor', v.payload)).Id;
          }
        } catch (e) {
          if (e instanceof QboReconnectError) throw e;
          results.push({ entity: 'vendor', id: sub.id, label, outcome: 'failed', message: errText(e) });
          continue;
        }
        try {
          await must(db.from('subcontractors').update({ qbo_vendor_id: qboId, updated_at: new Date().toISOString() })
            .eq('tenant_id', tenantId).eq('id', sub.id), 'subcontractors qbo_vendor_id');
          results.push({ entity: 'vendor', id: sub.id, label, outcome, qboId, message: outcome === 'linked' ? 'already in QuickBooks — linked' : undefined });
        } catch (e) {
          console.error('[quickbooks/sync] vendor id not saved', sub.id, e);
          results.push({ entity: 'vendor', id: sub.id, label, outcome: 'failed', qboId, message: `in QuickBooks as vendor ${qboId}, but Saguaro could not save the link — the next sync links it by name` });
        }
      }
    }

    /* ── invoices: approved / certified / paid pay apps ─────────────── */
    if (p.entities.includes('invoices')) {
      const pending = await pendingInvoices(db, tenantId, p.startDay, zone);
      beforeStart = pending.beforeStart;
      const batch = pending.ready.slice(0, BATCH.invoices);
      remaining.invoices = Math.max(0, pending.ready.length - batch.length);

      const projectIds = [...new Set(batch.map((pa) => pa.project_id))];
      const projects = new Map<string, ProjectIn>();
      if (projectIds.length) {
        const { data, error } = await db.from('projects').select(PROJECT_COLUMNS).eq('tenant_id', tenantId).in('id', projectIds);
        if (error) throw error;
        for (const pr of (data ?? []) as ProjectIn[]) projects.set(pr.id, pr);
      }

      for (const pa of batch) {
        const project = projects.get(pa.project_id) ?? null;
        const label = `${project?.name || 'Job'} — Pay App #${pa.app_number ?? '?'}`;
        const owner = ownerOf(project, pa);
        if (!owner) {
          results.push({ entity: 'invoice', id: pa.id, label, outcome: 'failed', message: 'the job has no owner — add the owner on the project, then sync again' });
          continue;
        }
        let qboId = '';
        let outcome: 'linked' | 'created' = 'created';
        try {
          const customerId = await resolveCustomer(owner, pa.project_id);
          const itemId = await resolveItem();
          const inv = invoicePayload({ payApp: pa, project, customerId, itemId, zone });
          if (!inv.ok) {
            results.push({ entity: 'invoice', id: pa.id, label, outcome: 'failed', message: inv.reason });
            continue;
          }
          const existing = await client.query<QboRef>('Invoice', `DocNumber = ${qboQuote(inv.docNumber)}`);
          const mine = existing.find((r) => r.Id && (r.PrivateNote ?? '').includes(invoiceMarker(pa.id)));
          if (mine) {
            qboId = mine.Id;
            outcome = 'linked';
          } else {
            qboId = (await client.create<QboRef>('Invoice', inv.payload)).Id;
          }
        } catch (e) {
          if (e instanceof QboReconnectError) throw e;
          // A customer or item deleted/merged in QuickBooks: forget the remembered id so the next run looks it up again.
          if (e instanceof QboApiError && (e.code === '610' || e.code === '2500')) {
            delete cache.customers[nameKey(owner.name)];
            cache.item = null;
          }
          results.push({ entity: 'invoice', id: pa.id, label, outcome: 'failed', message: errText(e) });
          continue;
        }
        try {
          await must(db.from('pay_applications').update({ qbo_invoice_id: qboId, updated_at: new Date().toISOString() })
            .eq('tenant_id', tenantId).eq('id', pa.id), 'pay_applications qbo_invoice_id');
          results.push({ entity: 'invoice', id: pa.id, label, outcome, qboId, message: outcome === 'linked' ? 'already in QuickBooks — linked' : undefined });
        } catch (e) {
          console.error('[quickbooks/sync] invoice id not saved', pa.id, e);
          results.push({ entity: 'invoice', id: pa.id, label, outcome: 'failed', qboId, message: `in QuickBooks as invoice ${qboId}, but Saguaro could not save the link — the next sync finds it and links it` });
        }
      }
    }
  } catch (e) {
    if (e instanceof QboReconnectError) {
      return { results, remaining, beforeStart, reconnect: e.message, cache };
    }
    throw e;
  }

  return { results, remaining, beforeStart, reconnect: null, cache };
}
