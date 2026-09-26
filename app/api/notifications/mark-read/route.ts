import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase-server';
import { markRead, markAllRead } from '@/lib/notifications';
import { apiError } from '@/lib/api-error';

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    if (body.all) {
      /* (tenantId, userId) — the user id was in the tenant position, so
         "mark all read" matched no rows and cleared nothing for any invited
         user. Same swap as the badge and the list; all three read as working
         for the founding account, whose id IS the tenant id. */
      await markAllRead(user.tenantId, user.id);
    } else if (body.id) {
      await markRead(body.id);
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    /* Was a bare catch with a fixed string and no log, so a failure to clear
       the inbox looked the same as any other server error and left nothing to
       trace. */
    return apiError('notifications/mark-read', e, 'Could not update your notifications');
  }
}
