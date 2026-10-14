/**
 * lib/notifications.ts
 * In-app notification system
 */
import { createServerClient } from './supabase-server';
import { sendPushToTenant, type PushMessage } from './push';
import { must } from '@/lib/db-write';
import { sendNotificationEmail } from './email';
import { runInBackground } from './background';

const supabase = createServerClient();

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://saguarocontrol.net';

/**
 * Fire a device/web push for an in-app notification. Best-effort and fire-and-forget:
 * push delivery must never block or fail the notification write. Honestly gated —
 * lib/push skips (logs) when VAPID/Expo creds are missing.
 */
function firePush(
  tenantId: string,
  userId: string | null,
  msg: PushMessage,
): void {
  // Kept alive past the response (waitUntil) so the push actually goes out.
  runInBackground(sendPushToTenant(supabase, tenantId, msg, { userId }), 'push dispatch');
}

/**
 * Email the people a notification is for. A notification for one user goes to
 * that user; a company-wide one (userId null) goes to the company's admins and
 * owners. Anyone who turned notifications off (profiles.notifications_enabled
 * = false) is skipped. Never throws and never blocks the in-app notification
 * longer than 5 seconds.
 */
async function emailRecipients(tenantId: string, userId: string | null): Promise<string[]> {
  let q = supabase.from('profiles').select('email, notifications_enabled').eq('tenant_id', tenantId);
  // Roles are stored in mixed case ('admin', 'Owner'), so match without case.
  q = userId ? q.eq('id', userId) : q.or('role.ilike.admin,role.ilike.owner');
  const { data, error } = await q;
  if (error) throw error;
  const out = new Set<string>();
  for (const r of (data || []) as Array<{ email: string | null; notifications_enabled: boolean | null }>) {
    const e = (r.email || '').trim().toLowerCase();
    if (e && r.notifications_enabled !== false) out.add(e);
  }
  return [...out];
}

/* Live radio traffic (every push-to-talk clip and shared photo) is a chat
   stream: it goes to the phone by push, not to the inbox. A panic alarm sends
   its own email (with the map link) from /api/radio/panic, so not twice. */
const NO_EMAIL_TYPES = new Set(['radio_voice', 'radio_media', 'radio_panic']);

async function emailNotification(tenantId: string, userId: string | null, type: string, title: string, body: string, url: string): Promise<void> {
  if (NO_EMAIL_TYPES.has(type)) return;
  try {
    const to = await emailRecipients(tenantId, userId);
    if (!to.length) return;
    const work = Promise.all(to.map((addr) => sendNotificationEmail(addr, title, body, url)));
    await Promise.race([work, new Promise((r) => setTimeout(r, 5000))]);
  } catch (err) {
    console.error('[notifications] email dispatch failed', err);
  }
}

export interface Notification {
  id: string;
  tenant_id: string;
  user_id?: string | null;
  project_id?: string | null;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  is_read: boolean;
  created_at: string;
}

export type NotificationType =
  | 'pay_app_submitted' | 'pay_app_approved' | 'pay_app_certified'
  | 'bid_package_created' | 'bid_submitted' | 'bid_awarded'
  | 'rfi_submitted' | 'rfi_answered'
  | 'change_order_approved'
  | 'insurance_expiring' | 'insurance_expired'
  | 'lien_waiver_requested' | 'lien_waiver_signed'
  | 'w9_requested' | 'w9_submitted'
  | 'document_generated' | 'trial_expiring'
  | 'sub_added' | 'project_created' | 'autopilot_alert';

export async function createNotification(
  tenantId: string,
  userId: string | null,
  type: NotificationType | string,
  title: string,
  body: string,
  link?: string,
  projectId?: string
): Promise<void> {
  try {
    await must(supabase.from('notifications').insert({
      tenant_id: tenantId,
      user_id: userId,
      type,
      title,
      body,
      link: link || null,
      project_id: projectId || null,
      is_read: false,
    }), 'notifications insert');

    // Fire a device/web push so the in-app notification also reaches the phone /
    // desktop. Fire-and-forget — never blocks or fails the notification write.
    const url = link ? (link.startsWith('http') ? link : `${APP_URL}${link.startsWith('/') ? '' : '/'}${link}`) : `${APP_URL}/app`;
    firePush(tenantId, userId, {
      title,
      body,
      url,
      type: String(type),
      tag: String(type),
    });
    // And by email, so people who are not in the app still hear about it.
    await emailNotification(tenantId, userId, String(type), title, body, url);
  } catch (err) {
    console.error('[createNotification]', err);
  }
}

export async function getUnread(tenantId: string, userId: string, limit = 10): Promise<Notification[]> {
  try {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_read', false)
      .or(`user_id.eq.${userId},user_id.is.null`)
      .order('created_at', { ascending: false })
      .limit(limit);
    return (data || []) as Notification[];
  } catch {
    return [];
  }
}

export async function getNotifications(tenantId: string, userId: string, limit = 30): Promise<Notification[]> {
  try {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('tenant_id', tenantId)
      .or(`user_id.eq.${userId},user_id.is.null`)
      .order('created_at', { ascending: false })
      .limit(limit);
    return (data || []) as Notification[];
  } catch {
    return [];
  }
}

export async function markRead(notificationId: string): Promise<void> {
  try {
    await must(supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', notificationId), 'notifications write');
  } catch (err) {
    console.error('[markRead]', err);
  }
}

export async function markAllRead(tenantId: string, userId: string): Promise<void> {
  try {
    await must(supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .or(`user_id.eq.${userId},user_id.is.null`)
      .eq('is_read', false), 'notifications write');
  } catch (err) {
    console.error('[markAllRead]', err);
  }
}

/**
 * Unread notifications for one person.
 *
 * ARGUMENT ORDER MATTERS AND NOTHING ENFORCES IT. Both parameters are strings
 * holding UUIDs, so passing them the wrong way round typechecks perfectly —
 * which is what /api/notifications/count did, calling this as
 * getUnreadCount(user.id, user.id) and filtering tenant_id by a user id. The
 * badge read zero for every user who was not their company's founder.
 */
export async function getUnreadCount(tenantId: string, userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('is_read', false)
    .or(`user_id.eq.${userId},user_id.is.null`);
  /* Was `catch { return 0 }`. A failing query and an empty inbox gave the same
     answer, so the wrong-argument bug above had no way to announce itself.
     Throw and let the caller decide what to show. */
  if (error) throw error;
  return count || 0;
}
