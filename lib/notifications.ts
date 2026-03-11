/**
 * lib/notifications.ts
 * In-app notification system
 */
import { createServerClient } from './supabase-server';

const supabase = createServerClient();

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
    await supabase.from('notifications').insert({
      tenant_id: tenantId,
      user_id: userId,
      type,
      title,
      body,
      link: link || null,
      project_id: projectId || null,
      is_read: false,
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
    await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', notificationId);
  } catch (err) {
    console.error('[markRead]', err);
  }
}

export async function markAllRead(tenantId: string, userId: string): Promise<void> {
  try {
    await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .or(`user_id.eq.${userId},user_id.is.null`)
      .eq('is_read', false);
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
