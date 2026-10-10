/**
 * QuickBooks Online — the one way the server talks to Intuit.
 *
 * Every Accounting API call goes through QboClient.request(), which:
 *   - uses the right host for sandbox vs production and names minorversion;
 *   - refreshes the access token when it is expired (or about to be) and
 *     PERSISTS the new access + refresh token — Intuit rotates the refresh
 *     token, so a refresh that is not written back strands the connection;
 *   - on a 401, refreshes once and retries;
 *   - when the authorization can no longer be refreshed, marks the row
 *     status 'needs_reconnect' with the reason and throws QboReconnectError.
 *
 * Server only. Tokens never leave this module except to Intuit.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { must, tryWrite } from '@/lib/db-write';
import { QBO_MINOR_VERSION, QBO_REVOKE_URL, QBO_TOKEN_URL, type QuickBooksConfig } from './config';
import { accessTokenExpired, basicAuthHeader, tokenColumnsFromGrant, type IntuitTokenGrant } from './oauth';
import { parseQboFault } from './mapping';

type Db = SupabaseClient<Database>;

export const QBO_PROVIDER = 'quickbooks';
export const NEEDS_RECONNECT = 'needs_reconnect';
const TIMEOUT_MS = 20_000;

export type QboRow = {
  id: string;
  tenant_id: string;
  status: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  realm_id: string | null;
  settings: Database['public']['Tables']['integrations']['Row']['settings'];
  last_sync_at: string | null;
  last_error: string | null;
  connected_at: string | null;
};

const ROW_COLUMNS = 'id, tenant_id, status, access_token, refresh_token, token_expires_at, realm_id, settings, last_sync_at, last_error, connected_at';

/** Intuit answered with an error. `message` is Intuit's words, safe to show (no tokens in it). */
export class QboApiError extends Error {
  constructor(public status: number, message: string, public code: string) {
    super(message);
    this.name = 'QboApiError';
  }
}

/** The stored authorization is gone or refused; the user must press Connect again. */
export class QboReconnectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QboReconnectError';
  }
}

