import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase-server';
import { getNotifications } from '@/lib/notifications';

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ notifications: [] });
    const notifications = await getNotifications(user.id, user.id, 30);
    return NextResponse.json({ notifications });
  } catch {
    return NextResponse.json({ notifications: [] });
  }
}
