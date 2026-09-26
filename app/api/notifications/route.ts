import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { getNotifications } from '@/lib/notifications';

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    /* Was `return { notifications: [] }` on no user, which renders an empty
       inbox instead of sending an expired session to sign in again. */
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    /* getNotifications is (tenantId, userId). This passed the USER id in the
       tenant position, so the query filtered tenant_id by a user id and
       returned nothing for anyone whose id is not also their tenant's — which
       is everybody invited to a company, since a tenant's id here is the
       FOUNDER's auth id. Both parameters are strings holding UUIDs, so
       TypeScript had nothing to object to, and for the owner the two happen to
       be equal, so whoever checked it saw it working. */
    const raw = await getNotifications(user.tenantId, user.id, 30);
    // Map DB schema (is_read, body) to client schema (read, body)
    const notifications = raw.map((n: any) => ({
      id: n.id,
      type: n.type || 'default',
      title: n.title || '',
      body: n.body || n.message || '',
      link: n.link || '',
      read: !!n.is_read,
      created_at: n.created_at,
    }));
    return NextResponse.json({ notifications });
  } catch (e) {
    // A failed read must NOT render as an empty list. The screen would say
    // "no notifications" with total confidence when the truth is that the query
    // failed — and the old body carried source:'error', which no screen has
    // ever read. Real status, real server-side log, correlation id.
    return apiError('notifications', e, 'Could not load notifications');
  }
}