/** The tenant's QuickBooks row (tokens included — server use only), or null. Throws on a database error. */
export async function loadQboRow(db: Db, tenantId: string): Promise<QboRow | null> {
  const { data, error } = await db
    .from('integrations')
    .select(ROW_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('provider', QBO_PROVIDER)
    .order('updated_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as QboRow | null) ?? null;
}

export function isConnectedRow(row: QboRow | null): boolean {
  return !!row && row.status === 'active' && !!row.realm_id && !!(row.access_token || row.refresh_token);
}

export async function markNeedsReconnect(db: Db, tenantId: string, rowId: string, reason: string): Promise<void> {
  await tryWrite(db.from('integrations')
    .update({ status: NEEDS_RECONNECT, last_error: reason, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('id', rowId), 'integrations needs_reconnect');
}

async function tokenCall(cfg: QuickBooksConfig, form: Record<string, string>): Promise<IntuitTokenGrant> {
  const res = await fetch(QBO_TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuthHeader(cfg.clientId, cfg.clientSecret),
    },
    body: new URLSearchParams(form).toString(),
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) {
    const f = parseQboFault(text);
    throw new QboApiError(res.status, f.message, f.code);
  }
  try {
    return JSON.parse(text) as IntuitTokenGrant;
  } catch {
    throw new QboApiError(res.status, 'Intuit sent an unreadable token response', 'bad_json');
  }
}

/** authorization_code → tokens. The redirect_uri must be the one sent on authorize. */
export function exchangeCode(cfg: QuickBooksConfig, code: string): Promise<IntuitTokenGrant> {
  return tokenCall(cfg, { grant_type: 'authorization_code', code, redirect_uri: cfg.redirectUri });
}

export function refreshGrant(cfg: QuickBooksConfig, refreshToken: string): Promise<IntuitTokenGrant> {
  return tokenCall(cfg, { grant_type: 'refresh_token', refresh_token: refreshToken });
}

/** Revoke at Intuit (revoking the refresh token ends the whole grant). */
export async function revokeAtIntuit(cfg: QuickBooksConfig, token: string): Promise<{ ok: boolean; status: number; message?: string }> {
  const res = await fetch(QBO_REVOKE_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: basicAuthHeader(cfg.clientId, cfg.clientSecret),
    },
    body: JSON.stringify({ token }),
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.ok) return { ok: true, status: res.status };
  const text = await res.text().catch((e: unknown) => `unreadable body: ${e instanceof Error ? e.message : String(e)}`);
  return { ok: false, status: res.status, message: parseQboFault(text).message };
}

export class QboClient {
  private row: QboRow;

  constructor(private db: Db, private tenantId: string, private cfg: QuickBooksConfig, row: QboRow) {
    this.row = row;
  }

  get realmId(): string {
    return this.row.realm_id ?? '';
  }

  private async reconnect(reason: string): Promise<never> {
    await markNeedsReconnect(this.db, this.tenantId, this.row.id, reason);
    throw new QboReconnectError(reason);
  }

  /** A live access token — refreshed and persisted when expired or when `force`. */
  async accessToken(force = false): Promise<string> {
    if (!force && this.row.access_token && !accessTokenExpired(this.row.token_expires_at)) return this.row.access_token;
    if (!this.row.refresh_token) return this.reconnect('QuickBooks has no stored authorization. Connect QuickBooks again.');

    let grant: IntuitTokenGrant;
    try {
      grant = await refreshGrant(this.cfg, this.row.refresh_token);
    } catch (e) {
      // 400 invalid_grant / 401: the refresh token is expired or revoked — only a new Connect fixes it.
      if (e instanceof QboApiError && (e.status === 400 || e.status === 401)) {
        return this.reconnect(`QuickBooks authorization expired or was revoked (${e.message}). Connect QuickBooks again.`);
      }
      throw e; // network / Intuit 5xx: transient — do not force a reconnect
    }
    const cols = tokenColumnsFromGrant(grant, Date.now(), this.row.refresh_token);
    if (!cols) return this.reconnect('Intuit refreshed the authorization without an access token. Connect QuickBooks again.');

    await must(this.db.from('integrations')
      .update({ ...cols, last_error: null, updated_at: new Date().toISOString() })
      .eq('tenant_id', this.tenantId)
      .eq('id', this.row.id), 'integrations token refresh');
    this.row = { ...this.row, ...cols };
    return cols.access_token;
  }

  private url(path: string): string {
    const sep = path.includes('?') ? '&' : '?';
    return `${this.cfg.apiBase}/v3/company/${encodeURIComponent(this.realmId)}/${path}${sep}minorversion=${QBO_MINOR_VERSION}`;
  }

  async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    if (!this.realmId) return this.reconnect('QuickBooks company id is missing. Connect QuickBooks again.');
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.accessToken(attempt > 0);
      const res = await fetch(this.url(path), {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 401 && attempt === 0) continue; // revoked/expired early — refresh once and retry
      const text = await res.text();
      if (res.status === 401) return this.reconnect('QuickBooks refused the authorization. Connect QuickBooks again.');
      if (!res.ok) {
        const f = parseQboFault(text);
        throw new QboApiError(res.status, f.message, f.code);
      }
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new QboApiError(res.status, 'QuickBooks sent an unreadable response', 'bad_json');
      }
    }
    return this.reconnect('QuickBooks refused the authorization. Connect QuickBooks again.');
  }

  /** `select * from <entity> where <where>` → the matching rows. */
  async query<T>(entity: string, where: string): Promise<T[]> {
    const sql = `select * from ${entity} where ${where} maxresults 100`;
    const out = await this.request<{ QueryResponse?: Record<string, unknown> }>('GET', `query?query=${encodeURIComponent(sql)}`);
    const rows = out?.QueryResponse?.[entity];
    return Array.isArray(rows) ? (rows as T[]) : [];
  }

  async create<T>(entity: string, payload: Record<string, unknown>): Promise<T> {
    const out = await this.request<Record<string, unknown>>('POST', entity.toLowerCase(), payload);
    const created = out?.[entity];
    if (!created || typeof created !== 'object') throw new QboApiError(200, `QuickBooks did not return the new ${entity}`, 'no_entity');
    return created as T;
  }

  /** The QuickBooks company's name, shown on the page so the GC can see which company is linked. */
  async companyName(): Promise<string | null> {
    const out = await this.request<{ CompanyInfo?: { CompanyName?: string; LegalName?: string } }>('GET', `companyinfo/${encodeURIComponent(this.realmId)}`);
    const name = out?.CompanyInfo?.CompanyName || out?.CompanyInfo?.LegalName || '';
    return name.trim() || null;
  }
}
