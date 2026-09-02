/**
 * lib/webhook-dispatch.ts
 * -------------------------------------------------------------------------
 * The outbound-webhook dispatcher. Given (tenantId, event, data) it:
 *   1. Loads every ACTIVE webhook for that tenant subscribed to the event,
 *      from BOTH stores — `outbound_webhooks` (Integration Hub) and
 *      `webhook_endpoints` (Zapier / REST-registered).
 *   2. POSTs a signed JSON payload to each URL. The signature is
 *        X-Saguaro-Signature: sha256=<HMAC-SHA256(secret, rawBody)>
 *      so receivers can verify authenticity with their stored secret.
 *   3. Records every attempt in `webhook_deliveries` (status, response, ts).
 *   4. Updates the source row's last-fired marker (last_status/last_fired_at
 *      for outbound_webhooks; last_triggered/failure_count for
 *      webhook_endpoints).
 *
 * SECURITY / TENANT SCOPING
 *   This runs with the service-role client (RLS bypassed) because it is
 *   invoked from server-side triggers, NOT from a user request. It therefore
 *   MUST be — and is — strictly scoped by the `tenantId` argument that the
 *   caller derived from a server-loaded record (never a client-supplied
 *   value). Every read filters `.eq('tenant_id', tenantId)`.
 *
 * SSRF HARDENING
 *   Webhook URLs are tenant-configured, so a target could point at internal
 *   infrastructure (cloud metadata, loopback, RFC1918). Before each POST we
 *   resolve the host and refuse private / loopback / link-local / ULA /
 *   metadata destinations, and use `redirect: 'manual'` so a 3xx cannot
 *   bounce us onto an internal address after the check.
 *
 * Never throws — a webhook failure must never break the business action that
 * triggered it. Returns a summary for logging/telemetry.
 * -------------------------------------------------------------------------
 */
import { createHmac, randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { createServerClient } from '@/lib/supabase-server';
import type { Json } from '@/lib/database.types';
import type { WebhookEvent } from '@/lib/webhook-events';
import { must } from '@/lib/db-write';

type Db = ReturnType<typeof createServerClient>;

const DELIVERY_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_CHARS = 2_000;

export interface DispatchSummary {
  event: string;
  matched: number;
  delivered: number;
  failed: number;
}

interface DispatchTarget {
  id: string;
  url: string;
  secret: string;
  source: 'outbound' | 'endpoint';
  failureCount: number;
}

/* ----------------------------- SSRF guard ------------------------------ */

/** True for private / loopback / link-local / ULA / metadata / reserved IPs. */
function ipIsBlocked(ip: string): boolean {
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (a === 0 || a === 10 || a === 127) return true;         // this-net / RFC1918 / loopback
    if (a === 169 && b === 254) return true;                    // link-local + cloud metadata (169.254.169.254)
    if (a === 172 && b >= 16 && b <= 31) return true;           // RFC1918
    if (a === 192 && b === 168) return true;                    // RFC1918
    if (a === 100 && b >= 64 && b <= 127) return true;          // CGNAT (RFC6598)
    if (a >= 224) return true;                                  // multicast + reserved
    return false;
  }
  const ip6 = ip.toLowerCase();
  if (ip6 === '::1' || ip6 === '::') return true;               // loopback / unspecified
  if (ip6.startsWith('fe80')) return true;                      // link-local
  if (ip6.startsWith('fc') || ip6.startsWith('fd')) return true; // unique-local (ULA)
  if (ip6.startsWith('::ffff:')) return ipIsBlocked(ip6.slice(7)); // IPv4-mapped
  return false;
}

/**
 * Resolve the destination and confirm it is externally deliverable.
 * Rejects non-http(s) schemes, literal internal IPs, obvious internal
 * hostnames, and hostnames whose A/AAAA records land on a blocked IP.
 */
async function assertDeliverable(rawUrl: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'invalid url' };
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    return { ok: false, reason: `blocked protocol ${u.protocol}` };
  }
  const host = u.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets

  if (isIP(host)) {
    return ipIsBlocked(host) ? { ok: false, reason: `blocked host ${host}` } : { ok: true };
  }
  const lower = host.toLowerCase();
  if (
    lower === 'localhost' ||
    lower.endsWith('.localhost') ||
    lower.endsWith('.internal') ||
    lower.endsWith('.local')
  ) {
    return { ok: false, reason: `blocked internal host ${host}` };
  }
  try {
    const records = await lookup(host, { all: true });
    if (!records.length) return { ok: false, reason: `no dns records for ${host}` };
    for (const r of records) {
      if (ipIsBlocked(r.address)) {
        return { ok: false, reason: `${host} resolves to blocked ip ${r.address}` };
      }
    }
  } catch {
    return { ok: false, reason: `dns resolution failed for ${host}` };
  }
  return { ok: true };
}

/* --------------------------- Delivery core ----------------------------- */

