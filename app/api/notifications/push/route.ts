import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { sendPushToTenant } from '@/lib/push';
import type { Database } from '@/lib/database.types';
import { apiError } from '@/lib/api-error';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://saguarocontrol.net';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }

  const row = {
    tenant_id: user.tenantId,
    project_id: body.project_id || body.projectId || null,
    title: body.title || '',
    body: body.body || body.message || '',
    type: body.type || 'general',
    link: body.url || null,
    is_read: false,
  };

  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('notifications')
      .insert(row as Database['public']['Tables']['notifications']['Insert'])
      .select()
      .single();

    if (error) throw error;

    // Also fire a device/web push (best-effort, honestly gated on VAPID/Expo creds).
    const link = typeof row.link === 'string' ? row.link : '';
    sendPushToTenant(db, user.tenantId, {
      title: String(row.title || 'Notification'),
      body: String(row.body || ''),
      url: link ? (link.startsWith('http') ? link : `${APP_URL}${link.startsWith('/') ? '' : '/'}${link}`) : `${APP_URL}/app`,
      type: String(row.type || 'general'),
      tag: String(row.type || 'general'),
    }, { userId: null }).catch((e) => console.error('[notifications/push] push dispatch failed', e));

    return NextResponse.json({ success: true, notification: data });
  } catch (err: unknown) {
    return apiError('notifications/push POST', err);
  }
}
