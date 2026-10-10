import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import type { Json } from '@/lib/database.types';
import { tryWrite } from '@/lib/db-write';
import { apiError, apiFail } from '@/lib/api-error';
import { requestDay } from '@/lib/time-zone';
import { quickBooksConfig } from '@/lib/quickbooks/config';
import { NEEDS_RECONNECT, QboClient, isConnectedRow, loadQboRow, markNeedsReconnect } from '@/lib/quickbooks/client';
import { countOutcomes, normalizeEntities } from '@/lib/quickbooks/mapping';
import { asSettings, cacheFor, pushHistory, stripSecrets, type QboHistoryEntry } from '@/lib/quickbooks/settings';
import { runQuickBooksPush } from '@/lib/quickbooks/sync';

/** A run makes a few Intuit calls per record; give it room to finish its batch. */
export const maxDuration = 60;

/* ------------------------------------------------------------------ */
/*  POST /api/integrations/quickbooks/sync                             */
/*  { entities: ('customers' | 'vendors' | 'invoices')[] }             */
/*  Sends Saguaro records to QuickBooks (it does not import). Answers  */
/*  with one result per record — created, linked, skipped or failed    */
/*  with Intuit's reason. Re-running never duplicates (see             */
/*  lib/quickbooks/sync.ts).                                           */
/* ------------------------------------------------------------------ */
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Admin', 'Full');
  if (!g.ok) return g.res;
  const user = g.user;

  try {
    const body = (await req.json().catch(() => ({}))) as { direction?: string; entities?: unknown };
    if (body.direction && body.direction !== 'push') {
      return apiFail('QuickBooks sync sends Saguaro records to QuickBooks. It does not import from QuickBooks.', 400);
    }
    const entities = normalizeEntities(body.entities);
    if (!entities.length) return apiFail('entities is required — one or more of customers, vendors, invoices.', 400);

    const cfg = quickBooksConfig(req.nextUrl.origin);
    if (!cfg) {
      return NextResponse.json(
        { error: 'QuickBooks is not set up on this server yet — the Intuit app keys are missing.', configured: false },
        { status: 503 },
      );
    }

    const db = g.db;
    const row = await loadQboRow(db, user.tenantId);
    if (!row || !isConnectedRow(row)) {
      const needsReconnect = row?.status === NEEDS_RECONNECT;
      return NextResponse.json(
        { error: needsReconnect ? (row?.last_error || 'QuickBooks needs to be connected again.') : 'QuickBooks is not connected.', connected: false, needsReconnect },
        { status: 409 },
      );
    }
    const settings = asSettings(row.settings);
    if (settings.environment && settings.environment !== cfg.environment) {
      const reason = `Connected to a QuickBooks ${settings.environment} company, but this server is set to ${cfg.environment}. Connect QuickBooks again.`;
      await markNeedsReconnect(db, user.tenantId, row.id, reason);
      return NextResponse.json({ error: reason, connected: false, needsReconnect: true }, { status: 409 });
    }

    // A transaction's date is the company's calendar day (device, else company zone).
    const { zone } = await requestDay(req.headers, db, user.tenantId, 'quickbooks/sync');
    const run = await runQuickBooksPush({
      db,
      tenantId: user.tenantId,
      client: new QboClient(db, user.tenantId, cfg, row),
      entities,
      zone,
      startDay: settings.invoice_start_date ?? null,
      cache: cacheFor(settings, row.realm_id as string),
    });

    const counts = countOutcomes(run.results);
    const remaining = run.remaining.customers + run.remaining.vendors + run.remaining.invoices;
    const at = new Date().toISOString();
    const entry: QboHistoryEntry = {
      at,
      by: user.email,
      entities,
      counts: { created: counts.created, linked: counts.linked, skipped: counts.skipped, failed: counts.failed },
      errors: run.results.filter((r) => r.outcome === 'failed').slice(0, 10).map((r) => ({ label: r.label, message: r.message ?? '' })),
      remaining,
    };

    // Merge onto the row as it is NOW (a token refresh or a start-date save may
    // have landed during the run), never onto the copy read before it.
    const latest = await loadQboRow(db, user.tenantId);
    const latestSettings = asSettings(latest?.settings);
    await tryWrite(db.from('integrations')
      .update({
        settings: {
          ...(stripSecrets(latestSettings) as Record<string, unknown>),
          qbo_cache: run.cache,
          sync_history: pushHistory(latestSettings.sync_history, entry),
        } as unknown as Json,
        last_sync_at: at,
        ...(run.reconnect ? { last_error: run.reconnect } : {}),
        updated_at: at,
      })
      .eq('tenant_id', user.tenantId)
      .eq('id', row.id), 'integrations sync history');

    return NextResponse.json(
      {
        ok: !run.reconnect && counts.failed === 0,
        results: run.results,
        counts: entry.counts,
        byEntity: counts.byEntity,
        remaining: run.remaining,
        beforeStart: run.beforeStart,
        needsReconnect: !!run.reconnect,
        ...(run.reconnect ? { error: run.reconnect } : {}),
        synced_at: at,
      },
      { status: run.reconnect ? 409 : 200 },
    );
  } catch (e) {
    return apiError('quickbooks/sync', e, 'QuickBooks sync stopped partway. Records already sent are saved; press Sync again to finish.');
  }
}
