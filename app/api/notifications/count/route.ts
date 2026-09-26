import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase-server';
import { getUnreadCount } from '@/lib/notifications';
import { apiError } from '@/lib/api-error';

/**
 * GET /api/notifications/count — the unread badge.
 *
 * THIS RETURNED ZERO FOR ALMOST EVERYONE.
 *
 * getUnreadCount's signature is (tenantId, userId). The call was
 * getUnreadCount(user.id, user.id), so the query filtered
 * `tenant_id = <the caller's own user id>`. Both parameters are strings
 * holding UUIDs, so TypeScript had nothing to object to.
 *
 * It only worked for one kind of user. A tenant's id in this database IS the
 * founding user's auth id, so for the person who created the company the two
 * arguments happen to be equal and the count came out right. For everybody
 * invited afterwards — which is most of the people using a team product —
 * tenant_id matched nothing and the badge sat at zero while notifications
 * piled up behind it.
 *
 * Measured against production before the fix: five real accounts each had one
 * unread notification and a badge showing none. Every founding account was
 * correct, which is exactly why it survived: whoever checked it was the owner.
 */
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  /* Was `return { count: 0 }` on no user. An expired session then rendered a
     clean badge, which tells someone their queue is empty at the moment they
     most need to be told to sign in again. 401 lets the client refresh the
     session — the field app's authedFetch retries on exactly this. */
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const count = await getUnreadCount(user.tenantId, user.id);
    return NextResponse.json({ count });
  } catch (e) {
    /* Was a bare `catch { return { count: 0 } }`. A failing query and an empty
       inbox produced the same answer, so this bug could never have announced
       itself. */
    return apiError('notifications/count', e, 'Could not load your notifications');
  }
}
