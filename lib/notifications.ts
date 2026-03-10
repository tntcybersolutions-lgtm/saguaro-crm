import { supabaseAdmin } from '../supabase/admin';

export interface Notification {
  id: string;
  tenant_id: string;
  user_id?: string | null;
  project_id?: string | null;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  read: boolean;
  created_at: string;
}

export interface CreateNotificationParams {
  tenantId: string;
  userId?: string;
  projectId?: string;
  type: string;
  title: string;
  body: string;
  link?: string;
}

// ─── createNotification ───────────────────────────────────────────────────────

export async function createNotification(params: CreateNotificationParams): Promise<void> {
  try {
    const { tenantId, userId, projectId, type, title, body, link } = params;

    const { error } = await supabaseAdmin.from('notifications').insert({
      tenant_id: tenantId,
      user_id: userId ?? null,
      project_id: projectId ?? null,
      type,
      title,
      body,
      link: link ?? null,
      read: false,
    });

    if (error) {
      console.error('[createNotification] Supabase error:', error.message);
    }
  } catch (err) {
    console.error('[createNotification] Unexpected error:', err);
  }
}

// ─── markRead ─────────────────────────────────────────────────────────────────

export async function markRead(notificationId: string): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId);

    if (error) {
      console.error('[markRead] Supabase error:', error.message);
    }
  } catch (err) {
    console.error('[markRead] Unexpected error:', err);
  }
}

// ─── getUnread ────────────────────────────────────────────────────────────────

export async function getUnread(tenantId: string, userId?: string): Promise<Notification[]> {
  try {
    let query = supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('read', false)
      .order('created_at', { ascending: false });

    if (userId) {
      query = query.or(`user_id.eq.${userId},user_id.is.null`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[getUnread] Supabase error:', error.message);
      return [];
    }

    return (data ?? []) as Notification[];
  } catch (err) {
    console.error('[getUnread] Unexpected error:', err);
    return [];
  }
}

// ─── getNotifications ─────────────────────────────────────────────────────────

export async function getNotifications(tenantId: string, limit = 50): Promise<Notification[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[getNotifications] Supabase error:', error.message);
      return [];
    }

    return (data ?? []) as Notification[];
  } catch (err) {
    console.error('[getNotifications] Unexpected error:', err);
    return [];
  }
}

// ─── markAllRead ──────────────────────────────────────────────────────────────

export async function markAllRead(userId: string): Promise<void> {
  try {
    await supabaseAdmin
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false);
  } catch (err) {
    console.error('[markAllRead] Unexpected error:', err);
  }
}

// ─── getUnreadCount ───────────────────────────────────────────────────────────

export async function getUnreadCount(userId: string): Promise<number> {
  try {
    const { count } = await supabaseAdmin
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false);
    return count || 0;
  } catch {
    return 0;
  }
}

// ─── NotificationData type (simplified interface for document-triggers) ───────

export type NotificationType =
  | 'pay_app_approved' | 'pay_app_submitted'
  | 'insurance_expiring' | 'insurance_expired'
  | 'rfi_submitted' | 'rfi_answered'
  | 'lien_waiver_signed' | 'lien_waiver_requested'
  | 'sub_added' | 'sub_accepted'
  | 'change_order_approved' | 'autopilot_alert'
  | 'document_generated' | 'trial_expiring'
  | 'document_ready';
