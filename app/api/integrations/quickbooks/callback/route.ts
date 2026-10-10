import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { must, tryWrite } from '@/lib/db-write';
import type { Json } from '@/lib/database.types';
import { requestDay } from '@/lib/time-zone';
import { quickBooksConfig } from '@/lib/quickbooks/config';
import { QBO_STATE_COOKIE, QBO_STATE_COOKIE_PATH, checkOAuthState, stateCookieSecure, tokenColumnsFromGrant } from '@/lib/quickbooks/oauth';
import { QBO_PAGE_PATH, qboReturnPath, type QboReturnCode } from '@/lib/quickbooks/return-codes';
import { QBO_PROVIDER, QboApiError, QboClient, exchangeCode, loadQboRow, type QboRow } from '@/lib/quickbooks/client';
import { asSettings, cacheFor, companyChanged, stripSecrets, type QboSettings } from '@/lib/quickbooks/settings';

/* ------------------------------------------------------------------ */
/*  GET /api/integrations/quickbooks/callback                          */
/*  Intuit sends the browser here after sign-in. In order:             */
/*    1. the state Intuit echoes must equal the httpOnly cookie set by */
/*       ?action=connect, for the SAME signed-in user (CSRF / login    */
/*       swap) — the cookie is cleared on every outcome;               */
/*    2. the tenant comes ONLY from the signed-in session — never from */
/*       state or any other query value;                               */
/*    3. the code is exchanged; tokens + realm id are stored.          */
/*  Always ends on the QuickBooks page with ?qb=<code>.                */
/* ------------------------------------------------------------------ */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const secure = stateCookieSecure(url.protocol);
  const clearState = (res: NextResponse) => {
    res.cookies.set(QBO_STATE_COOKIE, '', { httpOnly: true, secure, sameSite: 'lax', maxAge: 0, path: QBO_STATE_COOKIE_PATH });
    return res;
  };
  const back = (code: QboReturnCode) => clearState(NextResponse.redirect(new URL(qboReturnPath(code), req.url)));

  if (url.searchParams.get('error')) return back('denied');

  const g = await requirePermission(req, 'Admin', 'Full');
  if (!g.ok) {
    if (g.res.status === 401) {
      const login = new URL('/login', req.url);
      login.searchParams.set('next', QBO_PAGE_PATH);
      return clearState(NextResponse.redirect(login));
    }
    return back('forbidden');
  }
  const user = g.user;

  const check = checkOAuthState(req.cookies.get(QBO_STATE_COOKIE)?.value, url.searchParams.get('state'), user.id);
  if (!check.ok) {
    console.warn(`[quickbooks/callback] state rejected (${check.reason}) for tenant ${user.tenantId}`);
    return back('state');
  }

  const code = url.searchParams.get('code');
  const realmId = url.searchParams.get('realmId');
  if (!code || !realmId) return back('missing');

  const cfg = quickBooksConfig(url.origin);
  if (!cfg) return back('not_configured');

  try {
    let grant;
    try {
      grant = await exchangeCode(cfg, code);
    } catch (e) {
      console.error('[quickbooks/callback] code exchange refused', e instanceof QboApiError ? `${e.status} ${e.code} ${e.message}` : e);
      return back('exchange');
    }
    const cols = tokenColumnsFromGrant(grant);
    if (!cols || !cols.refresh_token) {
      console.error('[quickbooks/callback] Intuit returned no usable tokens');
      return back('exchange');
    }

    const db = g.db;
    const tenantId = user.tenantId;
    const existing = await loadQboRow(db, tenantId);
    const prev = stripSecrets(asSettings(existing?.settings)) as QboSettings;

    // Another QuickBooks company (or sandbox ↔ production): the ids stored from
    // the old company mean nothing here. Forget them, or every record already
    // pushed to the old company would be skipped as "already in QuickBooks".
    const changed = companyChanged(
      { realmId: existing?.realm_id, environment: prev.environment },
      { realmId, environment: cfg.environment },
    );
    if (changed) {
      await must(db.from('pay_applications').update({ qbo_invoice_id: null })
        .eq('tenant_id', tenantId).not('qbo_invoice_id', 'is', null), 'pay_applications qbo_invoice_id reset');
      await must(db.from('subcontractors').update({ qbo_vendor_id: null })
        .eq('tenant_id', tenantId).not('qbo_vendor_id', 'is', null), 'subcontractors qbo_vendor_id reset');
    }

    // First connection: invoice pay apps from today on, so pay apps the office
    // already keyed into QuickBooks by hand are not billed twice. The page
    // shows how many earlier ones exist and lets an admin move the date back.
    const { today } = await requestDay(req.headers, db, tenantId, 'quickbooks/callback');
    const settings: QboSettings = {
      ...prev,
      environment: cfg.environment,
      company_name: changed ? null : prev.company_name ?? null,
      invoice_start_date: prev.invoice_start_date !== undefined ? prev.invoice_start_date : today,
      qbo_cache: changed ? { realm: realmId, item: null, customers: {} } : cacheFor(prev, realmId),
    };
    const now = new Date().toISOString();
    const fields = {
      ...cols,
      realm_id: realmId,
      status: 'active',
      connected_at: now,
      connected_by: user.id,
      last_error: null,
      settings: settings as unknown as Json,
      updated_at: now,
    };

    let rowId: string;
    if (existing) {
      await must(db.from('integrations').update(fields).eq('tenant_id', tenantId).eq('id', existing.id), 'integrations connect');
      rowId = existing.id;
    } else {
      const { data } = await must(db.from('integrations')
        .insert({ tenant_id: tenantId, provider: QBO_PROVIDER, ...fields })
        .select('id')
        .single(), 'integrations insert');
      rowId = (data as { id: string }).id;
    }

    // The company's name, so the page can say WHICH QuickBooks company is linked.
    // Best effort: the connection already works without it.
    try {
      const row: QboRow = {
        id: rowId, tenant_id: tenantId, status: 'active', access_token: cols.access_token, refresh_token: cols.refresh_token,
        token_expires_at: cols.token_expires_at, realm_id: realmId, settings: settings as unknown as Json,
        last_sync_at: existing?.last_sync_at ?? null, last_error: null, connected_at: now,
      };
      const name = await new QboClient(db, tenantId, cfg, row).companyName();
      if (name) {
        await tryWrite(db.from('integrations')
          .update({ settings: { ...settings, company_name: name } as unknown as Json })
          .eq('tenant_id', tenantId).eq('id', rowId), 'integrations company name');
      }
    } catch (e) {
      console.error('[quickbooks/callback] company name lookup failed (connection kept)', e);
    }

    return back('connected');
  } catch (e) {
    console.error('[quickbooks/callback] connect failed', e);
    return back('failed');
  }
}
