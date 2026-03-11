import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase-server';
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
  } catch {
    return NextResponse.json({ notifications: [] });
  }
}
