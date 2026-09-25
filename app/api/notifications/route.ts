import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { getNotifications } from '@/lib/notifications';

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ notifications: [] });
    const raw = await getNotifications(user.id, user.id, 30);
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
