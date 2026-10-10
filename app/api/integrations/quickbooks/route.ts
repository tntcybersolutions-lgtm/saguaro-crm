import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { getEffectivePermissions, hasPermission, requirePermission } from '@/lib/permissions';
import { must } from '@/lib/db-write';
import { apiError, apiFail } from '@/lib/api-error';
import type { Json } from '@/lib/database.types';
import { requestDay } from '@/lib/time-zone';
import { publicQuickBooksConfig, quickBooksConfig } from '@/lib/quickbooks/config';
import {
  QBO_STATE_COOKIE, QBO_STATE_COOKIE_PATH, QBO_STATE_MAX_AGE_SECONDS,
  buildAuthorizeUrl, isNavigation, newOAuthState, stateCookieValue,
} from '@/lib/quickbooks/oauth';
import { QBO_PAGE_PATH, QBO_RETURN_MESSAGES, qboReturnPath, type QboReturnCode } from '@/lib/quickbooks/return-codes';
import { NEEDS_RECONNECT, isConnectedRow, loadQboRow, revokeAtIntuit } from '@/lib/quickbooks/client';
import { asSettings, cacheFor, stripSecrets } from '@/lib/quickbooks/settings';
import { nameKey, parseStartDay } from '@/lib/quickbooks/mapping';
import { jobOwners, pendingInvoices, pendingVendors } from '@/lib/quickbooks/sync';

/* ------------------------------------------------------------------ */
/*  GET /api/integrations/quickbooks?action=connect                    */
/*    Starts OAuth ON THE SERVER: random state in an httpOnly cookie,  */
/*    then a redirect to Intuit. Opened in the SAME window (the iPhone */
/*    app is a webview — popups do not work there).                    */
/*  GET /api/integrations/quickbooks?action=status                     */
/*    The connection as the page may see it. Never a token.            */
/* ------------------------------------------------------------------ */
export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action') ?? 'status';
  if (action === 'connect') return connect(req);
  if (action === 'status') return status(req);
  return apiFail('Unknown action', 400);
}

async function connect(req: NextRequest) {
  const nav = isNavigation(req.headers);
  const fail = (code: QboReturnCode, httpStatus: number) =>
    nav
      ? NextResponse.redirect(new URL(qboReturnPath(code), req.url))
      : NextResponse.json({ error: QBO_RETURN_MESSAGES[code].msg, code }, { status: httpStatus });

  const g = await requirePermission(req, 'Admin', 'Full');
  if (!g.ok) {
    if (!nav) return g.res;
    if (g.res.status === 401) {
      const login = new URL('/login', req.url);
      login.searchParams.set('next', QBO_PAGE_PATH);
      return NextResponse.redirect(login);
    }
    return fail('forbidden', 403);
  }

  const cfg = quickBooksConfig(req.nextUrl.origin);
  if (!cfg || !cfg.redirectUri) return fail('not_configured', 503);

  // The state cookie (and the session) must live on the host Intuit sends the
  // browser back to. If the registered redirect URI is on another host (www vs
  // apex), start again there once.
  let target: URL;
  try {
    target = new URL(cfg.redirectUri);
  } catch (e) {
    console.error('[quickbooks/connect] QUICKBOOKS_REDIRECT_URI is not an absolute URL', e);
    return fail('not_configured', 503);
  }
  if (target.origin !== req.nextUrl.origin && !req.nextUrl.searchParams.has('hop')) {
    const hop = new URL('/api/integrations/quickbooks', target.origin);
    hop.searchParams.set('action', 'connect');
    hop.searchParams.set('hop', '1');
    return NextResponse.redirect(hop);
  }

  const state = newOAuthState();
  const res = NextResponse.redirect(buildAuthorizeUrl({ clientId: cfg.clientId, redirectUri: cfg.redirectUri, state }));
  res.cookies.set(QBO_STATE_COOKIE, stateCookieValue(state, g.user.id), {
    httpOnly: true,
    secure: req.nextUrl.protocol === 'https:',
    sameSite: 'lax',
    maxAge: QBO_STATE_MAX_AGE_SECONDS,
    path: QBO_STATE_COOKIE_PATH,
  });
  return res;
}

