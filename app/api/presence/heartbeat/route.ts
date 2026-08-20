import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { page_path, project_id } = body;

    if (!page_path) {
      return NextResponse.json({ error: 'page_path required' }, { status: 400 });
    }

    const db = createServerClient();

    // Fetch user display name from profiles
    const { data: profile } = await db
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .single();

    const userName = (profile as any)?.full_name || (profile as any)?.email || user.email || 'Unknown';

    const { error } = await db
      .from('presence_sessions')
      .upsert(
        {
          tenant_id: user.tenantId,
          user_id: user.id,
          user_name: userName,
          page_path,
          project_id: project_id || null,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,page_path' }
      );

    if (error) {
      console.error('Presence heartbeat error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Presence heartbeat error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
