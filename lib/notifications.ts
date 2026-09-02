/**
 * lib/notifications.ts
 * In-app notification system
 */
import { createServerClient } from './supabase-server';
import { sendPushToTenant, type PushMessage } from './push';
import { must } from '@/lib/db-write';

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
  sendPushToTenant(supabase, tenantId, msg, { userId }).catch((err) => {
    console.error('[notifications] push dispatch failed', err);
  });
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
    firePush(tenantId, userId, {
      title,
      body,
      url: link ? (link.startsWith('http') ? link : `${APP_URL}${link.startsWith('/') ? '' : '/'}${link}`) : `${APP_URL}/app`,
      type: String(type),
      tag: String(type),
    });
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

export async function getUnreadCount(tenantId: string, userId: string): Promise<number> {
  try {
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('is_read', false)
      .or(`user_id.eq.${userId},user_id.is.null`);
    return count || 0;
  } catch {
    return 0;
  }
}