async function deliverOne(
  db: Db,
  target: DispatchTarget,
  event: string,
  data: Record<string, unknown>,
  timestamp: string,
  summary: DispatchSummary,
): Promise<void> {
  const deliveryId = randomUUID();
  const payload = { event, timestamp, webhook_id: deliveryId, data };
  const body = JSON.stringify(payload);
  const signature = createHmac('sha256', target.secret || '').update(body).digest('hex');

  let status = 0;
  let responseBody: string | null = null;
  let ok = false;

  const safe = await assertDeliverable(target.url);
  if (!safe.ok) {
    responseBody = `blocked: ${safe.reason}`;
  } else {
    try {
      const res = await fetch(target.url, {
        method: 'POST',
        redirect: 'manual', // do not follow 3xx onto a possibly-internal host
        headers: {
          'Content-Type': 'application/json',
          'X-Saguaro-Event': event,
          'X-Saguaro-Delivery': deliveryId,
          'X-Saguaro-Signature': `sha256=${signature}`,
          'User-Agent': 'Saguaro-Webhooks/1.0',
        },
        body,
        signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      });
      status = res.status;
      ok = status >= 200 && status < 300;
      try {
        responseBody = (await res.text()).slice(0, MAX_RESPONSE_CHARS);
      } catch {
        responseBody = null;
      }
    } catch (err) {
      status = 0;
      responseBody =
        err instanceof Error
          ? err.name === 'TimeoutError'
            ? `timed out after ${DELIVERY_TIMEOUT_MS / 1000}s`
            : err.message
          : 'delivery failed';
    }
  }

  if (ok) summary.delivered++;
  else summary.failed++;

  // Record the attempt. webhook_deliveries.endpoint_id has no FK, so it holds
  // the id from either source table.
  try {
    await must(db.from('webhook_deliveries').insert({
      id: deliveryId,
      endpoint_id: target.id,
      event_type: event,
      payload: payload as unknown as Json,
      response_status: status || null,
      response_body: responseBody,
      success: ok,
      attempt: 1,
      delivered_at: timestamp,
    }), 'webhook_deliveries insert');
  } catch (err) {
    console.error('[webhook-dispatch] record delivery failed', err);
  }

  // Update the source row's last-fired marker.
  try {
    if (target.source === 'outbound') {
      await must(db
        .from('outbound_webhooks')
        .update({ last_status: status || null, last_fired_at: timestamp })
        .eq('id', target.id), 'outbound_webhooks write');
    } else {
      await must(db
        .from('webhook_endpoints')
        .update({
          last_triggered: timestamp,
          failure_count: ok ? 0 : target.failureCount + 1,
        })
        .eq('id', target.id), 'webhook_endpoints write');
    }
  } catch (err) {
    console.error('[webhook-dispatch] last-fired update failed', err);
  }
}

/* ------------------------------- Public -------------------------------- */

/**
 * Fan an event out to every active, subscribed webhook for a tenant.
 *
 * @param tenantId  Server-derived tenant id (NEVER client-supplied).
 * @param event     Canonical event name (see lib/webhook-events.ts).
 * @param data      Event payload placed under `data` in the delivered body.
 */
export async function dispatchWebhookEvent(
  tenantId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
): Promise<DispatchSummary> {
  const summary: DispatchSummary = { event, matched: 0, delivered: 0, failed: 0 };
  if (!tenantId || !event) return summary;

  const db = createServerClient();
  const targets: DispatchTarget[] = [];

  // Integration Hub webhooks.
  try {
    const { data: rows } = await db
      .from('outbound_webhooks')
      .select('id, url, secret, events, active')
      .eq('tenant_id', tenantId)
      .eq('active', true)
      .contains('events', [event]);
    for (const w of (rows ?? []) as Array<{ id: string; url: string | null; secret: string | null }>) {
      if (w.url) targets.push({ id: w.id, url: w.url, secret: w.secret ?? '', source: 'outbound', failureCount: 0 });
    }
  } catch (err) {
    console.error('[webhook-dispatch] load outbound_webhooks failed', err);
  }

  // Zapier / REST-registered endpoints.
  try {
    const { data: rows } = await db
      .from('webhook_endpoints')
      .select('id, url, secret, events, is_active, failure_count')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .contains('events', [event]);
    for (const w of (rows ?? []) as Array<{
      id: string;
      url: string | null;
      secret: string | null;
      failure_count: number | null;
    }>) {
      if (w.url)
        targets.push({
          id: w.id,
          url: w.url,
          secret: w.secret ?? '',
          source: 'endpoint',
          failureCount: w.failure_count ?? 0,
        });
    }
  } catch (err) {
    console.error('[webhook-dispatch] load webhook_endpoints failed', err);
  }

  summary.matched = targets.length;
  if (targets.length === 0) return summary;

  const timestamp = new Date().toISOString();
  await Promise.all(targets.map((t) => deliverOne(db, t, event, data, timestamp, summary)));
  return summary;
}
