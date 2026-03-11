import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase-server';
import { getUnreadCount } from '@/lib/notifications';

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ count: 0 });
    const count = await getUnreadCount(user.id, user.id);
    return NextResponse.json({ count });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
