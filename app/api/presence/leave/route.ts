import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function DELETE(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { page_path } = body;

    if (!page_path) {
      return NextResponse.json({ error: 'page_path required' }, { status: 400 });
    }

    const db = createServerClient();

    const { error } = await db
      .from('presence_sessions')
      .delete()
      .eq('user_id', user.id)
      .eq('tenant_id', user.tenantId)
      .eq('page_path', page_path);

    if (error) {
      console.error('Presence leave error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Presence leave error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
