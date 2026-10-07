import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { sendPushToUser } from '@/lib/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/notifications/push-test
 *
 * Sends one test alert to every device the signed-in person has turned alerts
 * on for — only theirs, never the team's — and says how many it reached.
 */
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const db = createServerClient();
    const r = await sendPushToUser(db as never, user.id, {
      title: 'Saguaro alerts are on',
      body: 'This is a test. New sub photos, pay apps and approvals will show up like this.',
      url: '/app/notifications',
      tag: 'push-test',
      type: 'push_test',
    });
    const sent = r.webSent + r.apnsSent + r.expoSent;
    const failed = r.webFailed + r.apnsFailed + r.expoFailed;
    return NextResponse.json({
      devices: r.tokens,
      sent,
      failed,
      skipped: r.skippedNoVapid + r.skippedNoKeys + r.skippedFcmApns,
      removed: r.pruned,
    });
  } catch (e) {
    return apiError('notifications/push-test', e, "Couldn't send the test alert");
  }
}
