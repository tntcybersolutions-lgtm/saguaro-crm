import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

/**
 * POST /api/notifications/push-token
 * Registers a Capacitor FCM/APNS push token for the authenticated user.
 * Called by lib/native.ts → registerForPush() when running in a native shell.
 */
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const { token, platform } = body as { token?: string; platform?: string };

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'token is required' }, { status: 400 });
    }

    const db = createServerClient();
    const tbl = (db as unknown as { from: (t: string) => any }).from('push_tokens'); // eslint-disable-line @typescript-eslint/no-explicit-any

    // Upsert: one row per user+token combo. Update platform on conflict.
    // tenant_id is written through a permissive handle (not in the stale types).
    const { error } = await tbl.upsert(
      {
        user_id: user.id,
        tenant_id: user.tenantId,
        token,
        platform: platform ?? 'unknown',
      },
      { onConflict: 'user_id,token' },
    );

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('notifications/push-token', e);
  }
}

/**
 * DELETE /api/notifications/push-token
 * Removes a push token on logout / permission revocation.
 */
export async function DELETE(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const { token } = body as { token?: string };

    if (!token) return NextResponse.json({ error: 'token is required' }, { status: 400 });

    const db = createServerClient();
    const { error } = await db
      .from('push_tokens')
      .delete()
      .eq('user_id', user.id)
      .eq('token', token);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('notifications/push-token', e);
  }
}
