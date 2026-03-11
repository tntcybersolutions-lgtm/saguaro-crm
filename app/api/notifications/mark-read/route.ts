import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase-server';
import { markRead, markAllRead } from '@/lib/notifications';

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    if (body.all) {
      await markAllRead(user.id, user.id);
    } else if (body.id) {
      await markRead(body.id);
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
