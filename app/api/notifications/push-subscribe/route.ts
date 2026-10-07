import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/**
 * POST /api/notifications/push-subscribe
 * Registers a Web Push subscription for the authenticated user.
 * Called by app/field/more/notifications/page.tsx after the browser grants
 * Notification permission and creates a PushSubscription.
 *
 * Request body: { subscription: PushSubscriptionJSON, userId: string }
 *   - subscription.endpoint is used as the unique token.
 * Response: { success: true }
 *
 * Stored in push_tokens (columns: id, user_id, tenant_id, token, platform,
 * p256dh, auth, created_at). The p256dh + auth keys are REQUIRED for the sender
 * (lib/push) to encrypt the Web Push payload — without them the endpoint is
 * unusable, so we persist the full subscription, not just the endpoint.
 *
 * There is no DB-level unique constraint on `token`, so we de-dupe manually
 * (check-then-insert) instead of relying on upsert/onConflict.
 */
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const { subscription } = body as {
      subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      userId?: string;
    };

    const token = subscription?.endpoint;
    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        { error: 'subscription.endpoint is required' },
        { status: 400 },
      );
    }

    const p256dh = subscription?.keys?.p256dh ?? null;
    const auth = subscription?.keys?.auth ?? null;

    // p256dh/auth/tenant_id are not in the (stale) generated types, so write
    // through a permissive handle. Identifiers are fixed literals, still scoped.
    const db = createServerClient();
    const tbl = (db as unknown as { from: (t: string) => any }).from('push_tokens'); // eslint-disable-line @typescript-eslint/no-explicit-any

    // De-dupe by token (no unique index exists, so look it up first).
    const { data: existing } = await tbl
      .select('id')
      .eq('token', token)
      .maybeSingle();

    if (existing?.id) {
      // Re-point an existing endpoint at the current user + refresh its keys.
      const { error } = await tbl
        .update({ user_id: user.id, tenant_id: user.tenantId, platform: 'web', p256dh, auth })
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await tbl.insert({
        user_id: user.id,
        tenant_id: user.tenantId,
        token,
        platform: 'web',
        p256dh,
        auth,
      });
      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('notifications/push-subscribe', e);
  }
}
