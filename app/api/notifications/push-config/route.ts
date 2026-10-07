import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { apnsConfigFromEnv } from '@/lib/push-apns';

export const dynamic = 'force-dynamic';

/**
 * GET /api/notifications/push-config
 *
 * What this server can deliver to, and how many devices this person has
 * signed up. The public VAPID key is served here (not baked in at build) so
 * setting the keys in the environment is enough — no rebuild.
 */
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    // tenant_id is not in the (stale) generated types for push_tokens.
    const db = createServerClient() as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
    const { data, error } = await db
      .from('push_tokens')
      .select('platform')
      .eq('user_id', user.id)
      .eq('tenant_id', user.tenantId);
    if (error) throw error;
    const rows = (data || []) as { platform: string | null }[];
    const webKey = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null;
    return NextResponse.json({
      webPublicKey: webKey && process.env.VAPID_PRIVATE_KEY ? webKey : null,
      iosReady: !!apnsConfigFromEnv(),
      devices: {
        web: rows.filter((r) => r.platform === 'web').length,
        ios: rows.filter((r) => r.platform === 'ios').length,
        total: rows.length,
      },
    });
  } catch (e) {
    return apiError('notifications/push-config', e);
  }
}
