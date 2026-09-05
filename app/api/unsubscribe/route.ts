import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { verifyToken } from '@/lib/signed-token';
import {
  UNSUBSCRIBE_PURPOSE,
  isNotificationType,
  allNotificationsOff,
  withCategoryOff,
} from '@/lib/unsubscribe';

/* Public by design: the signed token in the request IS the credential, so no
 * session is required. See lib/unsubscribe.ts for what was wrong before.
 */

export async function POST(req: NextRequest) {
  let body: { token?: string; type?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON' }, { status: 400 });
  }

  if (!body.token) {
    return NextResponse.json({ error: 'Missing required field: token' }, { status: 400 });
  }
  // Held in a const so the narrowing survives into the loop below.
  const type = body.type;
  if (type !== undefined && !isNotificationType(type)) {
    return NextResponse.json({ error: `Unknown notification type: ${type}` }, { status: 400 });
  }

  const email = verifyToken(UNSUBSCRIBE_PURPOSE, body.token);
  if (!email) {
    return NextResponse.json(
      { error: 'That unsubscribe link is invalid or has expired' },
      { status: 401 },
    );
  }

  try {
    const db = createServerClient();

    // Scoped by email, which the token attests to. Unsubscribes are a property
    // of the mailbox, so this is deliberately not tenant-scoped: one person may
    // appear in more than one tenant and expects one click to stop the mail.
    const { data: profiles, error: readErr } = await db
      .from('profiles')
      .select('id, email_notifications')
      .eq('email', email);

    if (readErr) throw readErr;
    // Same response whether or not the address is on file.
    if (!profiles?.length) return NextResponse.json({ success: true, email });

    for (const profile of profiles) {
      const next = type
        ? withCategoryOff(profile.email_notifications, type)
        : allNotificationsOff();

      const { error: updErr } = await db
        .from('profiles')
        .update({ email_notifications: next })
        .eq('id', profile.id);

      if (updErr) throw updErr;
    }

    return NextResponse.json({ success: true, email, type: type ?? 'all' });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    console.error('[unsubscribe] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
