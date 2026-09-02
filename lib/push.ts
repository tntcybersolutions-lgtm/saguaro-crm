// ─────────────────────────────────────────────────────────────────────────────
// lib/push.ts
//
// Real device / web push sender. push_tokens rows are collected by
// /api/notifications/push-subscribe (browser Web Push) and /api/notifications/push-token
// (native Capacitor / Expo), but nothing ever SENT to them. This module does.
//
//   • Web Push (VAPID)  — encrypted payload to a browser PushSubscription via the
//                          `web-push` library. Requires VAPID_PUBLIC_KEY +
//                          VAPID_PRIVATE_KEY (+ VAPID_SUBJECT). If unset → logged
//                          skip, no send, no throw.
//   • Expo Push         — HTTPS POST to Expo's push service for tokens stored in
//                          ExpoPushToken[...] format. No server key required
//                          (optional EXPO_ACCESS_TOKEN adds enhanced security).
//   • Raw FCM/APNS      — native Capacitor tokens that are NOT Expo-format have no
//                          delivery path without Firebase/APNs credentials, which
//                          are not in this repo → honest skip + log (see residual).
//
// Dead subscriptions (404/410 web, DeviceNotRegistered expo) are pruned so the
// table self-heals.
//
// SECURITY: callers pass a trusted userId/tenantId. Tenant fan-out resolves the
// member set from profiles.tenant_id — never from client input.
// ─────────────────────────────────────────────────────────────────────────────
import webpush, { WebPushError, type PushSubscription } from 'web-push';
import type { SupabaseClient } from '@supabase/supabase-js';
import { must } from '@/lib/db-write';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface PushMessage {
  title: string;
  body?: string;
  /** Deep link opened on tap (SW reads data.route || data.url). */
  url?: string;
  /** Collapse key / grouping tag. */
  tag?: string;
  /** Notification type — passed through in data for client routing. */
  type?: string;
  icon?: string;
  image?: string;
  requireInteraction?: boolean;
  /** Extra key/values merged into the push data payload. */
  data?: Record<string, unknown>;
}

export interface PushResult {
  vapidConfigured: boolean;
  tokens: number;
  webSent: number;
  webFailed: number;
  expoSent: number;
  expoFailed: number;
  skippedNoVapid: number;   // web tokens present but VAPID not configured
  skippedNoKeys: number;    // legacy web tokens missing p256dh/auth
  skippedFcmApns: number;   // native raw tokens with no delivery path (needs FCM/APNS)
  pruned: number;           // dead subscriptions removed
}

interface TokenRow {
  id: string;
  token: string;
  platform: string | null;
  p256dh?: string | null;
  auth?: string | null;
}

const EXPO_TOKEN_RE = /^Expo(nent)?PushToken\[/;

let _vapidReady: boolean | null = null;

/** Configure web-push VAPID exactly once. Returns true when keys are present. */
function ensureVapid(): boolean {
  if (_vapidReady !== null) return _vapidReady;
  const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    _vapidReady = false;
    return false;
  }
  const subject =
    process.env.VAPID_SUBJECT ||
    (process.env.EMAIL_FROM && process.env.EMAIL_FROM.includes('@')
      ? `mailto:${process.env.EMAIL_FROM.replace(/.*<([^>]+)>.*/, '$1').trim()}`
      : 'mailto:notifications@saguarocontrol.net');
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    _vapidReady = true;
  } catch (e) {
    console.error('[push] VAPID configuration failed', e);
    _vapidReady = false;
  }
  return _vapidReady;
}

function emptyResult(vapidConfigured: boolean): PushResult {
  return {
    vapidConfigured,
    tokens: 0,
    webSent: 0,
    webFailed: 0,
    expoSent: 0,
    expoFailed: 0,
    skippedNoVapid: 0,
    skippedNoKeys: 0,
    skippedFcmApns: 0,
    pruned: 0,
  };
}

/** Fetch push tokens for a set of user ids. */
async function tokensForUsers(db: SupabaseClient, userIds: string[]): Promise<TokenRow[]> {
  if (userIds.length === 0) return [];
  const { data, error } = await (db as any)
    .from('push_tokens')
    .select('id, token, platform, p256dh, auth')
    .in('user_id', userIds);
  if (error) {
    // p256dh/auth may not exist yet (pre-migration). Fall back to the base columns
    // so the sender still works for Expo tokens; web tokens will lack keys and skip.
    const { data: base } = await (db as any)
      .from('push_tokens')
      .select('id, token, platform')
      .in('user_id', userIds);
    return (base || []) as TokenRow[];
  }
  return (data || []) as TokenRow[];
}

async function pruneToken(db: SupabaseClient, id: string): Promise<void> {
  try {
    await must((db as any).from('push_tokens').delete().eq('id', id), 'push_tokens delete');
  } catch {
    /* best-effort */
  }
}

