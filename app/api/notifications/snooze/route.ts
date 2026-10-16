import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

import { apiError } from '@/lib/api-error';
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { notification_id, snooze_until } = body;

    if (!notification_id) {
      return NextResponse.json({ error: 'notification_id required' }, { status: 400 });
    }
    if (!snooze_until) {
      return NextResponse.json({ error: 'snooze_until required' }, { status: 400 });
    }

    // Validate timestamp
    const parsed = new Date(snooze_until);
    if (isNaN(parsed.getTime())) {
      return NextResponse.json({ error: 'Invalid snooze_until timestamp' }, { status: 400 });
    }

    const db = createServerClient();

    const { error } = await db
      .from('notifications')
      .update({
        snoozed_until: parsed.toISOString(),
        is_read: true,
      })
      .eq('id', notification_id)
      .eq('tenant_id', user.tenantId);

    if (error) {
      console.error('Notification snooze error:', error.message);
      return apiError('notifications/snooze', error, undefined, 500);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return apiError('notifications/snooze POST', err);
  }
}