async function status(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServerClient();
    const pub = publicQuickBooksConfig();
    const [row, perms] = await Promise.all([
      loadQboRow(db, user.tenantId),
      getEffectivePermissions(db, user.id, user.tenantId),
    ]);
    const settings = asSettings(row?.settings);
    // Tokens issued in sandbox do not work against production (and back).
    const wrongEnvironment = !!settings.environment && settings.environment !== pub.environment;
    const connected = pub.configured && isConnectedRow(row) && !wrongEnvironment;
    const startDate = settings.invoice_start_date ?? null;
    const cache = row?.realm_id ? cacheFor(settings, row.realm_id) : null;

    let pending: { invoices: number; invoicesBeforeStart: number; vendors: number; customers: number } | null = null;
    if (connected) {
      const { zone } = await requestDay(req.headers, db, user.tenantId, 'quickbooks/status');
      const [inv, subs, owners] = await Promise.all([
        pendingInvoices(db, user.tenantId, startDate, zone),
        pendingVendors(db, user.tenantId, 1),
        jobOwners(db, user.tenantId),
      ]);
      pending = {
        invoices: inv.ready.length,
        invoicesBeforeStart: inv.beforeStart,
        vendors: subs.total,
        customers: owners.filter((o) => !cache?.customers[nameKey(o.owner.name)]).length,
      };
    }

    const history = Array.isArray(settings.sync_history) ? stripSecrets(settings.sync_history) : [];
    return NextResponse.json({
      configured: pub.configured,
      environment: pub.environment,
      connected,
      status: row?.status ?? null,
      needsReconnect: !!row && (row.status === NEEDS_RECONNECT || (row.status === 'active' && wrongEnvironment)),
      reconnectReason: wrongEnvironment
        ? `Connected to a QuickBooks ${settings.environment} company, but this server is set to ${pub.environment}. Connect again.`
        : row?.status === NEEDS_RECONNECT ? row.last_error : null,
      companyName: settings.company_name ?? null,
      connectedAt: row?.connected_at ?? null,
      lastSyncAt: row?.last_sync_at ?? null,
      startDate,
      itemName: cache?.item?.name ?? null,
      history,
      pending,
      canManage: hasPermission(perms, 'Admin', 'Full'),
    });
  } catch (e) {
    return apiError('quickbooks/status', e, 'Could not load the QuickBooks connection. Please try again.');
  }
}

/* ------------------------------------------------------------------ */
/*  POST /api/integrations/quickbooks                                  */
/*    { action: 'disconnect' }  revoke at Intuit, forget the tokens    */
/*    { action: 'settings', startDate: 'YYYY-MM-DD' | null }           */
/* ------------------------------------------------------------------ */
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Admin', 'Full');
  if (!g.ok) return g.res;
  const user = g.user;

  try {
    const body = (await req.json().catch(() => ({}))) as { action?: string; startDate?: unknown };
    const db = g.db;

    if (body.action === 'disconnect') {
      const row = await loadQboRow(db, user.tenantId);
      if (!row) return NextResponse.json({ ok: true, revoked: false, warning: false, message: 'QuickBooks was not connected.' });

      const token = row.refresh_token || row.access_token;
      const cfg = quickBooksConfig(req.nextUrl.origin);
      let revoked = false;
      let note = '';
      if (token && cfg) {
        try {
          const r = await revokeAtIntuit(cfg, token);
          revoked = r.ok;
          if (!r.ok) {
            note = r.message || `HTTP ${r.status}`;
            console.error('[quickbooks/disconnect] Intuit refused the revoke', r.status, r.message);
          }
        } catch (e) {
          note = 'Intuit could not be reached';
          console.error('[quickbooks/disconnect] revoke call failed', e);
        }
      } else if (token) {
        note = 'the Intuit app keys are not set on this server';
      }

      await must(db.from('integrations')
        .update({
          status: 'disconnected',
          access_token: null,
          refresh_token: null,
          token_expires_at: null,
          last_error: !token || revoked ? null : `Intuit did not confirm the revoke (${note}).`,
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', user.tenantId)
        .eq('id', row.id), 'integrations disconnect');

      return NextResponse.json({
        ok: true,
        revoked,
        warning: !!token && !revoked,
        message: !token || revoked
          ? 'QuickBooks disconnected.'
          : 'QuickBooks disconnected in Saguaro, but Intuit did not confirm it. To be sure, remove Saguaro under Apps in QuickBooks.',
      });
    }

    if (body.action === 'settings') {
      if (!Object.prototype.hasOwnProperty.call(body, 'startDate')) {
        return apiFail('startDate is required — a date like 2026-10-01, or null to send every pay app.', 400);
      }
      const raw = body.startDate;
      const startDay = raw === null || raw === '' ? null : parseStartDay(raw);
      if (raw !== null && raw !== '' && !startDay) return apiFail('startDate must be a date like 2026-10-01.', 400);

      const row = await loadQboRow(db, user.tenantId);
      if (!row) return apiFail('Connect QuickBooks first.', 409);
      const next = { ...(stripSecrets(asSettings(row.settings)) as Record<string, unknown>), invoice_start_date: startDay };
      await must(db.from('integrations')
        .update({ settings: next as unknown as Json, updated_at: new Date().toISOString() })
        .eq('tenant_id', user.tenantId)
        .eq('id', row.id), 'integrations settings');
      return NextResponse.json({ ok: true, startDate: startDay });
    }

    return apiFail('Unknown action', 400);
  } catch (e) {
    return apiError('quickbooks/post', e, 'QuickBooks could not be updated. Please try again.');
  }
}