/** Send a Web Push to one browser subscription. Returns 'sent' | 'failed' | 'pruned'. */
async function sendWeb(db: SupabaseClient, row: TokenRow, payload: string): Promise<'sent' | 'failed' | 'pruned'> {
  const sub: PushSubscription = {
    endpoint: row.token,
    keys: { p256dh: row.p256dh as string, auth: row.auth as string },
  };
  try {
    await webpush.sendNotification(sub, payload, { TTL: 60 * 60 * 24 });
    return 'sent';
  } catch (e) {
    if (e instanceof WebPushError && (e.statusCode === 404 || e.statusCode === 410)) {
      await pruneToken(db, row.id);
      return 'pruned';
    }
    console.error('[push] web send failed', (e as any)?.statusCode ?? '', (e as any)?.message ?? e);
    return 'failed';
  }
}

/** Send Expo push notifications in one batch. Returns per-token outcomes. */
async function sendExpoBatch(
  db: SupabaseClient,
  rows: TokenRow[],
  msg: PushMessage,
): Promise<{ sent: number; failed: number; pruned: number }> {
  let sent = 0;
  let failed = 0;
  let pruned = 0;

  const messages = rows.map((r) => ({
    to: r.token,
    title: msg.title,
    body: msg.body || '',
    sound: 'default',
    data: { url: msg.url, route: msg.url, type: msg.type, ...(msg.data || {}) },
  }));

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;

  try {
    const resp = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers,
      body: JSON.stringify(messages),
    });
    const json: any = await resp.json().catch(() => ({}));
    const tickets: any[] = Array.isArray(json?.data) ? json.data : [];
    for (let i = 0; i < rows.length; i++) {
      const ticket = tickets[i];
      if (ticket && ticket.status === 'ok') {
        sent++;
      } else {
        failed++;
        if (ticket?.details?.error === 'DeviceNotRegistered') {
          await pruneToken(db, rows[i].id);
          pruned++;
        }
      }
    }
    if (tickets.length === 0 && !resp.ok) {
      // Whole request failed — count all as failed.
      failed = rows.length;
      sent = 0;
    }
  } catch (e) {
    console.error('[push] expo send failed', e);
    failed = rows.length;
  }

  return { sent, failed, pruned };
}

/**
 * Send a push notification to a specific set of users' registered devices.
 * Never throws — returns a summary. Honestly gates on missing VAPID / FCM creds.
 */
export async function sendPushToUsers(
  db: SupabaseClient,
  userIds: string[],
  msg: PushMessage,
): Promise<PushResult> {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  const vapidConfigured = ensureVapid();
  const result = emptyResult(vapidConfigured);
  if (uniqueIds.length === 0) return result;

  const rows = await tokensForUsers(db, uniqueIds);
  result.tokens = rows.length;
  if (rows.length === 0) return result;

  // Classify tokens.
  const expoRows: TokenRow[] = [];
  const webRows: TokenRow[] = [];
  for (const r of rows) {
    if (EXPO_TOKEN_RE.test(r.token)) {
      expoRows.push(r);
    } else if (r.platform === 'web' || (r.p256dh && r.auth)) {
      webRows.push(r);
    } else {
      // Native raw FCM/APNS token — no delivery path without Firebase/APNs creds.
      result.skippedFcmApns++;
    }
  }

  // ── Web Push ──
  if (webRows.length > 0) {
    if (!vapidConfigured) {
      result.skippedNoVapid += webRows.length;
      console.log(`[push] ${webRows.length} web token(s) skipped — VAPID keys not configured (set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY).`);
    } else {
      const payload = JSON.stringify({
        title: msg.title,
        body: msg.body || '',
        icon: msg.icon || '/icons/icon-192x192.png',
        image: msg.image,
        tag: msg.tag || msg.type || 'saguaro',
        url: msg.url,
        route: msg.url,
        type: msg.type,
        requireInteraction: !!msg.requireInteraction,
        ...(msg.data || {}),
      });
      for (const r of webRows) {
        if (!r.p256dh || !r.auth) {
          // Legacy subscription stored before keys were persisted — cannot encrypt.
          result.skippedNoKeys++;
          continue;
        }
        const outcome = await sendWeb(db, r, payload);
        if (outcome === 'sent') result.webSent++;
        else if (outcome === 'pruned') result.pruned++;
        else result.webFailed++;
      }
    }
  }

  // ── Expo Push ──
  if (expoRows.length > 0) {
    const { sent, failed, pruned } = await sendExpoBatch(db, expoRows, msg);
    result.expoSent += sent;
    result.expoFailed += failed;
    result.pruned += pruned;
  }

  return result;
}

/** Send a push to a single user's devices. */
export async function sendPushToUser(
  db: SupabaseClient,
  userId: string,
  msg: PushMessage,
): Promise<PushResult> {
  return sendPushToUsers(db, [userId], msg);
}

/**
 * Send a push to every member of a tenant (or a single member if userId is set).
 * Resolves the member set from profiles.tenant_id — used for tenant-wide
 * notifications (notifications.user_id IS NULL).
 */
export async function sendPushToTenant(
  db: SupabaseClient,
  tenantId: string,
  msg: PushMessage,
  opts?: { userId?: string | null },
): Promise<PushResult> {
  if (opts?.userId) return sendPushToUser(db, opts.userId, msg);
  const { data: members } = await (db as any)
    .from('profiles')
    .select('id')
    .eq('tenant_id', tenantId);
  const ids = ((members || []) as { id: string }[]).map((m) => m.id);
  return sendPushToUsers(db, ids, msg);
}
